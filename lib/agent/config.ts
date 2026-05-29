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

/** Where posts and the editorial ledger live, relative to the repo root. */
export const POSTS_DIR = "content/posts"
export const LEDGER_PATH = "content/editorial-ledger.json"

/** Hard cap on agent reasoning steps to bound cost and runtime. */
export const MAX_AGENT_STEPS = 40
