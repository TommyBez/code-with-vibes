import "server-only"
import { tool } from "ai"
import { z } from "zod"
import { getTasteProfile } from "../spotify-user"
import { resolveSpotifyResource } from "../spotify"
import { firecrawlSearch, firecrawlScrape } from "../research/firecrawl"

/**
 * Domain tools for the autonomous publishing agent.
 *
 * These are plain AI SDK tools (not `"use step"` functions). The DurableAgent
 * loop persists each tool call + result for durable replay, so explicit steps
 * are unnecessary here — and keeping them as plain tools lets them compose with
 * the `bash`/`readFile`/`writeFile` tools created by `bash-tool`.
 *
 * Research browsing is intentionally NOT a tool: the agent drives the
 * `agent-browser` CLI directly through `bash` whenever it wants to read a page.
 */
export const domainTools = {
  firecrawlSearch: tool({
    description:
      "Search the web (web + news) for current AI / developer-tooling developments. Use this to discover fresh, specific topics to write about. Returns candidate sources with title, url, and a short snippet.",
    inputSchema: z.object({
      query: z.string().describe("Search query, e.g. 'new AI coding agent release this week'"),
      limit: z.number().int().min(1).max(10).optional().describe("Max results (default 8)"),
    }),
    execute: async ({ query, limit }) => {
      const sources = await firecrawlSearch(query, limit ?? 8)
      return {
        results: sources.map((s) => ({ title: s.title, url: s.url, snippet: s.snippet })),
      }
    },
  }),

  firecrawlScrape: tool({
    description:
      "Scrape a single URL into clean markdown for deep reading. Use after firecrawlSearch (or agent-browser) to pull the full text of a promising source before citing it.",
    inputSchema: z.object({
      url: z.string().describe("The absolute URL to scrape"),
    }),
    execute: async ({ url }) => {
      const source = await firecrawlScrape(url)
      return { title: source.title, url: source.url, content: source.content }
    },
  }),

  fetchTasteProfile: tool({
    description:
      "Get the blog owner's real Spotify taste (top tracks, top artists, recently played). Use this to choose an authentic song pairing with a valid Spotify URL.",
    inputSchema: z.object({}),
    execute: async () => {
      const profile = await getTasteProfile()
      return {
        topTracks: profile.topTracksMedium.map((t) => ({ title: t.name, artist: t.artists, url: t.url })),
        topArtists: profile.topArtistsMedium.map((a) => ({ name: a.name, genres: a.genres })),
        recent: profile.recentlyPlayed.map((t) => ({ title: t.name, artist: t.artists, url: t.url })),
      }
    },
  }),

  verifySpotifyUrl: tool({
    description:
      "Verify a Spotify track/album URL resolves to real catalog metadata. ALWAYS call this on your chosen song URL before writing it into the post, and use the returned canonical title/artist/url.",
    inputSchema: z.object({ url: z.string().describe("An open.spotify.com track or album URL") }),
    execute: async ({ url }) => {
      const resolved = await resolveSpotifyResource(url)
      if (!resolved) return { ok: false as const, reason: "URL did not resolve to a track or album." }
      return {
        ok: true as const,
        type: resolved.type,
        title: resolved.name,
        artist: resolved.artists,
        canonicalUrl: resolved.spotifyUrl,
      }
    },
  }),
}
