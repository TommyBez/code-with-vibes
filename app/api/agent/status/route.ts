import { NextResponse } from "next/server"
import { getRun } from "workflow/api"

export const dynamic = "force-dynamic"

/** Poll the status (and result when finished) of a workflow run by id. */
export async function GET(request: Request) {
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
    return NextResponse.json(
      { runId, status: "unknown", error: (err as Error).message },
      { status: 200 },
    )
  }
}
