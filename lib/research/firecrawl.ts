import "server-only"
import Firecrawl from "@mendable/firecrawl-js"
import { getFirecrawlKey } from "@/lib/agent/config"
import type { ResearchSource } from "./types"

/**
 * Firecrawl-powered discovery + scraping for AI-news research.
 * Used inside workflow steps; throws on hard failures so the step can retry.
 */

let client: Firecrawl | null = null
function getClient(): Firecrawl {
  if (!client) client = new Firecrawl({ apiKey: getFirecrawlKey() })
  return client
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return ""
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * Search the web for a query and return normalized candidate sources.
 * Discovery only — full text is gathered later via scrape/agent-browser.
 */
export async function firecrawlSearch(
  query: string,
  limit = 8,
): Promise<ResearchSource[]> {
  const res = await getClient().search(query, {
    limit,
    sources: ["web", "news"],
  })

  const buckets = [
    ...((res.web ?? []) as Array<Record<string, unknown>>),
    ...((res.news ?? []) as Array<Record<string, unknown>>),
  ]

  const seen = new Set<string>()
  const sources: ResearchSource[] = []

  for (const item of buckets) {
    const url = String(item.url ?? "")
    if (!url || seen.has(url)) continue
    seen.add(url)
    sources.push({
      title: String(item.title ?? url),
      url,
      snippet: truncate(
        (item.description as string) ?? (item.snippet as string) ?? "",
        400,
      ),
      content: truncate(item.markdown as string, 2000),
      via: "firecrawl-search",
    })
  }

  // Firecrawl applies `limit` per source bucket, so the merged list can exceed
  // it — enforce the wrapper's contract of returning at most `limit` results.
  return sources.slice(0, limit)
}

/** Scrape a single URL into clean markdown for deeper reading. */
export async function firecrawlScrape(url: string): Promise<ResearchSource> {
  const doc = await getClient().scrape(url, { formats: ["markdown"] })
  return {
    title: doc.metadata?.title ?? url,
    url,
    snippet: truncate(doc.metadata?.description, 400),
    content: truncate(doc.markdown, 6000),
    via: "firecrawl-scrape",
  }
}
