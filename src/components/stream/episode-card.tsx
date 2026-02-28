"use client";

import { useAudioPlayer, type PlayableTrack } from "@/contexts/audio-player-context";
import { Play, Pause } from "lucide-react";

interface EpisodeTrack {
  id: string;
  title: string;
  artistName?: string;
  albumArtUrl?: string;
  youtubeVideoId?: string;
  position?: number;
}

interface EpisodeCardProps {
  title: string;
  airDate?: string;
  description?: string;
  coverImageUrl?: string;
  tracks?: EpisodeTrack[];
}

export function EpisodeCard({
  title,
  airDate,
  description,
  coverImageUrl,
  tracks = [],
}: EpisodeCardProps) {
  const { currentTrack, isPlaying, play, pause, resume } = useAudioPlayer();

  const visibleTracks = tracks.slice(0, 6);
  const remaining = tracks.length - visibleTracks.length;

  const handlePlay = (track: EpisodeTrack) => {
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

  return (
    <div className="bg-shelf rounded-lg p-4 shadow-vinyl animate-slide-up">
      {/* Header: cover image or gradient + title/date */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-14 h-14 rounded-md overflow-hidden flex-shrink-0 bg-wood">
          {coverImageUrl ? (
            <img
              src={coverImageUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gold/20 to-wood flex items-center justify-center">
              <span className="text-gold text-lg font-editorial font-bold">EP</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-cream font-editorial font-bold text-sm leading-tight line-clamp-2">
            {title}
          </h4>
          {airDate && (
            <p className="text-sleeve text-[10px] font-data mt-0.5">{airDate}</p>
          )}
          {description && (
            <p className="text-cream/60 text-xs mt-1 line-clamp-2 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Compact tracklist */}
      {visibleTracks.length > 0 && (
        <div className="space-y-0.5">
          {visibleTracks.map((track) => {
            const isActive = currentTrack?.id === track.id;
            const isTrackPlaying = isActive && isPlaying;

            return (
              <div
                key={track.id}
                className={`flex items-center gap-2 py-1 px-1.5 rounded transition-colors ${
                  isActive ? "bg-wood" : "hover:bg-wood/50"
                }`}
              >
                {/* Album art thumb */}
                {track.albumArtUrl ? (
                  <img
                    src={track.albumArtUrl}
                    alt=""
                    className="w-6 h-6 rounded-sm object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-sm bg-wood flex-shrink-0" />
                )}

                {/* Track info */}
                <div className="flex-1 min-w-0">
                  <span
                    className={`text-[11px] truncate block ${
                      isActive ? "text-gold" : "text-cream/80"
                    }`}
                  >
                    {track.artistName && (
                      <span className="text-sleeve">{track.artistName} — </span>
                    )}
                    {track.title}
                  </span>
                </div>

                {/* Play button */}
                {track.youtubeVideoId && (
                  <button
                    onClick={() => handlePlay(track)}
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-sleeve hover:text-gold transition-colors"
                  >
                    {isTrackPlaying ? (
                      <Pause className="w-3 h-3" fill="currentColor" />
                    ) : (
                      <Play className="w-3 h-3" fill="currentColor" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* "See all N tracks" */}
      {remaining > 0 && (
        <p className="text-gold text-[11px] mt-2 cursor-default">
          See all {tracks.length} tracks
        </p>
      )}
    </div>
  );
}
