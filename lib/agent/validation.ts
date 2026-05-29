import { z } from "zod"

/**
 * Structured output contract the DurableAgent must satisfy.
 * Mirrors PostFrontmatter (lib/posts.ts) so generated posts render unchanged,
 * and adds editorial metadata used for the PR body and the ledger.
 */
export const postSpecSchema = z.object({
  // URL-safe slug, also used as the filename.
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case")
    .min(8)
    .max(80),
  title: z.string().min(8).max(90),
  description: z.string().min(20).max(200),
  tags: z.array(z.string().min(2).max(24)).min(2).max(5),
  // The essay body in Markdown/MDX (no frontmatter, starts with prose).
  bodyMarkdown: z.string().min(600),
  // Editorial pairing — the agent chooses from the owner's Spotify taste.
  music: z.object({
    label: z.string().min(3).max(40).default("Paired listening"),
    title: z.string().min(1),
    artist: z.string().min(1),
    // A real open.spotify.com track or album URL from the taste profile.
    url: z
      .string()
      .url()
      .regex(
        /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:track|album)\//,
        "must be a Spotify track or album URL",
      ),
    reason: z.string().min(20).max(400),
  }),
  // Why this topic, and which sources informed it (URLs the agent actually used).
  topicRationale: z.string().min(20).max(600),
  sourceUrls: z.array(z.string().url()).min(1).max(8),
})

export type PostSpec = z.infer<typeof postSpecSchema>

/**
 * Lenient schema used for the LLM's structured output.
 *
 * It only encodes *shape* (which fields exist and their types), deliberately
 * omitting the regex/min/max constraints that make a single-shot generation
 * with tool calls brittle and trigger `AI_NoObjectGeneratedError`. The strict
 * `postSpecSchema` is still enforced after `normalizeDraft()` and again in the
 * durable `validatePost` step, so guarantees are preserved.
 */
export const postDraftSchema = z.object({
  slug: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  bodyMarkdown: z.string(),
  music: z.object({
    label: z.string().optional(),
    title: z.string().optional(),
    artist: z.string().optional(),
    url: z.string(),
    reason: z.string().optional(),
  }),
  topicRationale: z.string().optional(),
  sourceUrls: z.array(z.string()).optional(),
})

export type PostDraft = z.infer<typeof postDraftSchema>

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "")
}

function clampMax(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trim()
}

/** Plain-text excerpt from markdown for description fallbacks. */
function excerpt(markdown: string, max: number): string {
  const text = markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
  return clampMax(text, max)
}

/**
 * Coerce a lenient draft into a strict `PostSpec`-shaped object: derive a clean
 * slug, clamp over-long fields, supply sane defaults, and de-duplicate tags.
 * Song title/artist are placeholders here — `validatePost` overwrites them with
 * canonical Spotify metadata. Throws nothing; the caller re-validates strictly.
 */
export function normalizeDraft(draft: PostDraft): PostSpec {
  const title = clampMax(draft.title, 90)

  const candidateSlug = draft.slug && /^[a-z0-9-]+$/.test(draft.slug) ? draft.slug : ""
  const slug = (slugify(candidateSlug) || slugify(title) || "code-with-vibes").padEnd(8, "-x").slice(0, 80)

  let description = (draft.description ?? "").trim()
  if (description.length < 20) description = excerpt(draft.bodyMarkdown, 200)
  description = clampMax(description, 200)

  // Normalize tags: lowercase, trim, drop too-short/long, de-dupe, cap at 5.
  const seen = new Set<string>()
  let tags = (draft.tags ?? [])
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 2 && t.length <= 24 && !seen.has(t) && seen.add(t))
    .slice(0, 5)
  if (tags.length < 2) {
    const derived = title
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter((w) => w.length >= 3 && w.length <= 24 && !seen.has(w) && seen.add(w))
    tags = [...tags, ...derived, "vibe-coding", "ai"].slice(0, Math.max(2, tags.length || 2))
  }

  let reason = (draft.music.reason ?? "").trim()
  if (reason.length < 20) reason = "A fitting companion to the essay's mood and rhythm."
  reason = clampMax(reason, 400)

  let topicRationale = (draft.topicRationale ?? "").trim()
  if (topicRationale.length < 20) topicRationale = excerpt(draft.bodyMarkdown, 600)
  topicRationale = clampMax(topicRationale, 600)

  return {
    slug,
    title,
    description,
    tags,
    bodyMarkdown: draft.bodyMarkdown.trim(),
    music: {
      label: clampMax(draft.music.label?.trim() || "Paired listening", 40),
      title: draft.music.title?.trim() || "Unknown",
      artist: draft.music.artist?.trim() || "Unknown",
      url: draft.music.url.trim(),
      reason,
    },
    topicRationale,
    sourceUrls: (draft.sourceUrls ?? []).map((u) => u.trim()).filter(Boolean).slice(0, 8),
  }
}

/** Estimate reading time from word count at ~200 wpm, matching existing posts. */
export function estimateReadingTime(markdown: string): string {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.ceil(words / 200))
  return `${minutes} min read`
}
