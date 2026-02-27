"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { MainLayout } from "@/components/layout/main-layout";
import { VoiceBar } from "@/components/voice/voice-bar";
import { EpisodeSidebar } from "@/components/layout/episode-sidebar";
import { InfluenceMap } from "@/components/graph/influence-map";
import { StoryStream } from "@/components/stream/story-stream";
import { PlaylistBar } from "@/components/playlist/playlist-bar";
import { Id } from "../../convex/_generated/dataModel";

export default function Home() {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<Id<"episodes"> | undefined>();
  const [selectedArtistId, setSelectedArtistId] = useState<string | undefined>();

  const handleNodeClick = (artistId: string) => {
    setSelectedArtistId(artistId);
  };

  const handleTrackSelect = (trackId: Id<"tracks">, artistId: Id<"artists">) => {
    setSelectedArtistId(artistId);
  };

  return (
    <AppShell>
      <VoiceBar />
      <MainLayout
        sidebar={
          <EpisodeSidebar
            episodeId={selectedEpisodeId}
            onTrackSelect={handleTrackSelect}
          />
        }
        graph={<InfluenceMap onNodeClick={handleNodeClick} />}
        stream={<StoryStream />}
      />
      <PlaylistBar
        title="My Crate"
        tracks={[]}
      />
    </AppShell>
  );
}
