import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { PostCard } from "@/components/post-card"
import { getAllPosts } from "@/lib/posts"

export default function HomePage() {
  const posts = getAllPosts()

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6">
        <section className="py-16 sm:py-20">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Coding, paired with a soundtrack
          </p>
          <h1 className="mt-4 font-serif text-4xl font-medium leading-tight tracking-tight text-balance sm:text-5xl">
            Essays on vibe coding, each one paired with a record worth pressing
            play on.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Flow, craft, debugging, and the quiet joy of building something on a
            Saturday. Read with the volume up.
          </p>
        </section>

        <section className="pb-8">
          <div className="mb-6 flex items-center justify-between border-b border-border/60 pb-3">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              All writing
            </h2>
            <span className="text-xs text-muted-foreground">
              {posts.length} {posts.length === 1 ? "post" : "posts"}
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
