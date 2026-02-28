"use client";

import { useState, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useEpisodeCalendar } from "@/hooks/use-episode-calendar";
import { useAudioPlayer, type PlayableTrack } from "@/contexts/audio-player-context";
import { YearOverview } from "./year-overview";
import { MonthView } from "./month-view";
import { Play, Pause } from "lucide-react";

type BrowseLevel =
  | { level: "years" }
  | { level: "months"; year: number }
  | { level: "tracks"; episodeId: Id<"episodes"> };

interface EpisodeBrowserProps {
  onEpisodeSelect: (episodeId: Id<"episodes"> | undefined) => void;
  onTrackSelect: (trackId: Id<"tracks">, artistId: Id<"artists">) => void;
  onTimeRangeSelect: (range: { startTimestamp: number; endTimestamp: number } | undefined) => void;
  activeTimeRange?: { startTimestamp: number; endTimestamp: number };
}

export function EpisodeBrowser({
  onEpisodeSelect,
  onTrackSelect,
  onTimeRangeSelect,
  activeTimeRange,
}: EpisodeBrowserProps) {
  const { years, maxMonthEpisodes, isLoading } = useEpisodeCalendar();
  const { currentTrack, isPlaying, play, pause, resume } = useAudioPlayer();
  const matchYoutube = useAction(api.enrichment.matchTrackYoutube);
  const [matchingTrackId, setMatchingTrackId] = useState<string | null>(null);
  const [browseLevel, setBrowseLevel] = useState<BrowseLevel>({ level: "years" });

  // Track-level data (only fetched when viewing a specific episode)
  const episodeWithTracks = useQuery(
    api.queries.getEpisodeWithTracks,
    browseLevel.level === "tracks" ? { episodeId: browseLevel.episodeId } : "skip"
  );

  const handleYearSelect = useCallback((year: number) => {
    setBrowseLevel({ level: "months", year });
  }, []);

  const handleTimeRange = useCallback((start: number, end: number) => {
    onTimeRangeSelect({ startTimestamp: start, endTimestamp: end });
    onEpisodeSelect(undefined); // Clear episode selection when using time range
  }, [onTimeRangeSelect, onEpisodeSelect]);

  const handleEpisodeSelect = useCallback((episodeId: Id<"episodes">) => {
    setBrowseLevel({ level: "tracks", episodeId });
    onEpisodeSelect(episodeId);
    onTimeRangeSelect(undefined); // Clear time range when selecting episode
  }, [onEpisodeSelect, onTimeRangeSelect]);

  const handleBackToYears = useCallback(() => {
    setBrowseLevel({ level: "years" });
  }, []);

  const handleBackToMonths = useCallback(() => {
    if (browseLevel.level === "tracks") {
      setBrowseLevel({ level: "years" });
      onEpisodeSelect(undefined);
    }
  }, [browseLevel, onEpisodeSelect]);

  const handleTrackPlay = useCallback(async (track: any) => {
    // Already playing this track — toggle
    if (currentTrack?.id === track._id && isPlaying) { pause(); return; }
    if (currentTrack?.id === track._id) { resume(); return; }

    let videoId = track.youtubeVideoId;

    // On-demand YouTube match if no video ID yet
    if (!videoId) {
      setMatchingTrackId(track._id);
      try {
        const result = await matchYoutube({ trackId: track._id });
        videoId = result.youtubeVideoId;
      } catch { /* non-critical */ }
      setMatchingTrackId(null);
    }

    if (!videoId) return;

    play({
      id: track._id,
      title: track.title,
      artistName: track.artistName,
      albumArtUrl: track.albumArtUrl,
      youtubeVideoId: videoId,
    });
  }, [currentTrack, isPlaying, play, pause, resume, matchYoutube]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="h-full flex flex-col p-3 bg-walnut">
        <div className="h-4 w-20 rounded bg-shelf animate-pulse mb-3" />
        <div className="space-y-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 animate-pulse">
              <div className="w-8 h-3 rounded bg-shelf" />
              <div className="flex-1 h-3 rounded bg-shelf" />
              <div className="w-4 h-3 rounded bg-shelf" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-3 bg-walnut">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="label-uppercase text-[11px] text-sleeve min-w-0 truncate">
          {browseLevel.level === "years" && "Episodes"}
          {browseLevel.level === "months" && `${browseLevel.year}`}
          {browseLevel.level === "tracks" && (episodeWithTracks?.title || "Loading...")}
        </h3>
        {activeTimeRange && (
          <button
            onClick={() => onTimeRangeSelect(undefined)}
            className="label-uppercase text-[9px] text-gold/70 hover:text-gold
                       transition-colors cursor-pointer px-1.5 py-0.5
                       rounded border border-gold/20 hover:border-gold/40"
          >
            Clear
          </button>
        )}
      </div>

      {/* Content by level */}
      <div className="flex-1 overflow-y-auto">
        {browseLevel.level === "years" && (
          <YearOverview
            years={years}
            maxMonthEpisodes={maxMonthEpisodes}
            onYearSelect={handleYearSelect}
            onTimeRangeSelect={handleTimeRange}
          />
        )}

        {browseLevel.level === "months" && (
          <MonthView
            yearData={years.find((y) => y.year === browseLevel.year)!}
            maxMonthEpisodes={maxMonthEpisodes}
            onBack={handleBackToYears}
            onEpisodeSelect={handleEpisodeSelect}
            onTimeRangeSelect={handleTimeRange}
          />
        )}

        {browseLevel.level === "tracks" && (
          <div className="flex flex-col">
            <button
              onClick={handleBackToMonths}
              className="flex items-center gap-1 text-sleeve hover:text-cream
                         transition-colors text-sm cursor-pointer mb-2"
            >
              <span className="text-xs">&larr;</span>
              <span className="font-data">All Episodes</span>
            </button>

            {episodeWithTracks?.tracks && (
              <div className="space-y-0.5">
                {episodeWithTracks.tracks.map((track: any, i: number) => {
                  const isActive = currentTrack?.id === track._id;
                  const isTrackPlaying = isActive && isPlaying;
                  const isMatching = matchingTrackId === track._id;

                  return (
                    <div
                      key={track._id}
                      className={cn(
                        "w-full flex items-center gap-2 p-1.5 rounded transition-colors group",
                        isActive ? "bg-shelf" : "hover:bg-shelf/50"
                      )}
                    >
                      {/* Play button — searches YouTube on-demand if needed */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTrackPlay(track); }}
                        disabled={isMatching}
                        className={cn(
                          "w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors",
                          isMatching ? "text-gold animate-pulse" :
                          isActive ? "text-gold" : "text-shadow group-hover:text-sleeve"
                        )}
                      >
                        {isMatching ? (
                          <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        ) : isTrackPlaying ? (
                          <Pause className="w-3 h-3" fill="currentColor" />
                        ) : (
                          <Play className="w-3 h-3" fill="currentColor" />
                        )}
                      </button>

                      {/* Track info — click to select artist on graph */}
                      <button
                        onClick={() => onTrackSelect(track._id, track.artistId)}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <p className={cn(
                          "text-xs truncate transition-colors",
                          isActive ? "text-gold" : "text-cream group-hover:text-amber"
                        )}>
                          {track.title}
                        </p>
                        <p className="text-sleeve text-[10px] truncate">{track.artistName}</p>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {!episodeWithTracks && (
              <div className="space-y-2 p-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 animate-pulse">
                    <div className="w-5 h-3 rounded bg-shelf" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 rounded bg-shelf w-3/4" />
                      <div className="h-2.5 rounded bg-shelf w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
