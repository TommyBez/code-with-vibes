import { ExternalLink, Music4, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { SpotifyEmbed } from "@/components/spotify-embed"
import type { ResolvedSpotifyResource } from "@/lib/spotify"

interface MusicLinkProps {
  label: string
  title: string
  artist: string
  platform: string
  url: string
  spotify?: ResolvedSpotifyResource | null
  className?: string
}

function platformStyles(platform: string) {
  const key = platform.toLowerCase()
  if (key.includes("spotify")) {
    return { tint: "text-chart-4", name: "Spotify" }
  }
  if (key.includes("youtube")) {
    return { tint: "text-chart-3", name: "YouTube" }
  }
  return { tint: "text-primary", name: platform }
}

export function MusicLink({
  label,
  title,
  artist,
  platform,
  url,
  spotify,
  className,
}: MusicLinkProps) {
  const { name } = platformStyles(platform)

  // Prefer live Spotify catalog data when available, falling back to frontmatter.
  const displayTitle = spotify?.name ?? title
  const displayArtist = spotify?.artists ?? artist
  const listenUrl = spotify?.spotifyUrl ?? url
  const listenName = spotify ? "Spotify" : name

  return (
    <aside
      className={cn(
        "rounded-xl border border-primary/30 bg-card p-5 shadow-sm",
        className,
      )}
      aria-label="Paired music for this article"
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
        <Music4 className="h-3.5 w-3.5" />
        {label}
      </div>

      <div className="mt-4 flex items-center gap-4">
        {spotify?.image ? (
          // Referenced directly from Spotify's CDN (not re-hosted or cached).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spotify.image.url || "/placeholder.svg"}
            alt={`Cover art for ${displayTitle} by ${displayArtist}`}
            width={56}
            height={56}
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded-md object-cover shadow-sm"
          />
        ) : (
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
            aria-hidden="true"
          >
            <Play className="h-5 w-5 translate-x-0.5 fill-current" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-serif text-lg font-medium leading-tight text-foreground">
            {displayTitle}
          </p>
          <p className="truncate text-sm text-muted-foreground">{displayArtist}</p>
        </div>
      </div>

      {spotify ? (
        <SpotifyEmbed embedUrl={spotify.embedUrl} title={displayTitle} />
      ) : null}

      <a
        href={listenUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Listen on <span className="font-semibold underline-offset-2">{listenName}</span>
        <ExternalLink className="h-4 w-4" />
      </a>

      {spotify ? (
        <p className="mt-3 text-center text-[0.7rem] uppercase tracking-wider text-muted-foreground">
          Music data and playback provided by Spotify
        </p>
      ) : null}
    </aside>
  )
}

export function MusicTag({
  title,
  artist,
  platform,
}: Pick<MusicLinkProps, "title" | "artist" | "platform">) {
  const { name } = platformStyles(platform)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Music4 className="h-3.5 w-3.5 text-primary" />
      <span className="text-foreground/80">{title}</span>
      <span aria-hidden="true">{"\u00B7"}</span>
      <span>{artist}</span>
      <span aria-hidden="true">{"\u00B7"}</span>
      <span>{name}</span>
    </span>
  )
}
