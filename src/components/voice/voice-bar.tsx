"use client";

import { cn } from "@/lib/utils";

interface VoiceBarProps {
  isConnected: boolean;
  isRecording: boolean;
  transcript: { role: string; text: string } | null;
  onToggleRecording: () => void;
}

export function VoiceBar({
  isConnected,
  isRecording,
  transcript,
  onToggleRecording,
}: VoiceBarProps) {
  return (
    <header className="h-14 flex items-center px-4 border-b border-edge bg-wood flex-shrink-0 gap-3">
      {/* Connection indicator */}
      <div
        className={cn(
          "w-2 h-2 rounded-full flex-shrink-0",
          isConnected ? "bg-led-green" : "bg-skip-red"
        )}
        title={isConnected ? "Connected" : "Disconnected"}
      />

      {/* Mic button */}
      <button
        onClick={onToggleRecording}
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0",
          isRecording
            ? "bg-amber text-walnut animate-vu-pulse"
            : "bg-shelf text-sleeve hover:text-cream hover:bg-edge"
        )}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          {isRecording ? (
            <rect x="4" y="4" width="8" height="8" rx="1" />
          ) : (
            <path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V3a2 2 0 0 1 2-2zm-3 6a3 3 0 1 0 6 0h1a4 4 0 0 1-3.5 3.97V13H10v1H6v-1h1.5v-2.03A4 4 0 0 1 4 7h1z" />
          )}
        </svg>
      </button>

      {/* Transcription area */}
      <div className="flex-1 min-w-0">
        {transcript ? (
          <p className="text-cream text-sm truncate">
            <span className="text-sleeve">{transcript.role === "user" ? "You" : "Curator"}:</span>{" "}
            {transcript.text}
          </p>
        ) : (
          <p className="text-shadow text-sm">
            {isRecording ? "Listening..." : "Talk to the curator..."}
          </p>
        )}
      </div>
    </header>
  );
}
