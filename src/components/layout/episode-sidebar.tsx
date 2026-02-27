"use client";

import { Id } from "../../../convex/_generated/dataModel";
import { EpisodeBrowser } from "@/components/sidebar/episode-browser";

interface EpisodeSidebarProps {
  onEpisodeSelect: (episodeId: Id<"episodes"> | undefined) => void;
  onTrackSelect: (trackId: Id<"tracks">, artistId: Id<"artists">) => void;
  onTimeRangeSelect: (range: { startTimestamp: number; endTimestamp: number } | undefined) => void;
  activeTimeRange?: { startTimestamp: number; endTimestamp: number };
}

export function EpisodeSidebar({
  onEpisodeSelect,
  onTrackSelect,
  onTimeRangeSelect,
  activeTimeRange,
}: EpisodeSidebarProps) {
  return (
    <EpisodeBrowser
      onEpisodeSelect={onEpisodeSelect}
      onTrackSelect={onTrackSelect}
      onTimeRangeSelect={onTimeRangeSelect}
      activeTimeRange={activeTimeRange}
    />
  );
}
