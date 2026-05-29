import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { exchangeCodeForTokens } from "@/lib/spotify-user"
import { getSpotifyRedirectUri } from "@/lib/spotify-oauth"

export const dynamic = "force-dynamic"

/**
 * Spotify OAuth callback. Validates the CSRF state, exchanges the code for a
 * refresh token, and renders a one-time page showing the token so the owner can
 * store it as SPOTIFY_REFRESH_TOKEN. We deliberately do NOT persist the token
 * server-side here — it belongs in an encrypted environment variable.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  const cookieStore = await cookies()
  const expectedState = cookieStore.get("spotify_oauth_state")?.value

  if (error) {
    return htmlResponse(`Spotify authorization was denied: ${escapeHtml(error)}`, true)
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return htmlResponse("Invalid or expired authorization request. Please try again.", true)
  }

  try {
    const redirectUri = getSpotifyRedirectUri(request.url)
    const { refreshToken, scope } = await exchangeCodeForTokens(code, redirectUri)

    const res = htmlResponse(
      `
      <h1>Spotify connected</h1>
      <p>Copy this refresh token and add it as the <code>SPOTIFY_REFRESH_TOKEN</code>
      environment variable in your Vercel project, then redeploy.</p>
      <p><strong>Granted scopes:</strong> ${escapeHtml(scope)}</p>
      <pre class="token">${escapeHtml(refreshToken)}</pre>
      <p class="muted">This token is shown only once and is not stored on the server.</p>
      `,
    )
    res.cookies.delete("spotify_oauth_state")
    return res
  } catch (e) {
    return htmlResponse(
      `Could not complete Spotify connection: ${escapeHtml((e as Error).message)}`,
      true,
    )
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function htmlResponse(inner: string, isError = false): NextResponse {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Spotify Connection</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background:#0f0d0b; color:#f5efe6; margin:0; display:flex; min-height:100vh; align-items:center; justify-content:center; padding:24px; }
  main { max-width:640px; width:100%; background:#1a1714; border:1px solid #2c2722; border-radius:16px; padding:32px; }
  h1 { margin-top:0; color:${isError ? "#f0a08a" : "#e8b84b"}; font-size:1.5rem; }
  code { background:#2c2722; padding:2px 6px; border-radius:4px; }
  pre.token { background:#0f0d0b; border:1px solid #2c2722; border-radius:8px; padding:16px; overflow-x:auto; user-select:all; word-break:break-all; white-space:pre-wrap; }
  .muted { color:#a89e90; font-size:0.875rem; }
  a { color:#e8b84b; }
</style>
</head>
<body><main>${inner}<p><a href="/agent">Back to the agent dashboard</a></p></main></body>
</html>`
  return new NextResponse(body, {
    status: isError ? 400 : 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // The success page renders a one-time refresh token; never cache it.
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
