"use client";

import { useRef, useEffect } from "react";
import { NarrationCard } from "./narration-card";
import { ArtistCard } from "./artist-card";
import { AlbumArtCard } from "./album-art-card";
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
        <h3 className="font-editorial text-cream text-base mb-2">Story Stream</h3>

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
