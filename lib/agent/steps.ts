import "server-only"
import { Sandbox } from "@vercel/sandbox"
import { FatalError, RetryableError } from "workflow"
import { firecrawlSearch, firecrawlScrape } from "../research/firecrawl"
import { browseNewsSource } from "../research/browse"
import { provisionSandbox } from "../sandbox/provision"
import { runIn } from "../sandbox/exec"
import { REPO_DIR } from "../sandbox/provision"
import {
  remoteBranchExists,
  findOpenPr,
  createBranch,
  commitAll,
  pushBranch,
  openPullRequest,
} from "../sandbox/git"
import { readLedger, writeLedger, findSimilarTopic, songAlreadyUsed, type LedgerEntry, type Ledger } from "./ledger"
import { renderPostMdx, postPath } from "./post-writer"
import { postSpecSchema, type PostSpec } from "./validation"
import { resolveSpotifyResource } from "../spotify"
import { BASE_BRANCH } from "./config"
import type { ResearchBundle, ResearchSource } from "../research/types"

/** Default daily search angles for discovering fresh AI developments. */
const RESEARCH_QUERIES = [
  "latest AI coding tools announcement this week",
  "new large language model release developer reaction",
  "AI pair programming developer workflow trend",
]

/**
 * Step 1 — Idempotency guard. Returns the planned branch and whether a PR/branch
 * for today already exists, so the workflow can no-op on repeated daily runs.
 */
export async function checkAlreadyPublished(isoDate: string) {
  "use step"
  const branch = `agent/post-${isoDate}`
  const [branchExists, openPr] = await Promise.all([
    remoteBranchExists(branch).catch(() => false),
    findOpenPr(branch).catch(() => null),
  ])
  return { branch, alreadyDone: branchExists || Boolean(openPr), existingPr: openPr }
}

/**
 * Step 2 — Provision the sandbox: clone repo, install deps, set up agent-browser.
 * Retryable since sandbox creation can hit transient capacity errors.
 */
export async function provisionStep() {
  "use step"
  try {
    return await provisionSandbox()
  } catch (err) {
    throw new RetryableError(`Sandbox provisioning failed: ${(err as Error).message}`)
  }
}

/**
 * Step 3 — Research: Firecrawl discovery, then agent-browser deep-reads the most
 * promising sources (falling back to Firecrawl scrape). Retryable on rate limits.
 */
export async function researchTrends(sandboxId: string, browserReady: boolean): Promise<ResearchBundle> {
  "use step"
  const query = RESEARCH_QUERIES[new Date().getUTCDate() % RESEARCH_QUERIES.length]

  let candidates: ResearchSource[]
  try {
    candidates = await firecrawlSearch(query, 8)
  } catch (err) {
    const msg = (err as Error).message ?? ""
    if (/429|rate|limit|5\d\d/i.test(msg)) throw new RetryableError(`Firecrawl search transient error: ${msg}`)
    throw err
  }

  if (candidates.length === 0) {
    throw new RetryableError("Research returned no candidate sources; will retry.")
  }

  // Deep-read up to 4 sources for full context.
  const top = candidates.slice(0, 4)
  const enriched: ResearchSource[] = []
  for (const candidate of top) {
    let source: ResearchSource | null = null
    if (browserReady) {
      source = await browseNewsSource(sandboxId, candidate.url).catch(() => null)
    }
    if (!source) {
      source = await firecrawlScrape(candidate.url).catch(() => null)
    }
    enriched.push(source ?? candidate)
  }
  // Include the remaining search snippets as lighter context.
  enriched.push(...candidates.slice(4))

  return { query, gatheredAt: new Date().toISOString(), sources: enriched }
}

/**
 * Step 3.5 — Load the editorial ledger inside a durable step so ledger IO
 * never runs directly in the workflow body.
 */
export async function loadLedger(sandboxId: string): Promise<Ledger> {
  "use step"
  return readLedger(sandboxId)
}

/**
 * Step 4 — Validate the agent's output: schema, topic novelty vs ledger, song
 * novelty, and that the Spotify URL truly resolves. Fatal on unfixable issues.
 */
export async function validatePost(sandboxId: string, spec: PostSpec): Promise<PostSpec> {
  "use step"
  const parsed = postSpecSchema.safeParse(spec)
  if (!parsed.success) {
    throw new FatalError(`Agent output failed schema validation: ${parsed.error.message}`)
  }
  const post = parsed.data

  // Confirm the song resolves on Spotify's public catalog.
  const resolved = await resolveSpotifyResource(post.music.url)
  if (!resolved) {
    throw new FatalError(`Chosen Spotify URL did not resolve: ${post.music.url}`)
  }
  // Normalize to canonical metadata so the rendered card is accurate.
  post.music.url = resolved.spotifyUrl
  post.music.title = resolved.name
  post.music.artist = resolved.artists

  // Editorial de-duplication against repo-as-memory.
  const ledger = await readLedger(sandboxId)
  const keywords = [...post.tags, ...post.title.toLowerCase().split(/\s+/)].map((k) => k.toLowerCase())
  const similar = findSimilarTopic(ledger, keywords, 0.6)
  if (similar) {
    throw new FatalError(`Topic too similar to existing post "${similar.title}" (${similar.slug}).`)
  }
  if (songAlreadyUsed(ledger, { spotifyUrl: post.music.url, title: post.music.title, artist: post.music.artist })) {
    throw new FatalError(`Song "${post.music.title}" by ${post.music.artist} was already paired previously.`)
  }

  return post
}

