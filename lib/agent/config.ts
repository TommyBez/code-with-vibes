import "server-only"

/**
 * Central configuration for the autonomous publishing agent.
 *
 * All secrets are read from environment variables and never exposed to the
 * client. Helper accessors throw a descriptive error when a required variable
 * is missing so failures surface clearly in workflow logs / the PR pipeline.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". Add it in Project Settings → Environment Variables.`,
    )
  }
  return value
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback
}

/** Model that powers the DurableAgent (via Vercel AI Gateway). Swappable. */
export const AGENT_MODEL = optional("AGENT_MODEL", "deepseek/deepseek-v4-pro")

/** The GitHub repo the agent edits, e.g. "TommyBez/code-with-vibes". */
export function getRepoSlug(): string {
  return optional("AGENT_REPO_SLUG", "TommyBez/code-with-vibes")
}

/** Base branch PRs target. */
export const BASE_BRANCH = optional("AGENT_BASE_BRANCH", "main")

/** Fine-grained GitHub PAT with Contents + Pull requests write on the repo. */
export function getGithubToken(): string {
  return required("AGENT_GITHUB_TOKEN")
}

/**
 * Sentinel the agent sends in place of the real GitHub credential. The sandbox
 * firewall matches requests carrying this placeholder and swaps in the real
 * token on egress, so the PAT never lives inside the VM. Used as the git remote
 * password (Basic auth) and as the API bearer (`Authorization: Bearer <this>`).
 */
export const FIREWALL_PLACEHOLDER = "FIREWALL_INJECTED_TOKEN"

/** Git username paired with the placeholder/token for Basic auth over HTTPS. */
export const GIT_HTTP_USER = "x-access-token"

/** Git author identity used for the agent's commits. */
export const GIT_AUTHOR = {
  name: optional("AGENT_GIT_NAME", "Code with Vibes Bot"),
  email: optional("AGENT_GIT_EMAIL", "bot@codewithvibes.dev"),
}

export function getFirecrawlKey(): string {
  return required("FIRECRAWL_API_KEY")
}

/** Secret shared between Vercel Cron and the trigger route. */
export function getCronSecret(): string {
  return required("CRON_SECRET")
}

/** Where posts live, relative to the repo root. */
export const POSTS_DIR = "content/posts"

/** Hard cap on agent reasoning steps to bound cost and runtime. */
export const MAX_AGENT_STEPS = 40
