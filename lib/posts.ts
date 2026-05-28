import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

const POSTS_DIRECTORY = path.join(process.cwd(), "content", "posts")

export interface PostFrontmatter {
  title: string
  description: string
  date: string
  readingTime: string
  tags: string[]
  musicLabel: string
  musicTitle: string
  musicArtist: string
  musicPlatform: "YouTube" | "Spotify" | string
  musicUrl: string
}

export interface PostMeta extends PostFrontmatter {
  slug: string
}

export interface Post extends PostMeta {
  content: string
}

function readPostFile(fileName: string): Post {
  const slug = fileName.replace(/\.mdx?$/, "")
  const fullPath = path.join(POSTS_DIRECTORY, fileName)
  const fileContents = fs.readFileSync(fullPath, "utf8")
  const { data, content } = matter(fileContents)

  return {
    slug,
    content,
    ...(data as PostFrontmatter),
  }
}

export function getAllPosts(): PostMeta[] {
  const fileNames = fs
    .readdirSync(POSTS_DIRECTORY)
    .filter((fileName) => /\.mdx?$/.test(fileName))

  return fileNames
    .map((fileName) => {
      const { content, ...meta } = readPostFile(fileName)
      return meta
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function getPostBySlug(slug: string): Post | null {
  try {
    return readPostFile(`${slug}.mdx`)
  } catch {
    return null
  }
}

export function getAllSlugs(): string[] {
  return getAllPosts().map((post) => post.slug)
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}