/**
 * Step 5 — Materialize files in the sandbox: write the MDX post and append the
 * ledger entry (repo-as-memory). Both are committed together later.
 */
export async function writePostFiles(sandboxId: string, spec: PostSpec, isoDate: string) {
  "use step"
  const sandbox = await Sandbox.get({ name: sandboxId })
  const mdx = renderPostMdx(spec, isoDate)
  const relPath = postPath(spec.slug)

  await sandbox.fs.writeFile(`${REPO_DIR}/${relPath}`, mdx)

  // Append to the editorial ledger.
  const ledger = await readLedger(sandboxId)
  const entry: LedgerEntry = {
    date: isoDate,
    slug: spec.slug,
    title: spec.title,
    topic: spec.topicRationale.slice(0, 200),
    keywords: spec.tags.map((t) => t.toLowerCase()),
    song: { title: spec.music.title, artist: spec.music.artist, spotifyUrl: spec.music.url },
    sources: spec.sourceUrls,
  }
  ledger.entries.push(entry)
  await writeLedger(sandboxId, ledger)

  return { relPath }
}

/**
 * Step 6 — Quality gate: install (already done) + lint/typecheck/build in the
 * sandbox, then a smoke check that the new post parses with a resolvable song.
 * Fatal on build failure so a broken post never reaches a PR.
 */
export async function verifyBuild(sandboxId: string, slug: string) {
  "use step"
  // Type-check + build. The build compiles all MDX, catching frontmatter/syntax errors.
  // Run the build directly (no pipe) so its real exit code is observed.
  const build = await runIn(sandboxId, "pnpm build 2>&1", { env: { NEXT_TELEMETRY_DISABLED: "1" } })
  if (build.exitCode !== 0) {
    throw new FatalError(`Build failed for new post:\n${build.stdout.slice(-1500)}`)
  }

  // Smoke check: the new post file is actually present in the checkout.
  const relPath = postPath(slug)
  const exists = await runIn(sandboxId, `test -f ${JSON.stringify(relPath)} && echo OK`)
  if (!exists.stdout.includes("OK")) {
    throw new FatalError(`Post file missing after write: ${relPath}`)
  }

  return { built: true }
}

/**
 * Step 7 — Branch, commit (single reviewable commit incl. ledger), push, open PR.
 * Idempotent: re-checks branch/PR before creating.
 */
export async function commitAndOpenPr(params: {
  sandboxId: string
  branch: string
  spec: PostSpec
  isoDate: string
  research: ResearchBundle
}): Promise<string> {
  "use step"
  const { sandboxId, branch, spec, isoDate, research } = params

  const existingPr = await findOpenPr(branch).catch(() => null)
  if (existingPr) return existingPr

  await createBranch(sandboxId, branch)
  const commitMessage = [
    `post: ${spec.title}`,
    "",
    `Automated daily vibe-coding post for ${isoDate}.`,
    `Paired with "${spec.music.title}" by ${spec.music.artist}.`,
    "",
    "Co-authored-by: v0[bot] <v0[bot]@users.noreply.github.com>",
  ].join("\n")

  const committed = await commitAll(sandboxId, commitMessage)
  if (!committed) throw new FatalError("Nothing to commit — post files were not written.")

  await pushBranch(sandboxId, branch)

  const sourceList = research.sources
    .slice(0, 6)
    .map((s) => `- [${s.title}](${s.url}) _(${s.via})_`)
    .join("\n")

  const body = [
    `## ${spec.title}`,
    "",
    spec.description,
    "",
    `**Why this topic:** ${spec.topicRationale}`,
    "",
    `### Paired listening`,
    `**${spec.music.title}** — ${spec.music.artist}`,
    `[Open in Spotify](${spec.music.url})`,
    "",
    `> ${spec.music.reason}`,
    "",
    `### Sources researched`,
    sourceList || "_n/a_",
    "",
    "---",
    "_Generated autonomously by the Code with Vibes publishing agent. Review and merge to publish._",
  ].join("\n")

  return openPullRequest({
    branch,
    title: `${spec.title} (${isoDate})`,
    body,
  })
}

/** Best-effort cleanup of the sandbox after the run. */
export async function teardown(sandboxId: string) {
  "use step"
  try {
    const sandbox = await Sandbox.get({ name: sandboxId })
    await sandbox.stop()
  } catch {
    // ignore — sandbox auto-expires on timeout anyway.
  }
}

export { BASE_BRANCH }
