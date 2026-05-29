import "server-only"
import { tool } from "ai"
import { z } from "zod"
import { Sandbox } from "@vercel/sandbox"
import { getTasteProfile } from "../spotify-user"
import { resolveSpotifyResource } from "../spotify"
import { firecrawlSearch, firecrawlScrape } from "../research/firecrawl"
import { REPO_DIR } from "../sandbox/provision"

/**
 * Tools for the autonomous publishing DurableAgent.
 *
 * The agent loop itself runs inside the workflow's deterministic VM, which
 * blocks real I/O (network, filesystem, child processes). So every tool's
 * `execute` delegates to a `"use step"` function — those run in the full Node
 * runtime with sandbox + network access, and each call is a durable, retryable
 * step persisted in the workflow event log.
 *
 * We talk to the sandbox by its name (the durable id) and reconnect inside each
 * step, since a live `Sandbox` instance is not serializable across steps.
 */

const MAX_TOOL_OUTPUT = 12_000

function truncate(text: string, max = MAX_TOOL_OUTPUT): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n\n[output truncated: ${text.length - max} characters removed]`
}

// ---------------------------------------------------------------------------
// Steps — real I/O, full Node runtime, durable + retryable.
// ---------------------------------------------------------------------------

/** Run a bash command inside the sandbox, anchored at the repo root. */
export async function runBashStep(input: {
  sandboxId: string
  command: string
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  "use step"
  const sandbox = await Sandbox.get({ name: input.sandboxId })
  // Anchor every command at the repo root and disable interactive git auth
  // prompts (the sandbox firewall injects GitHub credentials on egress).
  const wrapped = `cd ${REPO_DIR} && export GIT_TERMINAL_PROMPT=0 && ${input.command}`
  const result = await sandbox.runCommand({ cmd: "bash", args: ["-lc", wrapped] })
  const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()])
  return { stdout: truncate(stdout), stderr: truncate(stderr), exitCode: result.exitCode }
}

/** Read a UTF-8 file from the sandbox (path relative to the repo root). */
export async function readFileStep(input: {
  sandboxId: string
  path: string
}): Promise<{ ok: boolean; content?: string; error?: string }> {
  "use step"
  const sandbox = await Sandbox.get({ name: input.sandboxId })
  const abs = input.path.startsWith("/") ? input.path : `${REPO_DIR}/${input.path}`
  try {
    const content = await sandbox.fs.readFile(abs, "utf8")
    return { ok: true, content: truncate(typeof content === "string" ? content : content.toString("utf8")) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Write a UTF-8 file to the sandbox (path relative to the repo root). */
export async function writeFileStep(input: {
  sandboxId: string
  path: string
  content: string
}): Promise<{ ok: boolean; bytes?: number; error?: string }> {
  "use step"
  const sandbox = await Sandbox.get({ name: input.sandboxId })
  const rel = input.path.replace(/^\/+/, "")
  try {
    await sandbox.writeFiles([{ path: `${REPO_DIR}/${rel}`, content: Buffer.from(input.content, "utf8") }])
    return { ok: true, bytes: Buffer.byteLength(input.content, "utf8") }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Search the web (web + news) for fresh AI / dev-tooling developments. */
export async function searchWebStep(input: {
  query: string
  limit?: number
}): Promise<{ results: Array<{ title: string; url: string; snippet: string }> }> {
  "use step"
  const sources = await firecrawlSearch(input.query, input.limit ?? 8)
  return { results: sources.map((s) => ({ title: s.title, url: s.url, snippet: s.snippet })) }
}

/** Scrape a single URL into clean markdown for deeper reading. */
export async function scrapeUrlStep(input: {
  url: string
}): Promise<{ title: string; url: string; content: string }> {
  "use step"
  const source = await firecrawlScrape(input.url)
  return { title: source.title, url: source.url, content: source.content }
}

/** Read the blog owner's real Spotify taste so the agent can pick a pairing. */
export async function tasteProfileStep(): Promise<{
  topTracks: Array<{ title: string; artist: string; url: string }>
  topArtists: Array<{ name: string; genres: string[] }>
  recent: Array<{ title: string; artist: string; url: string }>
}> {
  "use step"
  const profile = await getTasteProfile()
  return {
    topTracks: profile.topTracksMedium.map((t) => ({ title: t.name, artist: t.artists, url: t.url })),
    topArtists: profile.topArtistsMedium.map((a) => ({ name: a.name, genres: a.genres })),
    recent: profile.recentlyPlayed.map((t) => ({ title: t.name, artist: t.artists, url: t.url })),
  }
}

/** Verify a Spotify URL resolves to real catalog metadata. */
export async function verifySpotifyStep(input: {
  url: string
}): Promise<
  | { ok: false; reason: string }
  | { ok: true; type: string; title: string; artist: string; canonicalUrl: string }
> {
  "use step"
  const resolved = await resolveSpotifyResource(input.url)
  if (!resolved) return { ok: false, reason: "URL did not resolve to a track or album." }
  return {
    ok: true,
    type: resolved.type,
    title: resolved.name,
    artist: resolved.artists,
    canonicalUrl: resolved.spotifyUrl,
  }
}

// ---------------------------------------------------------------------------
// Tool definitions — constructed inside the workflow VM. Each `execute` simply
// dispatches the matching step, closing over the sandbox id from the run.
// ---------------------------------------------------------------------------

/** Build the agent's toolset, bound to a specific provisioned sandbox. */
export function createAgentTools(sandboxId: string) {
  return {
    bash: tool({
      description:
        "Run a bash command inside the sandboxed repo checkout (cwd is the repo root). Use for `ls`, `git`, building, and any shell work. Returns stdout, stderr, and exitCode.",
      inputSchema: z.object({
        command: z.string().describe("The bash command to run, e.g. `ls content/posts` or `pnpm build`"),
      }),
      execute: ({ command }) => runBashStep({ sandboxId, command }),
    }),

    readFile: tool({
      description: "Read a UTF-8 file from the repo (path relative to the repo root, e.g. `content/posts/foo.mdx`).",
      inputSchema: z.object({ path: z.string().describe("File path relative to the repo root") }),
      execute: ({ path }) => readFileStep({ sandboxId, path }),
    }),

    writeFile: tool({
      description: "Write (create or overwrite) a UTF-8 file in the repo (path relative to the repo root).",
      inputSchema: z.object({
        path: z.string().describe("File path relative to the repo root"),
        content: z.string().describe("Full file contents to write"),
      }),
      execute: ({ path, content }) => writeFileStep({ sandboxId, path, content }),
    }),

    searchWeb: tool({
      description:
        "Search the web (web + news) for current AI / developer-tooling developments to discover a fresh, specific topic. Returns candidate sources with title, url, and snippet.",
      inputSchema: z.object({
        query: z.string().describe("Search query, e.g. 'new AI coding agent release this week'"),
        limit: z.number().int().min(1).max(10).optional().describe("Max results (default 8)"),
      }),
      execute: ({ query, limit }) => searchWebStep({ query, limit }),
    }),

    scrapeUrl: tool({
      description:
        "Scrape a single URL into clean markdown for deep reading. Use after searchWeb to pull the full text of a promising source before citing it.",
      inputSchema: z.object({ url: z.string().describe("The absolute URL to scrape") }),
      execute: ({ url }) => scrapeUrlStep({ url }),
    }),

    fetchTasteProfile: tool({
      description:
        "Get the blog owner's real Spotify taste (top tracks, top artists, recently played) to choose an authentic song pairing with a valid Spotify URL.",
      inputSchema: z.object({}),
      execute: () => tasteProfileStep(),
    }),

    verifySpotifyUrl: tool({
      description:
        "Verify a Spotify track/album URL resolves to real catalog metadata. ALWAYS call this on your chosen song URL before writing it into the post, and use the returned canonical title/artist/url.",
      inputSchema: z.object({ url: z.string().describe("An open.spotify.com track or album URL") }),
      execute: ({ url }) => verifySpotifyStep({ url }),
    }),
  }
}
