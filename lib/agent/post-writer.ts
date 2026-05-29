import matter from "gray-matter"
import type { PostSpec } from "./validation"
import { estimateReadingTime } from "./validation"

/**
 * Serialize a validated PostSpec into the exact MDX shape the blog expects
 * (see lib/posts.ts PostFrontmatter). gray-matter handles YAML escaping so
 * titles/descriptions with quotes or colons can't corrupt the frontmatter.
 */
export function renderPostMdx(spec: PostSpec, isoDate: string): string {
  const frontmatter = {
    title: spec.title,
    description: spec.description,
    date: isoDate,
    readingTime: estimateReadingTime(spec.bodyMarkdown),
    tags: spec.tags,
    musicLabel: spec.music.label,
    musicTitle: spec.music.title,
    musicArtist: spec.music.artist,
    musicPlatform: "Spotify",
    musicUrl: spec.music.url,
  }

  // matter.stringify writes `---\n<yaml>---\n<body>`.
  return matter.stringify(`\n${spec.bodyMarkdown.trim()}\n`, frontmatter)
}

/** Repo-relative path for a post slug. */
export function postPath(slug: string): string {
  return `content/posts/${slug}.mdx`
}
