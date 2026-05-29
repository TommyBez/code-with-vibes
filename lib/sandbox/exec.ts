import "server-only"
import { Sandbox } from "@vercel/sandbox"
import { REPO_DIR } from "./provision"

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

/** Reconnect to an existing sandbox by name (state persists across invocations). */
export function getSandbox(sandboxId: string): Promise<Sandbox> {
  return Sandbox.get({ name: sandboxId })
}

/** Run a shell command in an existing sandbox and collect its output. */
export async function runIn(
  sandboxId: string,
  script: string,
  opts: { cwd?: string; env?: Record<string, string> } = {},
): Promise<ExecResult> {
  const sandbox = await getSandbox(sandboxId)
  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", script],
    cwd: opts.cwd ?? REPO_DIR,
    env: opts.env,
  })
  const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()])
  return { exitCode: result.exitCode, stdout, stderr }
}
