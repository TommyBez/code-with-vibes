import "server-only"

/**
 * Spotify Web API client for the blog owner's PERSONAL account.
 *
 * - Uses the Authorization Code flow (secure backend variant): a long-lived
 *   refresh token is obtained once via the connect flow and stored as
 *   SPOTIFY_REFRESH_TOKEN. The Client Secret never leaves the server.
 * - Requests only the MINIMUM scopes needed to understand listening taste:
 *   `user-top-read` and `user-read-recently-played`. No broad/write scopes.
 * - Implements token refresh, Retry-After handling, and exponential backoff
 *   for 429/5xx, identical in spirit to the public catalog client.
 * - Per the Developer Terms, this data is used only to inform an editorial
 *   song pairing for the immediate post; it is never persisted wholesale,
 *   used to train models, or exposed to the client.
 */

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token"
const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize"
const API_BASE = "https://api.spotify.com/v1"

/** Minimum scopes required for taste analysis. Do not expand preemptively. */
export const SPOTIFY_USER_SCOPES = [
  "user-top-read",
  "user-read-recently-played",
] as const

export interface SpotifyTasteTrack {
  name: string
  artists: string
  album: string
  url: string
  uri: string
}

export interface SpotifyTasteArtist {
  name: string
  genres: string[]
  url: string
}

interface CachedToken {
  accessToken: string
  expiresAt: number
}

let tokenCache: CachedToken | null = null
let inFlightToken: Promise<string> | null = null

function getClientCredentials(): { id: string; secret: string } {
  const id = process.env.SPOTIFY_CLIENT_ID
  const secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) {
    throw new Error("Spotify client credentials are not configured.")
  }
  return { id, secret }
}

export function hasUserAuth(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
      process.env.SPOTIFY_CLIENT_SECRET &&
      process.env.SPOTIFY_REFRESH_TOKEN,
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string } | string
      error_description?: string
    }
    if (typeof body.error === "string") return body.error_description || body.error
    return body.error?.message || res.statusText
  } catch {
    return res.statusText
  }
}

/**
 * Build the authorize URL for the connect flow.
 * Redirect URIs must be HTTPS (or http://127.0.0.1 for local dev) and match
 * exactly what is registered in the Spotify dashboard.
 */
export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const { id } = getClientCredentials()
  const params = new URLSearchParams({
    client_id: id,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_USER_SCOPES.join(" "),
    state,
    show_dialog: "true",
  })
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`
}

/** Exchange an authorization code for tokens (returns the refresh token to store). */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string; scope: string }> {
  const { id, secret } = getClientCredentials()
  const basic = Buffer.from(`${id}:${secret}`).toString("base64")

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await safeReadError(res)}`)
  }

  const data = (await res.json()) as { refresh_token: string; scope: string }
  return { refreshToken: data.refresh_token, scope: data.scope }
}

async function refreshAccessToken(): Promise<string> {
  const { id, secret } = getClientCredentials()
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN
  if (!refreshToken) {
    throw new Error(
      "SPOTIFY_REFRESH_TOKEN is not set. Connect the owner's Spotify account first.",
    )
  }

  const basic = Buffer.from(`${id}:${secret}`).toString("base64")
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await safeReadError(res)}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return data.access_token
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.accessToken
  if (!inFlightToken) {
    inFlightToken = refreshAccessToken().finally(() => {
      inFlightToken = null
    })
  }
  return inFlightToken
}

async function userGet<T>(path: string, { maxRetries = 3 }: { maxRetries?: number } = {}): Promise<T> {
  let attempt = 0
  while (true) {
    const token = await getAccessToken()
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })

    if (res.ok) return (await res.json()) as T

    if (res.status === 401 && attempt === 0) {
      tokenCache = null
      attempt += 1
      continue
    }
    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get("Retry-After")) || 0
      const backoff = Math.min(2 ** attempt, 8)
      await sleep(Math.max(retryAfter, backoff) * 1000)
      attempt += 1
      continue
    }
    if (res.status >= 500 && attempt < maxRetries) {
      await sleep(Math.min(2 ** attempt, 8) * 1000)
      attempt += 1
      continue
    }

    const detail = await safeReadError(res)
    const error = new Error(detail) as Error & { status?: number }
    error.status = res.status
    throw error
  }
}

interface TopTracksResponse {
  items: Array<{
    name: string
    uri: string
    external_urls: { spotify: string }
    album: { name: string }
    artists: Array<{ name: string }>
  }>
}

interface TopArtistsResponse {
  items: Array<{
    name: string
    genres: string[]
    external_urls: { spotify: string }
  }>
}

/** time_range: short_term (~4 weeks), medium_term (~6 months), long_term (years). */
export async function getTopTracks(
  timeRange: "short_term" | "medium_term" | "long_term" = "medium_term",
  limit = 20,
): Promise<SpotifyTasteTrack[]> {
  const data = await userGet<TopTracksResponse>(
    `/me/top/tracks?time_range=${timeRange}&limit=${limit}`,
  )
  return data.items.map((t) => ({
    name: t.name,
    artists: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    url: t.external_urls.spotify,
    uri: t.uri,
  }))
}

export async function getTopArtists(
  timeRange: "short_term" | "medium_term" | "long_term" = "medium_term",
  limit = 15,
): Promise<SpotifyTasteArtist[]> {
  const data = await userGet<TopArtistsResponse>(
    `/me/top/artists?time_range=${timeRange}&limit=${limit}`,
  )
  return data.items.map((a) => ({
    name: a.name,
    genres: a.genres,
    url: a.external_urls.spotify,
  }))
}

interface RecentlyPlayedResponse {
  items: Array<{
    track: {
      name: string
      uri: string
      external_urls: { spotify: string }
      album: { name: string }
      artists: Array<{ name: string }>
    }
  }>
}

export async function getRecentlyPlayed(limit = 20): Promise<SpotifyTasteTrack[]> {
  const data = await userGet<RecentlyPlayedResponse>(
    `/me/player/recently-played?limit=${limit}`,
  )
  return data.items.map(({ track: t }) => ({
    name: t.name,
    artists: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    url: t.external_urls.spotify,
    uri: t.uri,
  }))
}

export interface SpotifyTasteProfile {
  topTracksMedium: SpotifyTasteTrack[]
  topArtistsMedium: SpotifyTasteArtist[]
  recentlyPlayed: SpotifyTasteTrack[]
}

/** Aggregate a compact taste profile the agent can reason over. */
export async function getTasteProfile(): Promise<SpotifyTasteProfile> {
  const [topTracksMedium, topArtistsMedium, recentlyPlayed] = await Promise.all([
    getTopTracks("medium_term", 20),
    getTopArtists("medium_term", 15),
    getRecentlyPlayed(20),
  ])
  return { topTracksMedium, topArtistsMedium, recentlyPlayed }
}
