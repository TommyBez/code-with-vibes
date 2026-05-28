import "server-only"

/**
 * Spotify Web API client.
 *
 * - Uses the Client Credentials flow because we only read PUBLIC catalog data
 *   (tracks/albums). No user data is accessed, so no user auth/scopes are needed.
 * - The Client Secret is read from a server-only module and never sent to the browser.
 * - Endpoint paths and response field names follow the official OpenAPI schema:
 *   GET /tracks/{id} and GET /albums/{id}.
 * - Tokens are cached in memory and refreshed automatically before expiry.
 * - 429 responses are honored via the Retry-After header with exponential backoff.
 * - Per Spotify Developer Terms, catalog content is fetched for immediate display
 *   only (short ISR revalidation) and images are referenced from Spotify's CDN,
 *   never downloaded or persisted.
 */

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token"
const API_BASE = "https://api.spotify.com/v1"

// How long (seconds) resolved catalog data may be reused for immediate display.
const CATALOG_REVALIDATE_SECONDS = 3600

export type SpotifyResourceType = "track" | "album"

export interface SpotifyImage {
  url: string
  width: number | null
  height: number | null
}

export interface ResolvedSpotifyResource {
  type: SpotifyResourceType
  id: string
  name: string
  artists: string
  image: SpotifyImage | null
  spotifyUrl: string
  embedUrl: string
}

interface CachedToken {
  accessToken: string
  expiresAt: number // epoch ms
}

let tokenCache: CachedToken | null = null
let inFlightToken: Promise<string> | null = null

function getCredentials(): { id: string; secret: string } | null {
  const id = process.env.SPOTIFY_CLIENT_ID
  const secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) return null
  return { id, secret }
}

async function requestAccessToken(): Promise<string> {
  const creds = getCredentials()
  if (!creds) {
    throw new Error("Spotify credentials are not configured.")
  }

  const basic = Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    // Never cache token responses.
    cache: "no-store",
  })

  if (!res.ok) {
    const detail = await safeReadError(res)
    throw new Error(
      `Failed to obtain Spotify access token (${res.status}): ${detail}`,
    )
  }

  const data = (await res.json()) as {
    access_token: string
    expires_in: number
  }

  // Refresh 60s early to avoid using a token that expires mid-request.
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }

  return data.access_token
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken
  }
  // De-duplicate concurrent token refreshes.
  if (!inFlightToken) {
    inFlightToken = requestAccessToken().finally(() => {
      inFlightToken = null
    })
  }
  return inFlightToken
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string } | string
      error_description?: string
    }
    if (typeof body.error === "string") {
      return body.error_description || body.error
    }
    return body.error?.message || res.statusText
  } catch {
    return res.statusText
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Authenticated GET against the Spotify API with token refresh, Retry-After
 * handling, and exponential backoff for 429/5xx responses.
 */
async function spotifyGet<T>(
  path: string,
  { maxRetries = 3 }: { maxRetries?: number } = {},
): Promise<T> {
  let attempt = 0

  // Loop handles: one retry after a 401 (forced token refresh) plus backoff retries.
  while (true) {
    const token = await getAccessToken()

    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      // ISR: reuse for immediate display only, then revalidate against Spotify.
      next: { revalidate: CATALOG_REVALIDATE_SECONDS },
    })

    if (res.ok) {
      return (await res.json()) as T
    }

    // Expired/invalid token: force a refresh once and retry immediately.
    if (res.status === 401 && attempt === 0) {
      tokenCache = null
      attempt += 1
      continue
    }

    // Rate limited: respect Retry-After, then back off. Never tight-loop.
    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get("Retry-After")) || 0
      const backoff = Math.min(2 ** attempt, 8) // 1s, 2s, 4s, capped at 8s
      const waitSeconds = Math.max(retryAfter, backoff)
      await sleep(waitSeconds * 1000)
      attempt += 1
      continue
    }

    // Transient server errors: exponential backoff.
    if (res.status >= 500 && attempt < maxRetries) {
      await sleep(Math.min(2 ** attempt, 8) * 1000)
      attempt += 1
      continue
    }

    // Non-retryable (400, 403, 404, exhausted retries, etc.).
    const detail = await safeReadError(res)
    const error = new Error(detail) as Error & { status?: number }
    error.status = res.status
    throw error
  }
}

const SPOTIFY_URL_PATTERN =
  /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album)\/|spotify:(track|album):)([A-Za-z0-9]+)/

/** Parse a Spotify share URL or URI into a resource type + id. */
export function parseSpotifyUrl(
  url: string,
): { type: SpotifyResourceType; id: string } | null {
  const match = url.match(SPOTIFY_URL_PATTERN)
  if (!match) return null
  const type = (match[1] || match[2]) as SpotifyResourceType
  const id = match[3]
  if (!type || !id) return null
  return { type, id }
}

interface SpotifyArtistRef {
  name: string
}

interface SpotifyTrackResponse {
  id: string
  name: string
  artists: SpotifyArtistRef[]
  album: { images: SpotifyImage[] }
  external_urls: { spotify: string }
}

interface SpotifyAlbumResponse {
  id: string
  name: string
  artists: SpotifyArtistRef[]
  images: SpotifyImage[]
  external_urls: { spotify: string }
}

function pickImage(images: SpotifyImage[]): SpotifyImage | null {
  if (!images?.length) return null
  // Prefer a mid-sized cover (~300px) for crisp display without overfetching.
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
  return sorted.find((img) => (img.width ?? 0) <= 400) ?? sorted[0]
}

/**
 * Resolve a Spotify track/album URL into display metadata.
 * Returns null when the URL is not a Spotify link or credentials are missing,
 * so callers can gracefully fall back to a plain link.
 */
export async function resolveSpotifyResource(
  url: string,
): Promise<ResolvedSpotifyResource | null> {
  const parsed = parseSpotifyUrl(url)
  if (!parsed) return null
  if (!getCredentials()) return null

  const { type, id } = parsed

  try {
    if (type === "track") {
      const track = await spotifyGet<SpotifyTrackResponse>(`/tracks/${id}`)
      return {
        type,
        id: track.id,
        name: track.name,
        artists: track.artists.map((a) => a.name).join(", "),
        image: pickImage(track.album.images),
        spotifyUrl: track.external_urls.spotify,
        embedUrl: `https://open.spotify.com/embed/track/${track.id}?utm_source=generator`,
      }
    }

    const album = await spotifyGet<SpotifyAlbumResponse>(`/albums/${id}`)
    return {
      type,
      id: album.id,
      name: album.name,
      artists: album.artists.map((a) => a.name).join(", "),
      image: pickImage(album.images),
      spotifyUrl: album.external_urls.spotify,
      embedUrl: `https://open.spotify.com/embed/album/${album.id}?utm_source=generator`,
    }
  } catch (error) {
    const status = (error as { status?: number }).status
    console.log(
      `[v0] Spotify resolve failed for ${type}/${id}` +
        (status ? ` (status ${status})` : "") +
        `: ${(error as Error).message}`,
    )
    // Fall back to a plain link rather than breaking the page.
    return null
  }
}
