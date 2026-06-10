import "server-only"
import { cookies } from "next/headers"
import { createHash, timingSafeEqual } from "node:crypto"

/**
 * Minimal operator authorization for the agent control surface.
 *
 * The dashboard, the manual trigger server action, and the run-status endpoint
 * all write or read privileged workflow state (branches, PRs, run results), so
 * they must be gated behind an operator check — not merely "has a Spotify
 * account linked". Authentication is a shared operator secret (OPERATOR_SECRET,
 * falling back to CRON_SECRET) exchanged for an httpOnly cookie holding a
 * derived token (never the raw secret).
 */

const COOKIE = "cwv_operator"
const MAX_AGE = 60 * 60 * 12 // 12h

function operatorSecret(): string | undefined {
  return process.env.OPERATOR_SECRET || process.env.CRON_SECRET || undefined
}

function tokenFor(secret: string): string {
  return createHash("sha256").update(`cwv-operator:${secret}`).digest("hex")
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/** True when the caller presents a valid operator cookie. */
export async function isOperator(): Promise<boolean> {
  const secret = operatorSecret()
  if (!secret) return false
  const token = (await cookies()).get(COOKIE)?.value
  if (!token) return false
  return safeEqual(token, tokenFor(secret))
}

/** True when operator auth is even possible (a secret is configured). */
export function operatorAuthConfigured(): boolean {
  return Boolean(operatorSecret())
}

/** Exchange the operator secret for a session cookie. Returns success. */
export async function signInOperator(provided: string): Promise<boolean> {
  const secret = operatorSecret()
  if (!secret) return false
  if (!safeEqual(provided, secret)) return false
  ;(await cookies()).set(COOKIE, tokenFor(secret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  })
  return true
}

/** Clear the operator session. */
export async function signOutOperator(): Promise<void> {
  ;(await cookies()).delete(COOKIE)
}
