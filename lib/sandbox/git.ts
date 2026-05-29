import "server-only"
import { getGithubToken, getRepoSlug } from "@/lib/agent/config"

const GITHUB_API = "https://api.github.com"

/**
 * Server-side GitHub REST helpers used by the workflow for idempotency checks
 * and resolving the resulting PR URL.
 *
 * These run in the Next.js / workflow runtime (not the sandbox), so they call
 * the API directly with the PAT in the Authorization header. The sandbox-side
 * git operations (branch/commit/push/PR) are performed by the agent itself via
 * its `bash` tool, with the token injected by the sandbox firewall.
 */
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
