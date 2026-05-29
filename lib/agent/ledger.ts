import "server-only"
import { Sandbox } from "@vercel/sandbox"
import { REPO_DIR } from "../sandbox/provision"
import { LEDGER_PATH } from "./config"

/** One published (or PR-pending) entry in the editorial memory. */
export interface LedgerEntry {
  date: string // YYYY-MM-DD the post was generated
  slug: string
  title: string
  topic: string
  /** Lowercased keywords used for cheap topic-overlap de-duplication. */
  keywords: string[]
  song: {
    title: string
    artist: string
    spotifyUrl: string
  }
  sources: string[] // URLs the post drew from
}

export interface Ledger {
  entries: LedgerEntry[]
  /** Free-form, agent-maintained notes about ongoing content strategy. */
  strategyNotes: string
}

const EMPTY_LEDGER: Ledger = { entries: [], strategyNotes: "" }

function ledgerAbsPath(): string {
  return `${REPO_DIR}/${LEDGER_PATH}`
}

/** Read the ledger from the sandbox working tree, tolerating a missing file. */
export async function readLedger(sandboxId: string): Promise<Ledger> {
  const sandbox = await Sandbox.get({ name: sandboxId })
  try {
    const text = await sandbox.fs.readFile(ledgerAbsPath(), "utf8")
    if (!text.trim()) return { ...EMPTY_LEDGER }
    const parsed = JSON.parse(text) as Partial<Ledger>
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      strategyNotes: typeof parsed.strategyNotes === "string" ? parsed.strategyNotes : "",
    }
  } catch {
    // Missing file or invalid JSON → start fresh rather than failing the run.
    return { ...EMPTY_LEDGER }
  }
}

/** Persist the ledger back into the sandbox working tree (committed later). */
export async function writeLedger(sandboxId: string, ledger: Ledger): Promise<void> {
  const sandbox = await Sandbox.get({ name: sandboxId })
  const content = JSON.stringify(ledger, null, 2) + "\n"
  await sandbox.fs.writeFile(ledgerAbsPath(), content)
}

/**
 * Cheap topic-overlap guard: returns the most similar prior entry if its
 * keyword set overlaps the candidate beyond `threshold` (Jaccard similarity).
 */
export function findSimilarTopic(
  ledger: Ledger,
  keywords: string[],
  threshold = 0.5,
): LedgerEntry | null {
  const candidate = new Set(keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))
  if (candidate.size === 0) return null

  let best: { entry: LedgerEntry; score: number } | null = null
  for (const entry of ledger.entries) {
    const prior = new Set(entry.keywords.map((k) => k.toLowerCase().trim()))
    if (prior.size === 0) continue
    const intersection = [...candidate].filter((k) => prior.has(k)).length
    const union = new Set([...candidate, ...prior]).size
    const score = union === 0 ? 0 : intersection / union
    if (!best || score > best.score) best = { entry, score }
  }
  return best && best.score >= threshold ? best.entry : null
}

/** True if a song (by Spotify URL or title+artist) has already been paired. */
export function songAlreadyUsed(
  ledger: Ledger,
  song: { spotifyUrl: string; title: string; artist: string },
): boolean {
  const url = song.spotifyUrl.split("?")[0].toLowerCase()
  const key = `${song.title}__${song.artist}`.toLowerCase()
  return ledger.entries.some((e) => {
    const eUrl = e.song.spotifyUrl.split("?")[0].toLowerCase()
    const eKey = `${e.song.title}__${e.song.artist}`.toLowerCase()
    return eUrl === url || eKey === key
  })
}
