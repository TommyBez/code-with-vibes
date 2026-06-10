/** A single researched source the agent can reason over and cite. */
export interface ResearchSource {
  title: string
  url: string
  /** Short snippet from search, or the lead paragraph. */
  snippet: string
  /** Full or partial article text gathered by scraping/crawling. May be empty. */
  content: string
  /** How this source was gathered. */
  via: "firecrawl-search" | "firecrawl-scrape" | "agent-browser"
}

export interface ResearchBundle {
  query: string
  gatheredAt: string
  sources: ResearchSource[]
}
