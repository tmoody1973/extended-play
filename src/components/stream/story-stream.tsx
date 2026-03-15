"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { NarrationCard } from "./narration-card";
import { ArtistCard } from "./artist-card";
import { AlbumArtCard } from "./album-art-card";
import { EpisodeCard } from "./episode-card";
import { SceneImageCard } from "./scene-image-card";
import { ConnectionEvidenceCard } from "./connection-evidence-card";
import { SonicComparisonCard } from "./sonic-comparison-card";
import { ActivityIndicator } from "./activity-indicator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentEvent } from "@/hooks/use-agent-connection";

interface StoryStreamProps {
  items?: AgentEvent[];
  onSendText?: (text: string) => void;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

const heroVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

export function StoryStream({ items = [], onSendText }: StoryStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  const showPrompts = items.length === 0;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {showPrompts && (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="text-center space-y-2">
              <h3 className="font-editorial text-cream text-lg">What would you like to explore?</h3>
              <p className="text-sleeve text-sm">Start with your voice or pick a path below</p>
            </div>
            <div className="space-y-2 w-full max-w-xs">
              {[
                { label: "Walk me through an episode", icon: "\u{1F4FB}" },
                { label: "Surprise me with a connection", icon: "\u2728" },
                { label: "Tell me about an artist", icon: "\u{1F3B5}" },
              ].map((prompt) => (
                <button
                  key={prompt.label}
                  onClick={() => onSendText?.(prompt.label)}
                  className="w-full text-left px-4 py-3 rounded-lg bg-shelf/60 hover:bg-shelf border border-edge/50 hover:border-amber/30 transition-all group"
                >
                  <span className="text-cream text-sm group-hover:text-amber transition-colors">
                    {prompt.icon} {prompt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {items.map((item, i) => {
            const isHero = item.type === "show_artist" || item.type === "show_image";
            const variants = isHero ? heroVariants : cardVariants;

            return (
              <motion.div
                key={`${item.type}-${i}`}
                variants={variants}
                initial="hidden"
                animate="visible"
                layout
              >
                {renderCard(item)}
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

function renderCard(item: AgentEvent) {
  switch (item.type) {
    case "show_narration":
      return (
        <NarrationCard
          content={item.text as string}
          timestamp="Just now"
          style={item.style as string | undefined}
        />
      );
    case "show_artist": {
      const data = item.data as Record<string, unknown> | undefined;
      return (
        <ArtistCard
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
          imageData={imgData.imageData as string}
          mimeType={imgData.mimeType as string | undefined}
          caption={imgData.caption as string | undefined}
        />
      );
    }
    case "show_evidence": {
      const evData = item.data as Record<string, unknown> | undefined;
      return (
        <ConnectionEvidenceCard
          publication={(evData?.publication as string) || "Unknown"}
          excerpt={(evData?.excerpt as string) || ""}
          url={evData?.url as string | undefined}
          artistNames={evData?.artistNames as string[] | undefined}
        />
      );
    }
    case "show_sonic_comparison": {
      const cmpData = item.data as Record<string, unknown> | undefined;
      return (
        <SonicComparisonCard
          artist1={cmpData?.artist1 as any}
          artist2={cmpData?.artist2 as any}
        />
      );
    }
    case "agent_activity":
      return <ActivityIndicator tool={item.tool as string} />;
    case "transcript":
      if (item.role === "agent") {
        return (
          <NarrationCard
            content={item.text as string}
            timestamp="Just now"
          />
        );
      }
      return null;
    default:
      return null;
  }
}
