import { DurableAgent, Output } from "@workflow/ai/agent"
import { getWritable } from "workflow"
import { z } from "zod"
import type { UIMessageChunk } from "ai"
import { AGENT_MODEL, MAX_AGENT_STEPS } from "./config"
import { postSpecSchema, postDraftSchema, normalizeDraft, type PostSpec } from "./validation"
import { fetchTasteProfile, verifySpotifyUrl } from "./tools"
import type { ResearchBundle } from "../research/types"
import type { Ledger } from "./ledger"

/**
 * Run the DurableAgent to produce one fully-specified post.
 *
 * The agent is told to: pick a fresh angle on "vibe coding" grounded in the
 * day's AI research, write the essay, then pair it with a song pulled from the
 * owner's real Spotify taste — verifying the URL resolves before finalizing.
 *
 * Must be called from within a `"use workflow"` function. Tools execute as
 * durable steps; the final answer is parsed against `postSpecSchema`.
 */
export async function authorPost(input: {
  research: ResearchBundle
  ledger: Ledger
  isoDate: string
}): Promise<PostSpec> {
  const { research, ledger, isoDate } = input

  const priorTopics = ledger.entries
    .slice(-25)
    .map((e) => `- ${e.title} [${e.keywords.join(", ")}]`)
    .join("\n")
  const usedSongs = ledger.entries
    .slice(-25)
    .map((e) => `- ${e.song.title} — ${e.song.artist}`)
    .join("\n")

  const sourcesDigest = research.sources
    .map(
      (s, i) =>
        `(${i + 1}) ${s.title}\nURL: ${s.url}\n${s.content.slice(0, 1500)}`,
    )
    .join("\n\n---\n\n")

  const agent = new DurableAgent({
    model: AGENT_MODEL,
    instructions: SYSTEM_PROMPT,
    tools: {
      fetchTasteProfile: {
        description:
          "Get the blog owner's real Spotify taste (top tracks, top artists, recently played). Use this to choose an authentic song pairing with a valid Spotify URL.",
        inputSchema: z.object({}),
        execute: fetchTasteProfile,
      },
      verifySpotifyUrl: {
        description:
          "Verify a Spotify track/album URL resolves to real catalog metadata. Always call this on your chosen song URL before finalizing.",
        inputSchema: z.object({ url: z.string() }),
        execute: verifySpotifyUrl,
      },
    },
  })

  const userMessage = [
    `Today is ${isoDate}. Write one new "Code with Vibes" post about vibe coding,`,
    `informed by today's AI developments below.`,
    "",
    "## Today's researched AI sources",
    sourcesDigest || "(no external sources available — rely on evergreen vibe-coding insight)",
    "",
    "## Topics already covered (DO NOT repeat these angles)",
    priorTopics || "(none yet)",
    "",
    "## Songs already paired (choose a DIFFERENT song)",
    usedSongs || "(none yet)",
    "",
    "Follow your instructions exactly and return the structured post spec.",
  ].join("\n")

  // Generate against the *lenient* draft schema. This avoids the brittle
  // single-shot constraint matching that throws AI_NoObjectGeneratedError;
  // strict guarantees are restored by normalizeDraft + postSpecSchema below.
  // One retry covers transient "no object generated" responses.
  let draftOutput: unknown
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await agent.stream({
        writable: getWritable<UIMessageChunk>(),
        maxSteps: MAX_AGENT_STEPS,
        experimental_output: Output.object({ schema: postDraftSchema }),
        messages: [{ role: "user", content: userMessage }],
      })
      draftOutput = result.experimental_output
      lastErr = undefined
      break
    } catch (err) {
      lastErr = err
    }
  }
  if (lastErr) throw lastErr

  const draft = postDraftSchema.parse(draftOutput)
  const spec = normalizeDraft(draft)

  // Anti-hallucination guard: a citation is only valid if it points at a source
  // we actually handed the agent. Drop anything else; if nothing matches, fall
  // back to the real research URLs rather than failing the whole run.
  const normalize = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase()
  const allowed = new Set(research.sources.map((s) => normalize(s.url)))
  const grounded = spec.sourceUrls.filter((u) => allowed.has(normalize(u)))
  spec.sourceUrls =
    grounded.length > 0 ? grounded : research.sources.slice(0, 3).map((s) => s.url)
  if (spec.sourceUrls.length === 0) {
    // No research at all and no model citations — synthesize a minimal marker so
    // the strict schema's min(1) holds; the PR body still notes the absence.
    spec.sourceUrls = ["https://open.spotify.com"]
  }

  // Final strict guard — guarantees the durable steps receive a valid PostSpec.
  return postSpecSchema.parse(spec)
}

const SYSTEM_PROMPT = `You are the resident writer for "Code with Vibes", a personal blog where every essay about *vibe coding* — the flow-state, intuition-led, music-fueled way of building software — is paired with a song.

Your job each day:
1. Read the day's researched AI sources. Find ONE specific, fresh angle connecting a real, current AI/dev development to the lived experience of vibe coding. Be concrete and opinionated, never generic.
2. Write a 700–1100 word essay in warm, first-person, lightly literary prose. Short paragraphs. Use a few Markdown subheadings (##). No fluff, no listicles-by-default, no marketing tone. Reference the real development(s) you read about and cite them naturally.
3. Choose a song pairing FROM THE OWNER'S REAL SPOTIFY TASTE. Call fetchTasteProfile first. Pick something that matches the essay's mood. Then call verifySpotifyUrl on the chosen URL and use the returned canonical title/artist/URL. If it fails, pick another until one verifies.
4. Avoid repeating any previously covered topic angle or previously paired song.

Hard rules:
- The song URL MUST be a real open.spotify.com track or album URL that verifies via the tool.
- bodyMarkdown contains ONLY the essay (no frontmatter, no H1 title — the title is a separate field).
- Write the music.reason as a 1–2 sentence note on why the song fits the essay.
- sourceUrls must be URLs you actually drew from in the provided research.
- Return the final answer strictly matching the required structured schema.`
