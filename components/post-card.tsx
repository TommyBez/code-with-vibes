import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import type { PostMeta } from "@/lib/posts"
import { formatDate } from "@/lib/posts"
import { MusicTag } from "@/components/music-link"

export function PostCard({ post }: { post: PostMeta }) {
  return (
    <article className="group relative rounded-xl border border-border/60 bg-card/40 p-6 transition-colors hover:border-primary/40 hover:bg-card">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        <span aria-hidden="true">{"\u00B7"}</span>
        <span>{post.readingTime}</span>
      </div>

      <h2 className="mt-3 font-serif text-2xl font-medium tracking-tight text-balance">
        <Link href={`/posts/${post.slug}`} className="after:absolute after:inset-0">
          {post.title}
        </Link>
      </h2>

      <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
        {post.description}
      </p>

      <div className="mt-5 flex items-center justify-between gap-4 border-t border-border/50 pt-4">
        <MusicTag
          title={post.musicTitle}
          artist={post.musicArtist}
          platform={post.musicPlatform}
        />
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
    </article>
  )
}
