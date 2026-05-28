import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = {
  title: "About",
  description:
    "About Code with Vibes — a blog about vibe coding and the music that fuels it.",
}

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-20">
        <h1 className="font-serif text-4xl font-medium tracking-tight text-balance">
          About
        </h1>

        <div className="mt-8 space-y-5 text-lg leading-relaxed text-foreground/85">
          <p>
            <span className="font-serif italic text-foreground">
              Code with Vibes
            </span>{" "}
            is a small blog about vibe coding — the practice of building software
            in a state of flow, guided as much by feel and momentum as by the
            spec.
          </p>
          <p>
            Every essay here ships with a paired record. The music is not
            decoration; it is part of the method. The right soundtrack lowers the
            activation energy, keeps the loop tight, and turns a session at the
            keyboard into something you actually look forward to.
          </p>
          <p>
            So when you open a post, look for the{" "}
            <span className="font-medium text-primary">Paired listening</span>{" "}
            card. Press play, then read. That is the whole idea.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
