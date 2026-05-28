import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { MDXRemote } from "next-mdx-remote-client/rsc"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { MusicLink } from "@/components/music-link"
import { mdxComponents } from "@/components/mdx-components"
import { getAllSlugs, getPostBySlug, formatDate } from "@/lib/posts"

interface PostPageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}

  return {
    title: post.title,
    description: post.description,
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params
  const post = getPostBySlug(slug)

  if (!post) notFound()

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All writing
        </Link>

        <article className="mt-8">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>

            <h1 className="mt-4 font-serif text-4xl font-medium leading-tight tracking-tight text-balance sm:text-5xl">
              {post.title}
            </h1>

            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              {post.description}
            </p>

            <div className="mt-5 flex items-center gap-3 text-sm text-muted-foreground">
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              <span aria-hidden="true">{"\u00B7"}</span>
              <span>{post.readingTime}</span>
            </div>
          </header>

          <MusicLink
            label={post.musicLabel}
            title={post.musicTitle}
            artist={post.musicArtist}
            platform={post.musicPlatform}
            url={post.musicUrl}
            className="my-10"
          />

          <div className="text-[1.0625rem]">
            <MDXRemote source={post.content} components={mdxComponents} />
          </div>
        </article>

        <div className="mt-14 rounded-xl border border-border/60 bg-card/40 p-6 text-center">
          <p className="font-serif text-lg italic text-foreground">
            Enjoyed the track as much as the words?
          </p>
          <Link
            href="/"
            className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Find your next paired listen
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
