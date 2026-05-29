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

/** Estimate reading time from word count at ~200 wpm, matching existing posts. */
export function estimateReadingTime(markdown: string): string {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.round(words / 200))
  return `${minutes} min read`
}
