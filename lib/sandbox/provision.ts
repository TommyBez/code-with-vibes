import "server-only"
import { Sandbox } from "@vercel/sandbox"
import { getGithubToken, getRepoSlug, BASE_BRANCH, GIT_AUTHOR } from "@/lib/agent/config"

/** Default working directory of a git-sourced sandbox. */
export const REPO_DIR = "/vercel/sandbox"

export interface ProvisionResult {
  sandboxId: string
  repoDir: string
  installSummary: string
  browserReady: boolean
}

interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

async function run(
  sandbox: Sandbox,
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): Promise<RunResult> {
  const result = await sandbox.runCommand({
    cmd,
    args,
    cwd: opts.cwd ?? REPO_DIR,
    env: opts.env,
  })
  const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()])
  return { exitCode: result.exitCode, stdout, stderr }
}

/**
 * Create a fresh sandbox, clone the repo at the base branch using the PAT,
 * install dependencies, and set up the git identity. agent-browser + Chrome
 * are installed best-effort so the research crawler can run inside the VM.
 */
export async function provisionSandbox(): Promise<ProvisionResult> {
  const token = getGithubToken()
  const slug = getRepoSlug()

  const name = `cwv-agent-${Date.now()}`

  // Inject GitHub auth at the sandbox firewall instead of inside the VM. The
  // agent runs `git push` and `curl` against GitHub WITHOUT any token in its
  // commands; the firewall adds the `Authorization: Bearer <token>` header to
  // outgoing requests to github.com (git over HTTPS) and api.github.com (REST
  // API for opening the PR). The token therefore never lives in the VM's env,
  // argv, or git remote. All other egress (npm, Firecrawl, agent-browser, the
  // AI gateway, Spotify) is allowed unmodified via the "*" rule.
  // https://vercel.com/changelog/safely-inject-credentials-in-http-headers-with-vercel-sandbox
  const bearer = `Bearer ${token}`
  const sandbox = await Sandbox.create({
    name,
    source: {
      type: "git",
      url: `https://github.com/${slug}.git`,
      username: "x-access-token",
      password: token,
      revision: BASE_BRANCH,
      depth: 1,
    },
    runtime: "node24",
    resources: { vcpus: 4 },
    timeout: 15 * 60 * 1000,
    tags: { app: "code-with-vibes", role: "publishing-agent" },
    networkPolicy: {
      allow: {
        "github.com": [{ transform: [{ headers: { authorization: bearer } }] }],
        "api.github.com": [{ transform: [{ headers: { authorization: bearer } }] }],
        "*": [],
      },
    },
  })

  // Configure commit identity used later for the agent's single commit.
  await run(sandbox, "git", ["config", "user.name", GIT_AUTHOR.name])
  await run(sandbox, "git", ["config", "user.email", GIT_AUTHOR.email])

  // Install dependencies. Prefer pnpm (repo uses a pnpm lockfile), fall back to npm.
  let installSummary = ""
  const enableCorepack = await run(sandbox, "bash", [
    "-lc",
    "corepack enable || true",
  ])
  const pnpmInstall = await run(sandbox, "bash", [
    "-lc",
    "pnpm install --frozen-lockfile",
  ])
  if (pnpmInstall.exitCode === 0) {
    installSummary = "pnpm install --frozen-lockfile succeeded"
  } else {
    const npmInstall = await run(sandbox, "bash", ["-lc", "npm install"])
    installSummary =
      npmInstall.exitCode === 0
        ? "npm install succeeded (pnpm unavailable)"
        : `dependency install FAILED: ${npmInstall.stderr.slice(-500)}`
  }
  void enableCorepack

  // Install the agent-browser native CLI + Chrome for research crawling.
  // Best-effort: research falls back to Firecrawl when this is unavailable.
  let browserReady = false
  try {
    const installBrowser = await run(sandbox, "bash", [
      "-lc",
      "npm install -g agent-browser >/tmp/ab.log 2>&1 && agent-browser install --with-deps >>/tmp/ab.log 2>&1 && echo OK",
    ])
    browserReady = installBrowser.stdout.includes("OK") && installBrowser.exitCode === 0
  } catch {
    browserReady = false
  }

  return {
    sandboxId: sandbox.name,
    repoDir: REPO_DIR,
    installSummary,
    browserReady,
  }
}
