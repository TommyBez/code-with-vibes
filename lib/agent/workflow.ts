import {
  checkAlreadyPublished,
  provisionStep,
  researchTrends,
  loadLedger,
  validatePost,
  writePostFiles,
  verifyBuild,
  commitAndOpenPr,
  teardown,
} from "./steps"
import { authorPost } from "./author"

export interface DailyRunResult {
  status: "published" | "skipped" | "failed"
  isoDate: string
  prUrl?: string
  reason?: string
}

/**
 * The autonomous daily publishing workflow.
 *
 * Durable end-to-end: provisions a sandbox, researches the day's AI news,
 * has the DurableAgent write + pair a post, validates and quality-gates it,
 * then opens a reviewable PR (never pushes to the base branch directly).
 *
 * Idempotent per day: a second run for the same date no-ops if the branch/PR
 * already exists.
 */
export async function dailyPublishWorkflow(input?: { date?: string }): Promise<DailyRunResult> {
  "use workflow"

  const isoDate = input?.date ?? new Date().toISOString().slice(0, 10)

  // 1. Idempotency guard.
  const { branch, alreadyDone, existingPr } = await checkAlreadyPublished(isoDate)
  if (alreadyDone) {
    return { status: "skipped", isoDate, prUrl: existingPr ?? undefined, reason: "Already published today." }
  }

  // 2. Provision sandbox.
  const { sandboxId, browserReady } = await provisionStep()

  try {
    // 3. Research the day's AI developments.
    const research = await researchTrends(sandboxId, browserReady)

    // 4. Author the post with the DurableAgent (grounded by research + ledger memory).
    const ledger = await loadLedger(sandboxId)
    const draft = await authorPost({ research, ledger, isoDate })

    // 5. Validate (schema, novelty, real Spotify URL) and normalize.
    const post = await validatePost(sandboxId, draft)

    // 6. Write MDX + ledger entry into the sandbox checkout.
    await writePostFiles(sandboxId, post, isoDate)

    // 7. Quality gate: build the project to compile the new MDX.
    await verifyBuild(sandboxId, post.slug)

    // 8. Commit, push branch, open PR.
    const prUrl = await commitAndOpenPr({ sandboxId, branch, spec: post, isoDate, research })

    return { status: "published", isoDate, prUrl }
  } finally {
    await teardown(sandboxId)
  }
}
