import { NextResponse } from "next/server"
import { start } from "workflow/api"
import { dailyPublishWorkflow } from "@/lib/agent/workflow"
import { getCronSecret } from "@/lib/agent/config"

export const dynamic = "force-dynamic"
export const maxDuration = 800

/**
 * Trigger the daily publishing workflow.
 *
 * Invoked by Vercel Cron (sends `Authorization: Bearer $CRON_SECRET`) or
 * manually from the dashboard (same bearer). Starts the durable workflow and
 * returns its run id immediately — the long-running work continues durably.
 */
async function authorize(request: Request): Promise<boolean> {
  const secret = getCronSecret()
  const header = request.headers.get("authorization")
  if (header === `Bearer ${secret}`) return true
  // Vercel Cron also supports the x-vercel-cron header; still require the secret.
  const url = new URL(request.url)
  return url.searchParams.get("secret") === secret
}

async function trigger(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let date: string | undefined
  try {
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}))
      date = typeof body?.date === "string" ? body.date : undefined
    }
  } catch {
    date = undefined
  }

  const run = await start(dailyPublishWorkflow, [date ? { date } : undefined])

  return NextResponse.json({ ok: true, runId: run.runId, startedAt: new Date().toISOString() })
}

export async function GET(request: Request) {
  return trigger(request)
}

export async function POST(request: Request) {
  return trigger(request)
}
