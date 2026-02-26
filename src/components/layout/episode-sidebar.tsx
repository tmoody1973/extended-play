"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Id } from "../../../convex/_generated/dataModel";

interface EpisodeSidebarProps {
  episodeId?: Id<"episodes">;
  onTrackSelect?: (trackId: Id<"tracks">, artistId: Id<"artists">) => void;
}

export function EpisodeSidebar({ episodeId, onTrackSelect }: EpisodeSidebarProps) {
  const episodes = useQuery(api.queries.listEpisodes, { limit: 20 });
  const episodeWithTracks = useQuery(
    api.queries.getEpisodeWithTracks,
    episodeId ? { episodeId } : "skip"
  );

  return (
    <div className="h-full flex flex-col p-3 bg-walnut">
      <h3 className="font-editorial text-cream text-base mb-3 px-1">
        {episodeWithTracks?.title || "Episodes"}
      </h3>

      {!episodeId && episodes && (
        <div className="space-y-1 overflow-y-auto">
          {episodes.map((ep) => (
            <button
              key={ep._id}
              className="w-full text-left p-2 rounded hover:bg-shelf transition-colors"
            >
              <p className="text-cream text-sm truncate">{ep.title}</p>
              <p className="text-shadow text-xs font-data">{ep.airDate}</p>
            </button>
          ))}
        </div>
      )}

      {episodeWithTracks?.tracks && (
        <div className="space-y-0.5 overflow-y-auto flex-1">
          {episodeWithTracks.tracks.map((track, i) => (
            <button
              key={track._id}
              onClick={() => onTrackSelect?.(track._id, track.artistId)}
              className={cn(
                "w-full flex items-center gap-2.5 p-2 rounded transition-colors",
                "hover:bg-shelf cursor-pointer group"
              )}
            >
              <span className="text-shadow font-data text-xs w-5 flex-shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div
                className="w-8 h-8 rounded bg-shelf flex-shrink-0 bg-cover bg-center"
                style={
                  track.albumArtUrl
                    ? { backgroundImage: `url(${track.albumArtUrl})` }
                    : undefined
                }
              />
              <div className="min-w-0 flex-1">
                <p className="text-cream text-sm truncate group-hover:text-amber transition-colors">
                  {track.title}
                </p>
                <p className="text-sleeve text-xs truncate">{track.artistName}</p>
              </div>
              {track.enrichmentStatus !== "complete" && (
                <div className="w-1.5 h-1.5 rounded-full bg-amber animate-vu-pulse flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}

      {!episodes && !episodeWithTracks && (
        <div className="space-y-2 p-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-2.5 animate-pulse">
              <div className="w-5 h-3 rounded bg-shelf" />
              <div className="w-8 h-8 rounded bg-shelf" />
              <div className="flex-1 space-y-1">
                <div className="h-3 rounded bg-shelf w-3/4" />
                <div className="h-2.5 rounded bg-shelf w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
