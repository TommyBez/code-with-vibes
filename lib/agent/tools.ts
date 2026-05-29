import "server-only"
import { getTasteProfile } from "../spotify-user"
import { resolveSpotifyResource } from "../spotify"

/**
 * Agent tool steps. Each is a `"use step"` function so the Workflow runtime
 * gives it automatic retries and persists its result for durable replay.
 */

/** Fetch the blog owner's real Spotify taste to ground song selection. */
export async function fetchTasteProfile() {
  "use step"
  const profile = await getTasteProfile()
  return {
    topTracks: profile.topTracksMedium.map((t) => ({
      title: t.name,
      artist: t.artists,
      url: t.url,
    })),
    topArtists: profile.topArtistsMedium.map((a) => ({ name: a.name, genres: a.genres })),
    recent: profile.recentlyPlayed.map((t) => ({
      title: t.name,
      artist: t.artists,
      url: t.url,
    })),
  }
}

/**
 * Verify a candidate Spotify URL actually resolves via the public catalog API.
 * Returns canonical metadata (or null) so the agent can self-correct before
 * committing to a pairing.
 */
export async function verifySpotifyUrl({ url }: { url: string }) {
  "use step"
  const resolved = await resolveSpotifyResource(url)
  if (!resolved) return { ok: false as const, reason: "URL did not resolve to a track or album." }
  return {
    ok: true as const,
    type: resolved.type,
    title: resolved.name,
    artist: resolved.artists,
    canonicalUrl: resolved.spotifyUrl,
    image: resolved.image?.url ?? null,
  }
}
