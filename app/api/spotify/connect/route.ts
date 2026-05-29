import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { buildAuthorizeUrl } from "@/lib/spotify-user"
import { getSpotifyRedirectUri } from "@/lib/spotify-oauth"

export const dynamic = "force-dynamic"

/**
 * Starts the Spotify Authorization Code flow for the blog owner.
 * Sets a short-lived, httpOnly state cookie to protect against CSRF, then
 * redirects to Spotify's consent screen requesting the minimum scopes.
 */
export async function GET(request: Request) {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Spotify client credentials are not configured." },
      { status: 400 },
    )
  }

  const redirectUri = getSpotifyRedirectUri(request.url)
  const state = randomBytes(16).toString("hex")
  const authorizeUrl = buildAuthorizeUrl(redirectUri, state)

  const res = NextResponse.redirect(authorizeUrl)
  res.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    secure: redirectUri.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  })
  return res
}
