export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/60">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
        <p className="font-serif italic text-foreground">
          Press play. Then push code.
        </p>
        <p>
          {"\u00A9"} {new Date().getFullYear()} Code with Vibes. Written between
          tracks.
        </p>
      </div>
    </footer>
  )
}
