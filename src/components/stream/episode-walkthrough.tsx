"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAudioPlayer, type PlayableTrack } from "@/contexts/audio-player-context";
import {
  X,
  Play,
  Pause,
  Mic,
  ChevronDown,
  Music,
  Download,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

interface EpisodeData {
  _id: Id<"episodes">;
  title: string;
  airDate?: string;
  description?: string;
  coverImageUrl?: string;
  trackCount?: number;
}

interface TrackData {
  _id: Id<"tracks">;
  title: string;
  artistName: string;
  albumArtUrl?: string;
  youtubeVideoId?: string;
  spotifyTrackId?: string;
  position?: number;
}

interface EpisodeWalkthroughProps {
  episode: EpisodeData;
  tracks: TrackData[];
  onClose: () => void;
  onTellMeAbout: () => void;
}

// ─────────────────────────────────────────────────────────────
//  Component
// ─────────────────────────────────────────────────────────────

export function EpisodeWalkthrough({
  episode,
  tracks,
  onClose,
  onTellMeAbout,
}: EpisodeWalkthroughProps) {
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const createPlaylist = useMutation(api.playlists.create);

  const handleExport = async (platform: string) => {
    try {
      const trackIds = tracks.map((t) => t._id);

      await createPlaylist({
        title: episode.title,
        trackIds,
        generatedFrom: {
          type: "episode_walkthrough",
          episodeId: episode._id,
        },
      });

      if (platform === "m3u") {
        setExportStatus("Playlist saved! (.m3u download coming soon)");
      } else {
        setExportStatus(`Playlist exported to ${platform}!`);
      }

      // Clear status after 3 seconds
      setTimeout(() => setExportStatus(null), 3000);
    } catch {
      setExportStatus("Export failed — please try again.");
      setTimeout(() => setExportStatus(null), 3000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-wood">
      {/* ── Episode Header ── */}
      <div className="flex-shrink-0 p-4 border-b border-edge">
        <div className="flex items-start gap-3">
          {/* Cover image */}
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-shelf">
            {episode.coverImageUrl ? (
              <img
                src={episode.coverImageUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber/20 to-shelf flex items-center justify-center">
                <span className="text-amber text-xl font-editorial font-bold">
                  EP
                </span>
              </div>
            )}
          </div>

          {/* Title + metadata */}
          <div className="flex-1 min-w-0">
            <h3 className="text-cream font-editorial font-bold text-base leading-tight line-clamp-2">
              {episode.title}
            </h3>
            {episode.airDate && (
              <p className="text-sleeve text-xs font-data mt-1">
                {episode.airDate}
              </p>
            )}
            {episode.description && (
              <p className="text-shadow text-xs mt-1.5 line-clamp-2 leading-relaxed">
                {episode.description}
              </p>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-sleeve hover:text-cream hover:bg-shelf transition-colors"
            aria-label="Close walkthrough"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Action Buttons ── */}
      <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2 border-b border-edge">
        {/* Tell me about this episode */}
        <Button
          onClick={onTellMeAbout}
          className="bg-amber text-wood hover:bg-amber/90 font-data text-xs h-8"
          size="sm"
        >
          <Mic className="w-3.5 h-3.5" />
          Tell me about this episode
        </Button>

        {/* Export Playlist dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-vinyl-blue hover:text-cream hover:bg-shelf font-data text-xs h-8"
            >
              <Download className="w-3.5 h-3.5" />
              Export Playlist
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="bg-shelf border-edge min-w-[160px]"
          >
            <DropdownMenuItem
              onClick={() => handleExport("Spotify")}
              className="text-cream text-xs hover:bg-wood cursor-pointer"
            >
              <Music className="w-3.5 h-3.5 text-led-green" />
              Spotify
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleExport("Apple Music")}
              className="text-cream text-xs hover:bg-wood cursor-pointer"
            >
              <Music className="w-3.5 h-3.5 text-vinyl-blue" />
              Apple Music
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleExport("YouTube Music")}
              className="text-cream text-xs hover:bg-wood cursor-pointer"
            >
              <Music className="w-3.5 h-3.5 text-amber" />
              YouTube Music
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleExport("m3u")}
              className="text-cream text-xs hover:bg-wood cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sleeve" />
              Download .m3u
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Export status toast */}
      {exportStatus && (
        <div className="flex-shrink-0 px-4 py-2 bg-shelf">
          <p className="text-led-green text-xs font-data">{exportStatus}</p>
        </div>
      )}

      {/* ── Tracklist ── */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-0.5">
          <p className="text-sleeve text-[10px] font-data label-uppercase tracking-wider mb-2">
            {tracks.length} Tracks
          </p>

          {tracks.map((track, index) => (
            <TrackRow
              key={track._id}
              track={track}
              position={track.position ?? index + 1}
            />
          ))}

          {tracks.length === 0 && (
            <p className="text-shadow text-xs text-center py-8">
              No tracks found for this episode.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Track Row
// ─────────────────────────────────────────────────────────────

function TrackRow({
  track,
  position,
}: {
  track: TrackData;
  position: number;
}) {
  const { currentTrack, isPlaying, play, pause, resume } = useAudioPlayer();
  const [showSpotify, setShowSpotify] = useState(false);

  const isActive = currentTrack?.id === track._id;
  const isTrackPlaying = isActive && isPlaying;

  const handlePlayClick = () => {
    if (!track.youtubeVideoId) {
      // No YouTube — toggle Spotify embed instead
      if (track.spotifyTrackId) setShowSpotify((prev) => !prev);
      return;
    }

    const playable: PlayableTrack = {
      id: track._id,
      title: track.title,
      artistName: track.artistName,
      albumArtUrl: track.albumArtUrl,
      youtubeVideoId: track.youtubeVideoId,
    };

    if (isActive && isTrackPlaying) {
      pause();
    } else if (isActive) {
      resume();
    } else {
      play(playable);
    }
  };

  return (
    <div>
      <div className="group flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-shelf/70 transition-colors">
        {/* Position number */}
        <span className="w-5 text-right text-shadow text-[11px] font-data flex-shrink-0">
          {position}
        </span>

        {/* Album art thumbnail */}
        {track.albumArtUrl ? (
          <img
            src={track.albumArtUrl}
            alt=""
            className="w-8 h-8 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded bg-shelf flex-shrink-0 flex items-center justify-center">
            <Music className="w-3 h-3 text-shadow" />
          </div>
        )}

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-xs font-medium truncate leading-tight",
            isActive ? "text-gold" : "text-cream"
          )}>
            {track.title}
          </p>
          <p className="text-sleeve text-[11px] truncate leading-tight">
            {track.artistName}
          </p>
        </div>

        {/* Spotify badge — click to toggle embed */}
        {track.spotifyTrackId && (
          <button
            onClick={() => setShowSpotify((prev) => !prev)}
            className={cn(
              "flex-shrink-0 text-[9px] font-data px-1.5 py-0.5 rounded-full border transition-colors",
              showSpotify
                ? "border-led-green/40 text-led-green bg-led-green/10"
                : "border-edge text-sleeve hover:text-led-green hover:border-led-green/30"
            )}
          >
            Spotify
          </button>
        )}

        {/* Play button */}
        {(track.youtubeVideoId || track.spotifyTrackId) && (
          <button
            onClick={handlePlayClick}
            className={cn(
              "flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-all",
              isActive
                ? "text-amber"
                : "text-sleeve hover:text-amber opacity-0 group-hover:opacity-100"
            )}
            aria-label={`Play ${track.title}`}
          >
            {isTrackPlaying ? (
              <Pause className="w-3.5 h-3.5" fill="currentColor" />
            ) : (
              <Play className="w-3.5 h-3.5" fill="currentColor" />
            )}
          </button>
        )}
      </div>

      {/* Spotify embed — compact player */}
      {showSpotify && track.spotifyTrackId && (
        <div className="ml-8 mr-2 my-1">
          <iframe
            src={`https://open.spotify.com/embed/track/${track.spotifyTrackId}?utm_source=generator&theme=0`}
            width="100%"
            height="80"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            style={{ borderRadius: "12px" }}
          />
        </div>
      )}
    </div>
  );
}
