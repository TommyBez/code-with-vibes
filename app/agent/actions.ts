"use server"

import { start } from "workflow/api"
import { dailyPublishWorkflow } from "@/lib/agent/workflow"
import { hasUserAuth } from "@/lib/spotify-user"

export interface TriggerState {
  ok: boolean
  runId?: string
  message: string
}

/**
 * Manually start the daily publishing workflow from the dashboard.
 * Runs server-side, so no client ever sees the cron secret or tokens.
 */
export async function triggerDailyRun(_prev: TriggerState | null, formData: FormData): Promise<TriggerState> {
  const date = (formData.get("date") as string | null)?.trim() || undefined

  if (!hasUserAuth()) {
    return {
      ok: false,
      message: "Connect your Spotify account first — the agent pairs each post with a song from your taste.",
    }
  }

  try {
    const run = await start(dailyPublishWorkflow, [date ? { date } : undefined])
    return { ok: true, runId: run.runId, message: `Run started (${run.runId}).` }
  } catch (err) {
    return { ok: false, message: `Failed to start run: ${(err as Error).message}` }
  }
}
