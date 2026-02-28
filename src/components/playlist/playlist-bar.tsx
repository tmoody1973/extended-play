"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Play, Pause, Download } from "lucide-react";
import { useAudioPlayer, type PlayableTrack } from "@/contexts/audio-player-context";
import { Id } from "../../../convex/_generated/dataModel";

interface PlaylistTrack {
  id: string;
  title: string;
  artistName: string;
  albumArtUrl?: string;
  youtubeVideoId?: string;
  spotifyTrackId?: string;
}

interface PlaylistBarProps {
  playlistId?: Id<"playlists">;
  title?: string;
  tracks?: PlaylistTrack[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlaylistBar({ playlistId, title = "My Crate", tracks = [] }: PlaylistBarProps) {
  const [showExport, setShowExport] = useState(false);
  const { currentTrack, isPlaying, progress, currentTime, duration, play, pause, resume, seek } =
    useAudioPlayer();

  // Reactive m3u query — only runs when we have a playlistId
  const m3uContent = useQuery(
    api.playlists.generateM3u,
    playlistId ? { playlistId } : "skip"
  );

  const handleMiniPlayerToggle = () => {
    if (!currentTrack) return;
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  };

  const handleTrackClick = (track: PlaylistTrack) => {
    if (!track.youtubeVideoId) return;
    const playable: PlayableTrack = {
      id: track.id,
      title: track.title,
      artistName: track.artistName,
      albumArtUrl: track.albumArtUrl,
      youtubeVideoId: track.youtubeVideoId,
    };
    if (currentTrack?.id === track.id && isPlaying) {
      pause();
    } else if (currentTrack?.id === track.id) {
      resume();
    } else {
      play(playable);
    }
  };

  const handleExport = (platform: string) => {
    if (platform === "m3u" && m3uContent) {
      const blob = new Blob([m3uContent], { type: "audio/x-mpegurl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9 ]/g, "").trim()}.m3u`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (platform === "spotify") {
      // Open Spotify search with first track as fallback
      const q = tracks[0] ? `${tracks[0].artistName} ${tracks[0].title}` : title;
      window.open(`https://open.spotify.com/search/${encodeURIComponent(q)}`, "_blank");
    } else if (platform === "youtube_music") {
      const q = tracks[0] ? `${tracks[0].artistName} ${tracks[0].title}` : title;
      window.open(`https://music.youtube.com/search?q=${encodeURIComponent(q)}`, "_blank");
    }
    setShowExport(false);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seek(Math.max(0, Math.min(1, percent)));
  };

  return (
    <footer className="border-t border-edge bg-wood flex-shrink-0">
      {/* Mini-player (shows when a track is playing) */}
      {currentTrack && (
        <div className="flex items-center gap-3 px-4 pt-2 pb-1">
          {/* Album art */}
          {currentTrack.albumArtUrl ? (
            <img
              src={currentTrack.albumArtUrl}
              alt=""
              className="w-9 h-9 rounded-sm object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-sm bg-shelf flex-shrink-0 flex items-center justify-center text-gold text-xs font-editorial font-bold">
              {currentTrack.title.charAt(0)}
            </div>
          )}

          {/* Track info */}
          <div className="flex-1 min-w-0">
            <div className="text-cream text-xs truncate">{currentTrack.title}</div>
            {currentTrack.artistName && (
              <div className="text-sleeve text-[10px] truncate">{currentTrack.artistName}</div>
            )}
          </div>

          {/* Time */}
          <span className="text-[10px] font-data text-sleeve flex-shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Play/pause */}
          <button
            onClick={handleMiniPlayerToggle}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gold text-walnut flex-shrink-0 hover:brightness-110 transition-all"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5" fill="currentColor" />
            ) : (
              <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
            )}
          </button>
        </div>
      )}

      {/* Progress bar (only when playing) */}
      {currentTrack && (
        <div
          className="h-1 mx-4 mb-1 bg-edge rounded-full cursor-pointer"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-gold rounded-full transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* Main bar */}
      <div className="h-14 flex items-center px-4 gap-3">
        <span className="label-uppercase text-[10px] text-cream flex-shrink-0">
          {title}
        </span>

        {/* Album art thumbnail strip */}
        <div className="flex gap-1.5 overflow-x-auto flex-1 min-w-0 py-1 scrollbar-none">
          {tracks.map((track) => {
            const isActive = currentTrack?.id === track.id;
            return (
              <button
                key={track.id}
                onClick={() => handleTrackClick(track)}
                className={`w-10 h-10 rounded flex-shrink-0 bg-cover bg-center relative overflow-hidden transition-all ${
                  isActive ? "ring-1 ring-gold" : "hover:brightness-110"
                } ${!track.youtubeVideoId ? "cursor-default" : ""}`}
                style={
                  track.albumArtUrl
                    ? { backgroundImage: `url(${track.albumArtUrl})` }
                    : { backgroundColor: "var(--color-shelf, #252018)" }
                }
                title={`${track.artistName} — ${track.title}`}
              >
                {!track.albumArtUrl && (
                  <span className="text-shadow text-xs flex items-center justify-center h-full">
                    &#9834;
                  </span>
                )}
              </button>
            );
          })}
          {tracks.length === 0 && (
            <p className="text-shadow text-[11px] self-center italic">
              Ask the curator to build you a crate...
            </p>
          )}
        </div>

        {/* Track count */}
        {tracks.length > 0 && (
          <span className="text-sleeve text-[10px] font-data flex-shrink-0">
            {tracks.length} tracks
          </span>
        )}

        {/* Export */}
        {tracks.length > 0 && (
          <div className="flex gap-2 flex-shrink-0 relative">
            <button
              className="label-uppercase text-[10px] text-gold hover:text-cream transition-colors flex items-center gap-1"
              onClick={() => setShowExport(!showExport)}
            >
              <Download className="w-3 h-3" />
              Export
            </button>
            {showExport && (
              <div className="absolute bottom-full right-0 mb-2 bg-shelf border border-edge rounded-lg p-1 min-w-[140px] shadow-vinyl z-50">
                <button
                  onClick={() => handleExport("m3u")}
                  className="w-full text-left text-sm text-cream hover:text-gold hover:bg-wood px-3 py-1.5 rounded transition-colors"
                >
                  .m3u Download
                </button>
                <button
                  onClick={() => handleExport("spotify")}
                  className="w-full text-left text-sm text-cream hover:text-gold hover:bg-wood px-3 py-1.5 rounded transition-colors"
                >
                  Spotify
                </button>
                <button
                  onClick={() => handleExport("youtube_music")}
                  className="w-full text-left text-sm text-cream hover:text-gold hover:bg-wood px-3 py-1.5 rounded transition-colors"
                >
                  YouTube Music
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
