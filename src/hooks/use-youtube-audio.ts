"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseYouTubeAudioOptions {
  onEnded?: () => void;
}

export function useYouTubeAudio({ onEnded }: UseYouTubeAudioOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onEndedRef = useRef(onEnded);
  const duckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  onEndedRef.current = onEnded;

  // Load YouTube IFrame API
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).YT) {
      setIsReady(true);
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    (window as any).onYouTubeIframeAPIReady = () => {
      setIsReady(true);
    };
  }, []);

  const play = useCallback(
    (videoId: string, startSeconds = 30) => {
      if (!isReady) return;

      // Create hidden container if needed
      if (!containerRef.current) {
        const div = document.createElement("div");
        div.id = "yt-audio-player";
        div.style.position = "fixed";
        div.style.top = "-9999px";
        div.style.left = "-9999px";
        div.style.width = "1px";
        div.style.height = "1px";
        document.body.appendChild(div);
        containerRef.current = div;
      }

      // Destroy previous player
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      playerRef.current = new (window as any).YT.Player(
        containerRef.current,
        {
          height: "1",
          width: "1",
          videoId,
          playerVars: {
            autoplay: 1,
            start: startSeconds,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
          },
          events: {
            onReady: (event: any) => {
              event.target.setVolume(100);
              event.target.playVideo();
              setIsPlaying(true);
            },
            onStateChange: (event: any) => {
              if (event.data === 0) {
                setIsPlaying(false);
                onEndedRef.current?.();
              }
            },
          },
        }
      );
    },
    [isReady]
  );

  // Smooth volume ramping
  const rampVolume = useCallback((target: number, durationMs: number) => {
    if (!playerRef.current) return;
    if (duckIntervalRef.current) clearInterval(duckIntervalRef.current);

    const current = playerRef.current.getVolume?.() ?? 100;
    const steps = 10;
    const stepMs = durationMs / steps;
    const stepSize = (target - current) / steps;
    let step = 0;

    duckIntervalRef.current = setInterval(() => {
      step++;
      const vol = Math.round(current + stepSize * step);
      try { playerRef.current?.setVolume?.(vol); } catch {}
      if (step >= steps) {
        if (duckIntervalRef.current) clearInterval(duckIntervalRef.current);
        duckIntervalRef.current = null;
      }
    }, stepMs);
  }, []);

  const duck = useCallback(() => rampVolume(15, 200), [rampVolume]);
  const unduck = useCallback(() => rampVolume(100, 500), [rampVolume]);

  const stop = useCallback(() => {
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
      playerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const fadeOut = useCallback(
    (durationMs = 2000) => {
      rampVolume(0, durationMs);
      setTimeout(() => stop(), durationMs + 100);
    },
    [rampVolume, stop]
  );

  const pause = useCallback(() => {
    try { playerRef.current?.pauseVideo?.(); } catch {}
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    try { playerRef.current?.playVideo?.(); } catch {}
    setIsPlaying(true);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (duckIntervalRef.current) clearInterval(duckIntervalRef.current);
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
      }
    };
  }, []);

  return { isPlaying, isReady, play, stop, fadeOut, duck, unduck, pause, resume };
}
