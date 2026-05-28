"use client"

import { useState } from "react"

interface SpotifyEmbedProps {
  embedUrl: string
  title: string
}

/**
 * Official Spotify iframe embed. Playback is served directly by Spotify, which
 * keeps us compliant with the Developer Terms (content streams from Spotify and
 * is attributed to Spotify; nothing is cached or re-hosted).
 */
export function SpotifyEmbed({ embedUrl, title }: SpotifyEmbedProps) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative mt-4 overflow-hidden rounded-xl" style={{ height: 152 }}>
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse rounded-xl bg-secondary"
          aria-hidden="true"
        />
      )}
      <iframe
        title={`Spotify player: ${title}`}
        src={embedUrl}
        width="100%"
        height="152"
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        onLoad={() => setLoaded(true)}
        className="relative rounded-xl"
        style={{ border: 0 }}
      />
    </div>
  )
}
