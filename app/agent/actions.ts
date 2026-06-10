"use server"

import { revalidatePath } from "next/cache"
import { start } from "workflow/api"
import { dailyPublishWorkflow } from "@/lib/agent/workflow"
import { hasUserAuth } from "@/lib/spotify-user"
import { isOperator, signInOperator, signOutOperator } from "@/lib/agent/operator"

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
  // Triggering writes branches and opens PRs — operators only.
  if (!(await isOperator())) {
    return { ok: false, message: "Operator authentication required to start a run." }
  }

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

export interface LoginState {
  ok: boolean
  message: string
}

/** Authenticate an operator by exchanging the shared operator secret. */
export async function operatorLogin(_prev: LoginState | null, formData: FormData): Promise<LoginState> {
  const secret = (formData.get("secret") as string | null)?.trim() ?? ""
  if (!secret) return { ok: false, message: "Enter the operator secret." }
  const ok = await signInOperator(secret)
  if (!ok) return { ok: false, message: "Invalid operator secret." }
  revalidatePath("/agent")
  return { ok: true, message: "Authenticated." }
}

/** End the operator session. */
export async function operatorLogout(): Promise<void> {
  await signOutOperator()
  revalidatePath("/agent")
}
