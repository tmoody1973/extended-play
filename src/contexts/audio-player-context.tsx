"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

export interface PlayableTrack {
  id: string;
  title: string;
  artistName?: string;
  albumArtUrl?: string;
  youtubeVideoId?: string;
}

interface AudioPlayerState {
  currentTrack: PlayableTrack | null;
  isPlaying: boolean;
  progress: number; // 0–1
  duration: number; // seconds
  currentTime: number; // seconds
}

interface AudioPlayerActions {
  play: (track: PlayableTrack) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (percent: number) => void;
  duck: () => void;
  unduck: () => void;
}

type AudioPlayerContextValue = AudioPlayerState & AudioPlayerActions;

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

// YouTube IFrame API player state constants
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_ENDED = 0;

// Global flag to ensure YouTube IFrame API script loads once
let ytApiLoading = false;
let ytApiReady = false;
const ytReadyCallbacks: (() => void)[] = [];

function loadYouTubeApi(): Promise<void> {
  if (ytApiReady) return Promise.resolve();
  return new Promise((resolve) => {
    ytReadyCallbacks.push(resolve);
    if (ytApiLoading) return;
    ytApiLoading = true;

    (window as any).onYouTubeIframeAPIReady = () => {
      ytApiReady = true;
      ytReadyCallbacks.forEach((cb) => cb());
      ytReadyCallbacks.length = 0;
    };

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<PlayableTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiReadyRef = useRef(false);

  // Initialize YouTube player (hidden, audio-only)
  const initPlayer = useCallback(async () => {
    if (playerRef.current || !containerRef.current) return;
    await loadYouTubeApi();
    apiReadyRef.current = true;

    const YTPlayer = (window as any).YT?.Player;
    if (!YTPlayer) return;

    playerRef.current = new YTPlayer(containerRef.current, {
      height: "1",
      width: "1",
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          playerRef.current?.setVolume?.(25);
        },
        onStateChange: (event: { data: number }) => {
          const state = event.data;
          if (state === YT_PLAYING) {
            setIsPlaying(true);
            setDuration(playerRef.current?.getDuration?.() || 0);
            startPolling();
          } else if (state === YT_PAUSED) {
            setIsPlaying(false);
            stopPolling();
          } else if (state === YT_ENDED) {
            setIsPlaying(false);
            setProgress(1);
            stopPolling();
          }
        },
      },
    });
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => {
      if (!playerRef.current?.getCurrentTime) return;
      const t = playerRef.current.getCurrentTime();
      const d = playerRef.current.getDuration();
      setCurrentTime(t);
      setDuration(d);
      setProgress(d > 0 ? t / d : 0);
    }, 500);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Ensure player is initialized on mount
  useEffect(() => {
    initPlayer();
    return () => {
      stopPolling();
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback(
    (track: PlayableTrack) => {
      if (!track.youtubeVideoId) return;
      setCurrentTrack(track);
      setProgress(0);
      setCurrentTime(0);

      if (playerRef.current?.loadVideoById) {
        playerRef.current.loadVideoById(track.youtubeVideoId);
      } else {
        // Player not ready yet — init and retry
        initPlayer().then(() => {
          // Small delay for player to be truly ready
          setTimeout(() => {
            playerRef.current?.loadVideoById?.(track.youtubeVideoId!);
          }, 300);
        });
      }
    },
    [initPlayer]
  );

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo?.();
  }, []);

  const resume = useCallback(() => {
    playerRef.current?.playVideo?.();
  }, []);

  const stop = useCallback(() => {
    playerRef.current?.stopVideo?.();
    setCurrentTrack(null);
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    stopPolling();
  }, [stopPolling]);

  const seek = useCallback(
    (percent: number) => {
      if (!playerRef.current?.getDuration) return;
      const d = playerRef.current.getDuration();
      playerRef.current.seekTo(d * percent, true);
    },
    []
  );

  // Volume ducking — lower music volume when agent is speaking
  const FULL_VOLUME = 25;
  const DUCKED_VOLUME = 8;

  const duck = useCallback(() => {
    playerRef.current?.setVolume?.(DUCKED_VOLUME);
  }, []);

  const unduck = useCallback(() => {
    playerRef.current?.setVolume?.(FULL_VOLUME);
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        progress,
        duration,
        currentTime,
        play,
        pause,
        resume,
        stop,
        seek,
        duck,
        unduck,
      }}
    >
      {/* Hidden YouTube player container — off-screen */}
      <div
        ref={containerRef}
        className="fixed -left-[9999px] -top-[9999px] w-px h-px overflow-hidden"
        aria-hidden
      />
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) {
    throw new Error("useAudioPlayer must be used within <AudioPlayerProvider>");
  }
  return ctx;
}
