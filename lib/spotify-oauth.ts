import "server-only"

/**
 * Compute the OAuth redirect URI for the Spotify connect flow.
 *
 * Spotify requires HTTPS redirect URIs, with the sole exception of
 * http://127.0.0.1 for local development (http://localhost is NOT allowed).
 * The returned value must match a Redirect URI registered in the Spotify
 * dashboard exactly.
 */
export function getSpotifyRedirectUri(requestUrl: string): string {
  const url = new URL(requestUrl)
  const callbackPath = "/api/spotify/callback"

  // Local development: force the 127.0.0.1 loopback (http is allowed there only).
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return `http://127.0.0.1:${url.port || "3000"}${callbackPath}`
  }

  // Everything else must be HTTPS.
  return `https://${url.host}${callbackPath}`
}
