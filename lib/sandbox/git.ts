import "server-only"
import { runIn, runArgv } from "./exec"
import { getGithubToken, getRepoSlug, BASE_BRANCH } from "@/lib/agent/config"

const GITHUB_API = "https://api.github.com"

function ghHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getGithubToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  }
}

/** True if the branch already exists on the remote (idempotency guard). */
export async function remoteBranchExists(branch: string): Promise<boolean> {
  const slug = getRepoSlug()
  const res = await fetch(
    `${GITHUB_API}/repos/${slug}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers: ghHeaders(), cache: "no-store" },
  )
  if (res.ok) return true
  if (res.status === 404) return false
  // Surface auth/rate-limit/5xx instead of masking them as "branch missing".
  throw new Error(`GitHub ref lookup failed (${res.status}): ${await res.text()}`)
}

/** Return the URL of an existing open PR from `branch`, or null. */
export async function findOpenPr(branch: string): Promise<string | null> {
  const slug = getRepoSlug()
  const owner = slug.split("/")[0]
  const res = await fetch(
    `${GITHUB_API}/repos/${slug}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}`,
    { headers: ghHeaders(), cache: "no-store" },
  )
  if (res.status === 404) return null
  if (!res.ok) {
    // Surface auth/rate-limit/5xx instead of masking them as "no PR".
    throw new Error(`GitHub PR lookup failed (${res.status}): ${await res.text()}`)
  }
  const prs = (await res.json()) as Array<{ html_url: string }>
  return prs[0]?.html_url ?? null
}

/** Create a branch in the sandbox checkout (from the current base HEAD). */
export async function createBranch(sandboxId: string, branch: string): Promise<void> {
  const safe = branch.replace(/'/g, "")
  const res = await runIn(sandboxId, `git checkout -B '${safe}'`)
  if (res.exitCode !== 0) {
    throw new Error(`Failed to create branch ${branch}: ${res.stderr}`)
  }
}

/** Stage everything and create a single commit. Returns false if nothing changed. */
export async function commitAll(sandboxId: string, message: string): Promise<boolean> {
  const status = await runIn(sandboxId, "git add -A && git status --porcelain")
  if (!status.stdout.trim()) return false
  // Pass the message as a separate argv entry (no shell) so its contents can
  // never be interpreted as shell metacharacters.
  const res = await runArgv(sandboxId, "git", ["commit", "-m", message])
  if (res.exitCode !== 0) {
    throw new Error(`git commit failed: ${res.stderr}`)
  }
  return true
}

/** Push the branch to origin using the PAT (token never written to disk). */
export async function pushBranch(sandboxId: string, branch: string): Promise<void> {
  const slug = getRepoSlug()
  const safe = branch.replace(/'/g, "")
  const remote = `https://x-access-token:${getGithubToken()}@github.com/${slug}.git`
  const res = await runIn(
    sandboxId,
    `git push '${remote}' 'HEAD:refs/heads/${safe}' --force-with-lease`,
  )
  if (res.exitCode !== 0) {
    throw new Error(`git push failed: ${res.stderr.replace(getGithubToken(), "***")}`)
  }
}

/** Open a pull request from `branch` into the base branch. Returns the PR URL. */
export async function openPullRequest(params: {
  branch: string
  title: string
  body: string
}): Promise<string> {
  const slug = getRepoSlug()
  const res = await fetch(`${GITHUB_API}/repos/${slug}/pulls`, {
    method: "POST",
    headers: ghHeaders(),
    body: JSON.stringify({
      title: params.title,
      head: params.branch,
      base: BASE_BRANCH,
      body: params.body,
      maintainer_can_modify: true,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Failed to open PR (${res.status}): ${detail}`)
  }

  const pr = (await res.json()) as { html_url: string }
  return pr.html_url
}
