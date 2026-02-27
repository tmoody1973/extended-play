"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AppShell } from "@/components/layout/app-shell";
import { MainLayout } from "@/components/layout/main-layout";
import { VoiceBar } from "@/components/voice/voice-bar";
import { EpisodeSidebar } from "@/components/layout/episode-sidebar";
import { InfluenceMap } from "@/components/graph/influence-map";
import { StoryStream } from "@/components/stream/story-stream";
import { PlaylistBar } from "@/components/playlist/playlist-bar";
import { useAgentConnection, AgentEvent } from "@/hooks/use-agent-connection";
import { Id } from "../../convex/_generated/dataModel";

const AGENT_WS_URL = process.env.NEXT_PUBLIC_AGENT_WS_URL || "ws://localhost:8000/ws";

export default function Home() {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<Id<"episodes"> | undefined>();
  const [selectedArtistId, setSelectedArtistId] = useState<string | undefined>();
  const [storyItems, setStoryItems] = useState<AgentEvent[]>([]);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | undefined>();
  const [selectedTimeRange, setSelectedTimeRange] = useState<
    { startTimestamp: number; endTimestamp: number } | undefined
  >();

  // When an episode is selected, get its tracks to filter the graph
  const episodeWithTracks = useQuery(
    api.queries.getEpisodeWithTracks,
    selectedEpisodeId ? { episodeId: selectedEpisodeId } : "skip"
  );

  // When a time range is selected, get all artist IDs from that period
  const timeRangeArtists = useQuery(
    api.queries.getArtistIdsByDateRange,
    selectedTimeRange ?? "skip"
  );

  // Merge filters: time range OR episode, not both
  const filterArtistIds = useMemo(() => {
    if (timeRangeArtists?.artistIds) {
      return new Set(timeRangeArtists.artistIds);
    }
    if (episodeWithTracks?.tracks) {
      return new Set(episodeWithTracks.tracks.map((t: any) => t.artistId));
    }
    return undefined;
  }, [timeRangeArtists, episodeWithTracks]);

  const handleAgentEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case "show_artist":
      case "show_narration":
      case "show_episode":
        setStoryItems((prev) => [...prev, event]);
        break;
      case "highlight_node":
        setHighlightedNodeId(event.artistId as string);
        break;
      case "navigate_graph":
        setHighlightedNodeId(event.centerId as string);
        break;
      case "add_to_playlist":
        // TODO: update playlist bar reactively
        break;
    }
  }, []);

  const agent = useAgentConnection({
    agentUrl: AGENT_WS_URL,
    onEvent: handleAgentEvent,
  });

  const handleToggleRecording = () => {
    if (agent.isRecording) {
      agent.stopRecording();
    } else {
      agent.startRecording();
    }
  };

  const handleNodeClick = (artistId: string) => {
    setSelectedArtistId(artistId);
  };

  const handleTrackSelect = (trackId: Id<"tracks">, artistId: Id<"artists">) => {
    setSelectedArtistId(artistId);
  };

  return (
    <AppShell>
      <VoiceBar
        isConnected={agent.isConnected}
        isRecording={agent.isRecording}
        transcript={agent.transcript}
        onToggleRecording={handleToggleRecording}
      />
      <MainLayout
        sidebar={
          <EpisodeSidebar
            onEpisodeSelect={setSelectedEpisodeId}
            onTrackSelect={handleTrackSelect}
            onTimeRangeSelect={setSelectedTimeRange}
            activeTimeRange={selectedTimeRange}
          />
        }
        graph={
          <InfluenceMap
            onNodeClick={handleNodeClick}
            highlightedNodeId={highlightedNodeId}
            filterArtistIds={filterArtistIds}
          />
        }
        stream={<StoryStream items={storyItems} />}
      />
      <PlaylistBar title="My Crate" tracks={[]} />
    </AppShell>
  );
}
