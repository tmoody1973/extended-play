"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AppShell } from "@/components/layout/app-shell";
import { MainLayout } from "@/components/layout/main-layout";
import { VoiceBar } from "@/components/voice/voice-bar";
import { EpisodeSidebar } from "@/components/layout/episode-sidebar";
import { InfluenceMap } from "@/components/graph/influence-map";
import { ArtistDetailDrawer } from "@/components/graph/artist-detail-drawer";
import { StoryStream } from "@/components/stream/story-stream";
import { EpisodeWalkthrough } from "@/components/stream/episode-walkthrough";
import { DirectorWalkthrough, type WalkthroughData } from "@/components/stream/director-walkthrough";
import { PlaylistBar } from "@/components/playlist/playlist-bar";
import { useAgentConnection, AgentEvent } from "@/hooks/use-agent-connection";
// import { useAudioPlayer } from "@/contexts/audio-player-context";
import { Id } from "../../convex/_generated/dataModel";

const AGENT_WS_URL = process.env.NEXT_PUBLIC_AGENT_WS_URL || "ws://localhost:8000/ws";

export default function Home() {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<Id<"episodes"> | undefined>();
  const [selectedArtistId, setSelectedArtistId] = useState<string | undefined>();
  const [storyItems, setStoryItems] = useState<AgentEvent[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const [walkthroughMode, setWalkthroughMode] = useState(false);
  const [isExploring, setIsExploring] = useState(false);
  const [revealedArtistIds, setRevealedArtistIds] = useState<Set<string>>(new Set());
  const [hasClickedNode, setHasClickedNode] = useState(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | undefined>();
  const [selectedTimeRange, setSelectedTimeRange] = useState<
    { startTimestamp: number; endTimestamp: number } | undefined
  >();
  const [activePlaylistId, setActivePlaylistId] = useState<Id<"playlists"> | undefined>();
  const [walkthroughData, setWalkthroughData] = useState<WalkthroughData | null>(null);
  const [walkthroughLoading, setWalkthroughLoading] = useState(false);
  const [directorMode, setDirectorMode] = useState(false);
  const narrationBufferRef = useRef("");
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingAudioRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play PCM audio from Gemini TTS (L16, 24kHz, mono)
  const playPcmAudio = useCallback((base64Data: string) => {
    const raw = atob(base64Data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    audioQueueRef.current.push(bytes.buffer);
    if (isPlayingAudioRef.current) return;

    const processQueue = () => {
      if (audioQueueRef.current.length === 0) {
        isPlayingAudioRef.current = false;
        return;
      }
      isPlayingAudioRef.current = true;
      const buffer = audioQueueRef.current.shift()!;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;

      // Convert L16 (16-bit signed PCM) to Float32
      const int16 = new Int16Array(buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = processQueue;
      source.start();
    };
    processQueue();
  }, []);

  // Reactive playlist subscription — updates automatically when agent mutates
  const playlistData = useQuery(
    api.queries.getPlaylistWithTracks,
    activePlaylistId ? { playlistId: activePlaylistId } : "skip"
  );

  const playlistTracks = useMemo(() => {
    if (!playlistData?.tracks) return [];
    return playlistData.tracks.map((t: any) => ({
      id: t._id,
      title: t.title,
      artistName: t.artistName,
      albumArtUrl: t.albumArtUrl || t.albumArt?.primaryUrl,
      youtubeVideoId: t.youtubeVideoId,
      spotifyTrackId: t.spotifyTrackId,
    }));
  }, [playlistData]);

  const createPlaylist = useMutation(api.playlists.create);
  const addTrackMutation = useMutation(api.playlists.addTrack);

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

  const revealArtists = useCallback((...ids: (string | undefined)[]) => {
    const valid = ids.filter((id): id is string => !!id);
    if (valid.length === 0) return;
    setRevealedArtistIds((prev) => {
      const next = new Set(prev);
      for (const id of valid) next.add(id);
      return next;
    });
  }, []);

  const handleAgentEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case "show_artist":
        setStoryItems((prev) => [...prev.filter((item) => item.type !== "agent_activity"), event]);
        setIsExploring(true);
        revealArtists(event.artistId as string);
        // New visual content arrived — reset narration buffer for next segment
        narrationBufferRef.current = "";
        break;
      case "show_episode":
        setStoryItems((prev) => [...prev.filter((item) => item.type !== "agent_activity"), event]);
        setIsExploring(true);
        narrationBufferRef.current = "";
        break;
      case "show_narration": {
        const text = (event.text as string) || "";
        if (!text.trim()) break;
        // Each show_narration from tell_story is a complete paragraph — add as new card
        setStoryItems((prev) => [
          ...prev.filter((item) => item.type !== "agent_activity"),
          event,
        ]);
        break;
      }
      case "narration_audio":
        // Play Gemini TTS audio (PCM L16 24kHz)
        if (event.audioData) {
          playPcmAudio(event.audioData as string);
        }
        break;
      case "show_image":
        setStoryItems((prev) => [...prev.filter((item) => item.type !== "agent_activity"), event]);
        narrationBufferRef.current = "";
        break;
      case "show_evidence":
      case "show_sonic_comparison":
        setStoryItems((prev) => [...prev.filter((item) => item.type !== "agent_activity"), event]);
        break;
      case "agent_activity":
        setStoryItems((prev) => {
          const filtered = prev.filter((item) => item.type !== "agent_activity");
          return [...filtered, event];
        });
        break;
      case "highlight_node":
        setHighlightedNodeId(event.artistId as string);
        revealArtists(event.artistId as string);
        break;
      case "navigate_graph":
        setHighlightedNodeId(event.centerId as string);
        setIsExploring(true);
        revealArtists(
          event.centerId as string,
          ...((event as any).nodes?.map((n: any) => n.id || n) ?? [])
        );
        break;
      case "create_playlist":
        setIsExploring(true);
        if (event.playlistId) {
          setActivePlaylistId(event.playlistId as Id<"playlists">);
        }
        break;
      case "add_to_playlist":
        if (event.playlistId) {
          setActivePlaylistId(event.playlistId as Id<"playlists">);
        }
        break;
      case "walkthrough_loading":
        setWalkthroughLoading(true);
        break;
      case "walkthrough_ready":
        setWalkthroughLoading(false);
        if (event.data) {
          setWalkthroughData(event.data as WalkthroughData);
          setDirectorMode(true);
          setShowWelcome(false);
        }
        break;
      case "transcript":
        // Voice transcripts — just for the voice bar, not story stream
        break;
    }
  }, [revealArtists, playPcmAudio]);

  const agent = useAgentConnection({
    agentUrl: AGENT_WS_URL,
    onEvent: handleAgentEvent,
  });

  // Stop audio when user starts talking
  useEffect(() => {
    if (agent.agentState === "listening") {
      audioQueueRef.current = [];
      isPlayingAudioRef.current = false;
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    }
  }, [agent.agentState]);

  const handleToggleRecording = () => {
    if (agent.isRecording) {
      agent.stopRecording();
    } else {
      setIsExploring(true);
      agent.startRecording();
    }
  };

  const handleExploreAll = useCallback(() => {
    setIsExploring(true);
    setRevealedArtistIds(new Set()); // empty set + isExploring = full map
  }, []);

  // Episode walkthrough handlers
  const handleEpisodeSelect = useCallback((id: Id<"episodes"> | undefined) => {
    setSelectedEpisodeId(id);
    setWalkthroughMode(!!id);
    // Trigger Director's Cut walkthrough via agent
    if (id) {
      setShowWelcome(false);
      setWalkthroughLoading(true);
      agent.sendWalkthrough(id);
    } else {
      setWalkthroughLoading(false);
      setDirectorMode(false);
      setWalkthroughData(null);
    }
  }, [agent]);

  const handleCloseWalkthrough = useCallback(() => {
    setSelectedEpisodeId(undefined);
    setWalkthroughMode(false);
    setDirectorMode(false);
    setWalkthroughData(null);
  }, []);

  const handleDirectorComplete = useCallback(() => {
    setDirectorMode(false);
    // Keep episode selected so user can explore the tracklist
  }, []);

  const handleTellMeAbout = useCallback(() => {
    setWalkthroughMode(false);
    setIsExploring(true);
    agent.startRecording();
  }, [agent]);

  const handleNodeClick = (artistId: string) => {
    // Only open drawer for real Convex IDs (not demo node IDs like "1", "2")
    if (artistId.length > 10) {
      setSelectedArtistId(artistId);
    }
    setHasClickedNode(true);
  };

  const handleNavigateToArtist = (artistId: string) => {
    setSelectedArtistId(artistId);
  };

  const handleTrackSelect = (trackId: Id<"tracks">, artistId: Id<"artists">) => {
    setSelectedArtistId(artistId);
  };

  // Add to Crate: creates playlist if needed, adds all artist tracks
  const handleAddToCrate = useCallback(
    async (tracks: Array<{ id: string; title: string; albumTitle?: string }>) => {
      let playlistId = activePlaylistId;

      if (!playlistId) {
        playlistId = await createPlaylist({
          title: "My Crate",
          trackIds: tracks.map((t) => t.id as Id<"tracks">),
          generatedFrom: { type: "user_curated" },
        });
        setActivePlaylistId(playlistId);
      } else {
        // Add tracks one by one to existing playlist
        for (const track of tracks) {
          await addTrackMutation({
            playlistId,
            trackId: track.id as Id<"tracks">,
          });
        }
      }
    },
    [activePlaylistId, createPlaylist, addTrackMutation]
  );

  return (
    <AppShell>
      <VoiceBar
        isConnected={agent.isConnected}
        isRecording={agent.isRecording}
        agentState={agent.agentState}
        transcript={agent.transcript}
        onToggleRecording={handleToggleRecording}
        onSendText={agent.sendText}
        onSendImage={agent.sendImage}
      />
      <MainLayout
        sidebar={
          <EpisodeSidebar
            onEpisodeSelect={handleEpisodeSelect}
            onTrackSelect={handleTrackSelect}
            onTimeRangeSelect={setSelectedTimeRange}
            activeTimeRange={selectedTimeRange}
          />
        }
        graph={
          <InfluenceMap
            onNodeClick={handleNodeClick}
            selectedNodeId={selectedArtistId}
            filterArtistIds={filterArtistIds}
            isExploring={isExploring}
            revealedArtistIds={revealedArtistIds}
            onExploreAll={handleExploreAll}
            hasClickedNode={hasClickedNode}
          />
        }
        stream={
          walkthroughLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
              <p className="text-sleeve text-sm font-editorial italic">Curating your episode...</p>
            </div>
          ) : directorMode && walkthroughData ? (
            <DirectorWalkthrough
              data={walkthroughData}
              onComplete={handleDirectorComplete}
              playPcmAudio={playPcmAudio}
              onArtistReveal={(artistId) => {
                revealArtists(artistId);
                setHighlightedNodeId(artistId);
              }}
            />
          ) : walkthroughMode && episodeWithTracks ? (
            <EpisodeWalkthrough
              episode={episodeWithTracks}
              tracks={episodeWithTracks.tracks || []}
              onClose={handleCloseWalkthrough}
              onTellMeAbout={handleTellMeAbout}
            />
          ) : (
            <StoryStream items={storyItems} onSendText={(text) => {
              setShowWelcome(false);
              setIsExploring(true);
              agent.sendText(text);
            }} />
          )
        }
      />
      <PlaylistBar
        playlistId={activePlaylistId}
        title={playlistData?.title || "My Crate"}
        tracks={playlistTracks}
      />

      {/* Artist Detail Drawer — slides from right on node click */}
      <ArtistDetailDrawer
        artistId={selectedArtistId}
        onClose={() => setSelectedArtistId(undefined)}
        onNavigateToArtist={handleNavigateToArtist}
        onAddToCrate={handleAddToCrate}
      />

      {showWelcome && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-walnut/95 backdrop-blur-md cursor-pointer"
          onClick={() => {
            setShowWelcome(false);
          }}
        >
          <div className="text-center space-y-4 animate-[fade-in_1.5s_ease-out]">
            <p className="text-amber/60 text-xs font-data uppercase tracking-[0.3em] animate-[fade-in_2s_ease-out]">
              Rhythm Lab Radio presents
            </p>
            <h1 className="font-editorial text-6xl md:text-7xl text-cream tracking-tight">
              Extended Play
            </h1>
            <p className="text-sleeve text-base font-editorial italic">
              20 years of music connections, explored through conversation.
            </p>
            <div className="pt-6">
              <p className="text-shadow/60 text-xs animate-pulse">
                Click to enter
              </p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
