import { ExternalLink, Music4, Play } from "lucide-react"
import { cn } from "@/lib/utils"

interface MusicLinkProps {
  label: string
  title: string
  artist: string
  platform: string
  url: string
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
  className,
}: MusicLinkProps) {
  const { tint, name } = platformStyles(platform)

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
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
          aria-hidden="true"
        >
          <Play className="h-5 w-5 translate-x-0.5 fill-current" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-serif text-lg font-medium leading-tight text-foreground">
            {title}
          </p>
          <p className="truncate text-sm text-muted-foreground">{artist}</p>
        </div>
      </div>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Listen on <span className={cn("font-semibold", "underline-offset-2")}>{name}</span>
        <ExternalLink className="h-4 w-4" />
      </a>
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
