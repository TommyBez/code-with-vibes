import { DurableAgent } from "@workflow/ai/agent"
import { getWritable, RetryableError } from "workflow"
import { Sandbox } from "@vercel/sandbox"
import { createBashTool } from "bash-tool"
import type { UIMessageChunk, ModelMessage } from "ai"
import { provisionSandbox, REPO_DIR } from "../sandbox/provision"
import { remoteBranchExists, findOpenPr } from "../sandbox/git"
import { domainTools } from "./tools"
import { buildSystemPrompt, buildUserMessage } from "./prompt"
import { AGENT_MODEL, MAX_AGENT_STEPS, BASE_BRANCH, getRepoSlug } from "./config"

export interface DailyRunResult {
  status: "published" | "skipped" | "failed"
  isoDate: string
  prUrl?: string
  reason?: string
}

/**
 * The autonomous daily publishing workflow.
 *
 * A single DurableAgent does the whole job inside a sandboxed checkout: it
 * researches the day's AI news, writes + pairs a post, makes the build pass,
 * and opens a reviewable PR (never pushing to the base branch directly). The
 * GitHub token is injected by the sandbox firewall, so it never enters the VM.
 *
 * Idempotent per day: a second run for the same date no-ops if the branch/PR
 * already exists.
 */
export async function dailyPublishWorkflow(input?: { date?: string }): Promise<DailyRunResult> {
  "use workflow"

  const isoDate = input?.date ?? new Date().toISOString().slice(0, 10)
  const branch = `agent/post-${isoDate}`

  // 1. Idempotency guard — skip if today's branch or an open PR already exists.
  const [branchExists, existingPr] = await Promise.all([
    remoteBranchExists(branch).catch(() => false),
    findOpenPr(branch).catch(() => null),
  ])
  if (branchExists || existingPr) {
    return { status: "skipped", isoDate, prUrl: existingPr ?? undefined, reason: "Already published today." }
  }

  // 2. Provision the sandbox (clone + deps + agent-browser).
  const { sandboxId } = await provisionStep()

  try {
    // 3. Run the agent end-to-end. It writes, builds, pushes, and opens the PR.
    await runAgent({ sandboxId, isoDate, branch })

    // 4. Resolve the PR the agent opened. findOpenPr is the source of truth;
    //    it returns null if the agent failed to push + open a PR.
    const prUrl = await findOpenPr(branch).catch(() => null)
    if (prUrl) return { status: "published", isoDate, prUrl }
    return { status: "failed", isoDate, reason: "Agent finished without opening a pull request." }
  } finally {
    await teardown(sandboxId)
  }
}

/**
 * Provision step — retryable since sandbox creation can hit transient capacity
 * errors. Returns only the serializable sandbox id for durable replay.
 */
async function provisionStep(): Promise<{ sandboxId: string }> {
  "use step"
  try {
    const { sandboxId } = await provisionSandbox()
    return { sandboxId }
  } catch (err) {
    throw new RetryableError(`Sandbox provisioning failed: ${(err as Error).message}`)
  }
}

/**
 * Drive the DurableAgent. Not a `"use step"` because it constructs non-
 * serializable tool closures — instead, the agent's own loop persists each
 * tool call/result for durable replay.
 */
async function runAgent(params: { sandboxId: string; isoDate: string; branch: string }): Promise<void> {
  const { sandboxId, isoDate, branch } = params
  const repoSlug = getRepoSlug()

  // Reconnect to the provisioned sandbox and expose the repo via bash-tool.
  const sandbox = await Sandbox.get({ sandboxId })
  const { tools: bashTools } = await createBashTool({
    sandbox,
    destination: REPO_DIR,
    // The Vercel adapter runs `bash -c <cmd>` without a cwd, so anchor every
    // command in the repo root and disable interactive git auth prompts.
    onBeforeBashCall: ({ command }) => ({
      command: `cd ${REPO_DIR} && export GIT_TERMINAL_PROMPT=0 && ${command}`,
    }),
    maxOutputLength: 12_000,
  })

  const agent = new DurableAgent({
    model: AGENT_MODEL,
    instructions: buildSystemPrompt({ isoDate, repoSlug, baseBranch: BASE_BRANCH, branch }),
    tools: { ...bashTools, ...domainTools },
  })

  const messages: ModelMessage[] = [
    { role: "user", content: buildUserMessage({ isoDate, repoSlug, baseBranch: BASE_BRANCH, branch }) },
  ]

  await agent.stream({
    writable: getWritable<UIMessageChunk>(),
    maxSteps: MAX_AGENT_STEPS,
    messages,
  })
}

/** Best-effort cleanup of the sandbox after the run. */
async function teardown(sandboxId: string): Promise<void> {
  "use step"
  try {
    const sandbox = await Sandbox.get({ sandboxId })
    await sandbox.stop()
  } catch {
    // ignore — sandbox auto-expires on timeout anyway.
  }
}
