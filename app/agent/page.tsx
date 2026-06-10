import type { Metadata } from "next"
import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { RunPanel } from "@/components/agent/run-panel"
import { OperatorLogin } from "@/components/agent/operator-login"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { hasUserAuth } from "@/lib/spotify-user"
import { isOperator, operatorAuthConfigured } from "@/lib/agent/operator"
import { operatorLogout } from "./actions"
import { getRepoSlug, AGENT_MODEL } from "@/lib/agent/config"
import { getAllPosts } from "@/lib/posts"

export const metadata: Metadata = {
  title: "Publishing agent",
  description: "Operate the autonomous daily publishing agent for Code with Vibes.",
}

export const dynamic = "force-dynamic"

interface ReadinessItem {
  label: string
  ready: boolean
  hint: string
}

function readiness(): ReadinessItem[] {
  return [
    { label: "Spotify account", ready: hasUserAuth(), hint: "Connect to pair posts with your taste." },
    { label: "Firecrawl key", ready: Boolean(process.env.FIRECRAWL_API_KEY), hint: "FIRECRAWL_API_KEY" },
    { label: "GitHub token", ready: Boolean(process.env.AGENT_GITHUB_TOKEN), hint: "AGENT_GITHUB_TOKEN" },
    { label: "AI Gateway", ready: Boolean(process.env.AI_GATEWAY_API_KEY), hint: "AI_GATEWAY_API_KEY" },
    {
      label: "Sandbox creds",
      // The SDK resolves credentials lazily from OIDC *or* env vars. On Vercel,
      // OIDC is available to the runtime even when VERCEL_OIDC_TOKEN isn't a
      // visible process.env value, so treat any Vercel runtime as ready; off
      // Vercel (local) we need the explicit token.
      ready: Boolean(
        process.env.VERCEL ||
          process.env.VERCEL_OIDC_TOKEN ||
          process.env.VERCEL_TOKEN,
      ),
      hint: "OIDC on Vercel, or VERCEL_TOKEN locally",
    },
    { label: "Cron secret", ready: Boolean(process.env.CRON_SECRET), hint: "CRON_SECRET" },
  ]
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <header className="border-b border-border/60 pb-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Autonomous publishing</p>
          <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            The agent that writes here
          </h1>
          <p className="mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Every day it researches what&apos;s happening in AI, writes an essay on vibe coding, pairs it with a
            track from your Spotify, and opens a pull request for you to review. Nothing publishes without a merge.
          </p>
        </header>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}

export default async function AgentPage() {
  const operator = await isOperator()

  // Gate the control surface: configuration, run controls, and editorial
  // memory are only shown to an authenticated operator.
  if (!operator) {
    return (
      <PageShell>
        <OperatorLogin configured={operatorAuthConfigured()} />
      </PageShell>
    )
  }

  const checks = readiness()
  const canRun = checks.every((c) => c.ready)
  const spotifyConnected = hasUserAuth()
  const posts = getAllPosts().slice(0, 6)

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <header className="border-b border-border/60 pb-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Autonomous publishing</p>
          <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            The agent that writes here
          </h1>
          <p className="mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Every day it researches what&apos;s happening in AI, writes an essay on vibe coding, pairs it with a
            track from your Spotify, and opens a pull request for you to review. Nothing publishes without a merge.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="font-mono">{getRepoSlug()}</Badge>
            <Badge variant="secondary" className="font-mono">{AGENT_MODEL}</Badge>
            <Badge variant="secondary" className="font-mono">daily · 13:00 UTC</Badge>
            <form action={operatorLogout} className="ml-auto">
              <Button type="submit" variant="ghost" size="sm" className="h-7 text-xs">
                Sign out
              </Button>
            </form>
          </div>
        </header>

        {/* Spotify connection */}
        <section className="mt-8 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-medium text-card-foreground">Spotify</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {spotifyConnected
                  ? "Connected. The agent draws song pairings from your listening."
                  : "Not connected. Authorize read-only access to your taste."}
              </p>
            </div>
            <Badge
              variant="secondary"
              className={spotifyConnected ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}
            >
              {spotifyConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          {!spotifyConnected ? (
            <Button asChild className="mt-4">
              <a href="/api/spotify/connect">Connect Spotify</a>
            </Button>
          ) : null}
        </section>

        {/* Readiness checklist */}
        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="font-serif text-xl font-medium text-card-foreground">Configuration</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-card-foreground">{c.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">{c.hint}</p>
                </div>
                <span
                  className={`mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c.ready ? "bg-emerald-400" : "bg-destructive"}`}
                  aria-label={c.ready ? "ready" : "missing"}
                />
              </li>
            ))}
          </ul>
          {!canRun ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Add the missing values in Project Settings → Environment Variables to enable manual and scheduled runs.
            </p>
          ) : null}
        </section>

        {/* Run trigger */}
        <section className="mt-6">
          <RunPanel canRun={canRun} />
        </section>

        {/* Editorial memory */}
        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="font-serif text-xl font-medium text-card-foreground">Editorial memory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The most recent published posts — the same repo-as-memory the agent inspects to avoid repeating topics or songs.
          </p>
          {posts.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No posts yet — run the agent to create the first one.</p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-border/60">
              {posts.map((p) => (
                <li key={p.slug} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Link href={`/posts/${p.slug}`} className="text-sm font-medium text-card-foreground hover:text-primary">
                      {p.title}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{p.date}</p>
                  </div>
                  <a
                    href={p.musicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary"
                  >
                    ♪ {p.musicTitle} — {p.musicArtist}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
