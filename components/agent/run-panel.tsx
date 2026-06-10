"use client"

import { useActionState, useEffect, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { triggerDailyRun, type TriggerState } from "@/app/agent/actions"

interface RunStatus {
  runId: string
  status: "pending" | "running" | "completed" | "failed" | "unknown"
  result?: { status: string; prUrl?: string; reason?: string; isoDate?: string }
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_TONE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-primary/15 text-primary",
  completed: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-destructive/15 text-destructive",
  unknown: "bg-muted text-muted-foreground",
}

export function RunPanel({ canRun }: { canRun: boolean }) {
  const [state, formAction, pending] = useActionState<TriggerState | null, FormData>(triggerDailyRun, null)
  const [runId, setRunId] = useState<string | null>(null)

  useEffect(() => {
    if (state?.ok && state.runId) setRunId(state.runId)
  }, [state])

  const { data } = useSWR<RunStatus>(
    runId ? `/api/agent/status?runId=${runId}` : null,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest && (latest.status === "completed" || latest.status === "failed") ? 0 : 4000,
    },
  )

  const isTerminal = data?.status === "completed" || data?.status === "failed"

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-medium text-card-foreground">Run the agent now</h2>
        {data?.status ? (
          <Badge className={STATUS_TONE[data.status] ?? STATUS_TONE.unknown} variant="secondary">
            {data.status}
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Triggers the same durable workflow that runs daily on a schedule. It researches the day&apos;s AI news,
        drafts a post, pairs it with a song from your Spotify taste, and opens a pull request for review.
      </p>

      <form action={formAction} className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor="date" className="text-xs uppercase tracking-wider text-muted-foreground">
            Date override (optional)
          </Label>
          <Input
            id="date"
            name="date"
            type="date"
            className="w-44"
            disabled={!canRun || pending}
          />
        </div>
        <Button type="submit" disabled={!canRun || pending}>
          {pending ? "Starting…" : "Start daily run"}
        </Button>
      </form>

      {state?.message ? (
        <p className={`mt-4 text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {state.message}
        </p>
      ) : null}

      {data && isTerminal && data.result ? (
        <div className="mt-5 rounded-md border border-border bg-background/60 p-4 text-sm">
          {data.result.status === "published" && data.result.prUrl ? (
            <p className="text-card-foreground">
              Published a draft PR for {data.result.isoDate}.{" "}
              <a
                href={data.result.prUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-4"
              >
                Review pull request →
              </a>
            </p>
          ) : data.result.status === "skipped" ? (
            <p className="text-muted-foreground">
              Skipped — {data.result.reason ?? "already published today."}
              {data.result.prUrl ? (
                <>
                  {" "}
                  <a href={data.result.prUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                    View existing PR →
                  </a>
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-destructive">Run failed. Check the workflow logs for details.</p>
          )}
        </div>
      ) : null}

      {data && data.status === "running" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Working… researching, writing, and building in a sandbox. This can take a few minutes.
        </p>
      ) : null}
    </div>
  )
}
