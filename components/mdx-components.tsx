import type { ComponentPropsWithoutRef, ReactNode } from "react"

type MDXComponents = Record<string, (props: ComponentPropsWithoutRef<"div"> & { href?: string }) => ReactNode>

export const mdxComponents: MDXComponents = {
  h2: ({ children }) => (
    <h2 className="mt-10 font-serif text-2xl font-medium tracking-tight text-balance">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 font-serif text-xl font-medium tracking-tight">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mt-5 leading-relaxed text-foreground/85">{children}</p>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="mt-5 list-disc space-y-2 pl-5 text-foreground/85 marker:text-primary">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-5 list-decimal space-y-2 pl-5 text-foreground/85 marker:text-primary">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mt-6 border-l-2 border-primary pl-5 font-serif text-lg italic text-foreground/90">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-primary">
      {children}
    </code>
  ),
  hr: () => <hr className="my-10 border-border/60" />,
}
