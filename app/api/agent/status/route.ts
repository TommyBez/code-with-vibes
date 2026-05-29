import { NextResponse } from "next/server"
import { getRun } from "workflow/api"
import { isOperator } from "@/lib/agent/operator"

export const dynamic = "force-dynamic"

/** Poll the status (and result when finished) of a workflow run by id. */
export async function GET(request: Request) {
  if (!(await isOperator())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const runId = new URL(request.url).searchParams.get("runId")
  if (!runId) {
    return NextResponse.json({ error: "Missing runId" }, { status: 400 })
  }

  try {
    const run = getRun(runId)
    const status = await run.status

    let result: unknown
    if (status === "completed") {
      result = await run.returnValue.catch(() => undefined)
    }

    return NextResponse.json({ runId, status, result })
  } catch (err) {
    // Surface the failure with a non-200 status and a terminal state rather
    // than masking it as a 200 "unknown".
    return NextResponse.json(
      { runId, status: "failed", error: (err as Error).message },
      { status: 500 },
    )
  }
}
