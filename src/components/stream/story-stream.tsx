"use client";

import { useRef, useEffect } from "react";
import { NarrationCard } from "./narration-card";
import { ArtistCard } from "./artist-card";
import { AlbumArtCard } from "./album-art-card";
import { EpisodeCard } from "./episode-card";
import { SceneImageCard } from "./scene-image-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentEvent } from "@/hooks/use-agent-connection";

interface StoryStreamProps {
  items?: AgentEvent[];
}

export function StoryStream({ items = [] }: StoryStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new items arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        <h3 className="label-uppercase text-[11px] text-sleeve mb-4">Story Stream</h3>

        {items.length === 0 && (
          <p className="text-shadow text-sm">
            Start a conversation to explore music connections...
          </p>
        )}

        {items.map((item, i) => {
          switch (item.type) {
            case "show_narration":
              return (
                <NarrationCard
                  key={i}
                  content={item.text as string}
                  timestamp="Just now"
                  style={item.style as string | undefined}
                />
              );
            case "show_artist": {
              const data = item.data as Record<string, unknown> | undefined;
              return (
                <ArtistCard
                  key={i}
                  name={(data?.name as string) || "Unknown"}
                  genres={(data?.genres as string[]) || []}
                  country={(data?.country as string) || ""}
                  communityLabel={(data?.communityLabel as string) || ""}
                  imageUrl={(data?.images as any)?.thumbnail?.url}
                  bio={(data?.bio as string) || ""}
                />
              );
            }
            case "show_episode": {
              const epData = item.data as Record<string, unknown> | undefined;
              const epTracks = (epData?.tracks as any[]) || [];
              return (
                <EpisodeCard
                  key={i}
                  title={(epData?.title as string) || "Episode"}
                  airDate={epData?.airDate as string | undefined}
                  description={epData?.description as string | undefined}
                  coverImageUrl={epData?.coverImageUrl as string | undefined}
                  tracks={epTracks.map((t: any) => ({
                    id: t._id || t.id || String(Math.random()),
                    title: t.title || "Unknown Track",
                    artistName: t.artistName,
                    albumArtUrl: t.albumArtUrl || t.albumArt?.primaryUrl,
                    youtubeVideoId: t.youtubeVideoId,
                    position: t.position,
                  }))}
                />
              );
            }
            case "show_image": {
              const imgData = item as Record<string, unknown>;
              return (
                <SceneImageCard
                  key={i}
                  imageData={imgData.imageData as string}
                  mimeType={imgData.mimeType as string | undefined}
                  caption={imgData.caption as string | undefined}
                />
              );
            }
            case "transcript":
              if (item.role === "agent") {
                return (
                  <NarrationCard
                    key={i}
                    content={item.text as string}
                    timestamp="Just now"
                  />
                );
              }
              return null;
            default:
              return null;
          }
        })}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
