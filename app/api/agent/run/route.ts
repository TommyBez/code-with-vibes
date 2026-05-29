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
function authorize(request: Request): boolean {
  const secret = getCronSecret()
  // Require the secret in the Authorization header only — never in the URL,
  // where it would leak into logs, history, and referrers.
  return request.headers.get("authorization") === `Bearer ${secret}`
}

async function trigger(request: Request) {
  if (!authorize(request)) {
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

  try {
    const run = await start(dailyPublishWorkflow, [date ? { date } : undefined])
    return NextResponse.json({ ok: true, runId: run.runId, startedAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Failed to start workflow: ${(err as Error).message}` },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return trigger(request)
}

export async function POST(request: Request) {
  return trigger(request)
}
