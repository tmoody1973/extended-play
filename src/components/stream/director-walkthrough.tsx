"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { EpisodeCinematic } from "./episode-cinematic";
import { TrackCard } from "./track-card";
import { NarrationCard } from "./narration-card";
import { GoldRule } from "./gold-rule";
import { ProgressDots } from "./progress-dots";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useYouTubeAudio } from "@/hooks/use-youtube-audio";

interface WalkthroughTrack {
  artistName: string;
  trackTitle: string;
  paragraph: string;
  youtubeVideoId?: string;
  artistId?: string;
  image?: string | null;
  ttsAudio?: string | null;
}

export interface WalkthroughData {
  episode: { id: string; title: string; airDate?: string };
  premise: string;
  closing: string;
  coverImage?: string | null;
  introTts?: string | null;
  closingTts?: string | null;
  tracks: WalkthroughTrack[];
}

interface DirectorWalkthroughProps {
  data: WalkthroughData;
  onComplete: () => void;
  onInterrupt?: () => void;
  playPcmAudio: (base64Data: string) => void;
  onArtistReveal?: (artistId: string) => void;
}

type Phase = "cinematic" | "playing" | "closing" | "done";

export function DirectorWalkthrough({
  data,
  onComplete,
  playPcmAudio,
  onArtistReveal,
}: DirectorWalkthroughProps) {
  const [phase, setPhase] = useState<Phase>("cinematic");
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1);
  const [isPaused, setIsPaused] = useState(false);
  const [visibleItems, setVisibleItems] = useState<Array<{
    type: "track" | "narration" | "closing";
    data: any;
  }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNarratingRef = useRef(false);

  const youtube = useYouTubeAudio({
    onEnded: () => {
      // YouTube clip finished — auto-advance handles timing
    },
  });

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleItems.length]);

  // Cinematic complete → start walkthrough
  const handleCinematicComplete = useCallback(() => {
    if (data.introTts) {
      playPcmAudio(data.introTts);
    }
    setPhase("playing");
    setCurrentTrackIndex(0);
  }, [data.introTts, playPcmAudio]);

  // Advance to a track
  useEffect(() => {
    if (phase !== "playing" || currentTrackIndex < 0 || isPaused) return;

    const track = data.tracks[currentTrackIndex];
    if (!track) {
      // All tracks done → closing
      setPhase("closing");
      return;
    }

    // Add track card
    setVisibleItems((prev) => [
      ...prev,
      { type: "track", data: track },
    ]);

    // Reveal artist on graph
    if (track.artistId && onArtistReveal) {
      onArtistReveal(track.artistId);
    }

    // After 0.5s, add narration card
    const narrationTimer = setTimeout(() => {
      setVisibleItems((prev) => [
        ...prev,
        { type: "narration", data: { text: track.paragraph } },
      ]);

      // Play TTS
      if (track.ttsAudio) {
        isNarratingRef.current = true;
        youtube.duck();
        playPcmAudio(track.ttsAudio);

        // Estimate TTS duration: PCM L16 24kHz = bytes / (24000 * 2) seconds
        const audioBytes = track.ttsAudio ? atob(track.ttsAudio).length : 0;
        const ttsDurationMs = (audioBytes / (24000 * 2)) * 1000;

        setTimeout(() => {
          isNarratingRef.current = false;
          youtube.unduck();
        }, ttsDurationMs);
      }

      // Start YouTube audio
      if (track.youtubeVideoId) {
        youtube.play(track.youtubeVideoId, 30);
        if (track.ttsAudio) {
          youtube.duck();
        }
      }
    }, 500);

    // Auto-advance to next track after ~42s
    advanceTimerRef.current = setTimeout(() => {
      youtube.fadeOut(2000);
      setTimeout(() => {
        setCurrentTrackIndex((prev) => prev + 1);
      }, 2200);
    }, 42000);

    return () => {
      clearTimeout(narrationTimer);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, [phase, currentTrackIndex, isPaused, data.tracks, youtube, playPcmAudio, onArtistReveal]);

  // Closing phase
  useEffect(() => {
    if (phase !== "closing") return;

    setVisibleItems((prev) => [
      ...prev,
      { type: "closing", data: { text: data.closing } },
    ]);

    if (data.closingTts) {
      playPcmAudio(data.closingTts);
    }

    const doneTimer = setTimeout(() => {
      setPhase("done");
      onComplete();
    }, 15000);

    return () => clearTimeout(doneTimer);
  }, [phase, data.closing, data.closingTts, playPcmAudio, onComplete]);

  // Pause/resume
  const handlePauseToggle = useCallback(() => {
    setIsPaused((prev) => {
      if (prev) {
        youtube.resume();
      } else {
        youtube.pause();
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      }
      return !prev;
    });
  }, [youtube]);

  return (
    <div className="flex flex-col h-full">
      {/* Cinematic intro */}
      {phase === "cinematic" && (
        <EpisodeCinematic
          title={data.episode.title}
          airDate={data.episode.airDate}
          premise={data.premise}
          coverImage={data.coverImage}
          onComplete={handleCinematicComplete}
        />
      )}

      {/* Progress dots */}
      {phase === "playing" && (
        <ProgressDots
          total={data.tracks.length}
          current={currentTrackIndex}
          isPaused={isPaused}
          onPauseToggle={handlePauseToggle}
        />
      )}

      {/* Story stream */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          <AnimatePresence mode="popLayout">
            {visibleItems.map((item, i) => (
              <motion.div
                key={`${item.type}-${i}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                {item.type === "track" && (
                  <>
                    {i > 0 && <GoldRule />}
                    <TrackCard
                      artistName={item.data.artistName}
                      trackTitle={item.data.trackTitle}
                      imageData={item.data.image}
                      isPlayingAudio={
                        youtube.isPlaying &&
                        currentTrackIndex === Math.floor(i / 2)
                      }
                    />
                  </>
                )}
                {item.type === "narration" && (
                  <NarrationCard
                    content={item.data.text}
                    timestamp=""
                    isSpeaking={isNarratingRef.current}
                  />
                )}
                {item.type === "closing" && (
                  <>
                    <GoldRule />
                    <NarrationCard
                      content={item.data.text}
                      timestamp=""
                      style="closing"
                    />
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
