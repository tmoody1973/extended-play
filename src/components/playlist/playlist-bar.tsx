"use client";

import { useState } from "react";

interface PlaylistTrack {
  id: string;
  title: string;
  artistName: string;
  albumArtUrl?: string;
}

interface PlaylistBarProps {
  title?: string;
  tracks?: PlaylistTrack[];
  onExport?: (platform: string) => void;
}

export function PlaylistBar({ title = "Playlist", tracks = [], onExport }: PlaylistBarProps) {
  const [showExport, setShowExport] = useState(false);

  return (
    <footer className="h-16 flex items-center px-4 border-t border-edge bg-wood flex-shrink-0 gap-3">
      <span className="label-uppercase text-[10px] text-cream flex-shrink-0">
        {title}
      </span>

      {/* Album art thumbnail strip */}
      <div className="flex gap-1.5 overflow-x-auto flex-1 min-w-0 py-1">
        {tracks.map((track) => (
          <div
            key={track.id}
            className="w-10 h-10 rounded bg-shelf flex-shrink-0 bg-cover bg-center group relative"
            style={
              track.albumArtUrl
                ? { backgroundImage: `url(${track.albumArtUrl})` }
                : undefined
            }
            title={`${track.artistName} — ${track.title}`}
          >
            {!track.albumArtUrl && (
              <span className="text-shadow text-xs flex items-center justify-center h-full">
                &#9834;
              </span>
            )}
          </div>
        ))}
        {tracks.length === 0 && (
          <p className="text-shadow text-[11px] self-center">No tracks yet</p>
        )}
      </div>

      {/* Track count */}
      {tracks.length > 0 && (
        <span className="text-sleeve text-[10px] font-data flex-shrink-0">
          {tracks.length} tracks
        </span>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0 relative">
        <button className="label-uppercase text-[10px] text-gold hover:text-cream transition-colors">
          + Add
        </button>
        <button
          className="label-uppercase text-[10px] text-gold hover:text-cream transition-colors"
          onClick={() => setShowExport(!showExport)}
        >
          Export &#9662;
        </button>
        {showExport && (
          <div className="absolute bottom-full right-0 mb-2 bg-shelf border border-edge rounded-lg p-1 min-w-[140px] shadow-vinyl">
            {["Spotify", "Apple Music", "YouTube Music", ".m3u"].map((p) => (
              <button
                key={p}
                onClick={() => {
                  onExport?.(p.toLowerCase().replace(/[.\s]/g, "_"));
                  setShowExport(false);
                }}
                className="w-full text-left text-sm text-cream hover:text-gold hover:bg-wood px-3 py-1.5 rounded transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
}
