import "server-only"
import { runIn } from "@/lib/sandbox/exec"
import type { ResearchSource } from "./types"

/**
 * Deep-read a news source with agent-browser running inside the sandbox VM.
 *
 * agent-browser is a native CLI that drives a real (headless) Chrome, so it
 * handles JS-rendered pages that simple HTTP scraping misses. We navigate to
 * the URL, read the page title and main text, then close the session.
 *
 * Best-effort: if agent-browser/Chrome is unavailable, returns null so callers
 * fall back to Firecrawl scraping.
 */
export async function browseNewsSource(
  sandboxId: string,
  url: string,
): Promise<ResearchSource | null> {
  // Single-quote-safe URL for the shell.
  const safeUrl = url.replace(/'/g, "'\\''")
  const script = [
    `agent-browser open '${safeUrl}' >/dev/null 2>&1 || exit 42`,
    `agent-browser wait 1500 >/dev/null 2>&1 || true`,
    `echo '<<<TITLE>>>'`,
    `agent-browser get title 2>/dev/null || true`,
    `echo '<<<TEXT>>>'`,
    `agent-browser get text body 2>/dev/null || true`,
    `agent-browser close --all >/dev/null 2>&1 || true`,
  ].join("\n")

  const res = await runIn(sandboxId, script)
  if (res.exitCode === 42) return null

  const titleMatch = res.stdout.split("<<<TITLE>>>")[1]?.split("<<<TEXT>>>")[0] ?? ""
  const textMatch = res.stdout.split("<<<TEXT>>>")[1] ?? ""
  const content = textMatch.trim()
  if (!content) return null

  return {
    title: titleMatch.trim() || url,
    url,
    snippet: content.slice(0, 400),
    content: content.slice(0, 6000),
    via: "agent-browser",
  }
}
