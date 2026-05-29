import "server-only"
import { Sandbox } from "@vercel/sandbox"
import {
  getGithubToken,
  getRepoSlug,
  BASE_BRANCH,
  GIT_AUTHOR,
  FIREWALL_PLACEHOLDER,
  GIT_HTTP_USER,
} from "@/lib/agent/config"

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
  // agent sends a harmless PLACEHOLDER credential; the firewall matches it and
  // swaps in the real PAT on egress, so the token never lives in the VM's env,
  // argv, or git config. Two gated rules (unconditional transforms are rejected
  // with a 400 — the placeholder match is required):
  //   - github.com: git push sends Basic base64("x-access-token:<placeholder>")
  //   - api.github.com: the PR curl sends `Authorization: Bearer <placeholder>`
  // All other egress (npm, Firecrawl, agent-browser, AI gateway, Spotify) is
  // allowed unmodified via the catch-all "*" rule.
  // https://vercel.com/changelog/safely-inject-credentials-in-http-headers-with-vercel-sandbox
  const b64 = (user: string, pass: string) => Buffer.from(`${user}:${pass}`).toString("base64")
  const basicPlaceholder = `Basic ${b64(GIT_HTTP_USER, FIREWALL_PLACEHOLDER)}`
  const basicReal = `Basic ${b64(GIT_HTTP_USER, token)}`
  const sandbox = await Sandbox.create({
    name,
    source: {
      type: "git",
      url: `https://github.com/${slug}.git`,
      username: GIT_HTTP_USER,
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
        "github.com": [
          {
            match: { headers: [{ key: { exact: "authorization" }, value: { exact: basicPlaceholder } }] },
            transform: [{ headers: { authorization: basicReal } }],
          },
        ],
        "api.github.com": [
          {
            match: { headers: [{ key: { exact: "authorization" }, value: { exact: `Bearer ${FIREWALL_PLACEHOLDER}` } }] },
            transform: [{ headers: { authorization: `Bearer ${token}` } }],
          },
        ],
        "*": [],
      },
    },
  })

  // Configure commit identity used later for the agent's single commit.
  await run(sandbox, "git", ["config", "user.name", GIT_AUTHOR.name])
  await run(sandbox, "git", ["config", "user.email", GIT_AUTHOR.email])

  // Rewrite the origin remote so the agent's `git push` carries only the
  // placeholder credential (the firewall swaps it for the real token). This
  // also scrubs any real token the initial clone may have persisted in
  // .git/config, keeping the PAT out of the VM entirely.
  await run(sandbox, "git", [
    "remote",
    "set-url",
    "origin",
    `https://${GIT_HTTP_USER}:${FIREWALL_PLACEHOLDER}@github.com/${slug}.git`,
  ])

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
