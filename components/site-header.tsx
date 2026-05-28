import Link from "next/link"
import { Disc3 } from "lucide-react"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <Disc3 className="h-5 w-5 text-primary transition-transform duration-700 group-hover:rotate-180" />
          <span className="font-serif text-lg font-medium tracking-tight">
            Code with Vibes
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link
            href="/"
            className="transition-colors hover:text-foreground"
          >
            Writing
          </Link>
          <Link
            href="/about"
            className="transition-colors hover:text-foreground"
          >
            About
          </Link>
        </nav>
      </div>
    </header>
  )
}
