"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface VoiceBarProps {
  isConnected: boolean;
  isRecording: boolean;
  agentState: "idle" | "listening" | "agent_thinking" | "agent_speaking";
  transcript: { role: string; text: string } | null;
  onToggleRecording: () => void;
  onSendText: (text: string) => void;
}

export function VoiceBar({
  isConnected,
  isRecording,
  agentState,
  transcript,
  onToggleRecording,
  onSendText,
}: VoiceBarProps) {
  const [textInput, setTextInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && textInput.trim()) {
      onSendText(textInput.trim());
      setTextInput("");
    }
  };

  const handleSend = () => {
    if (textInput.trim()) {
      onSendText(textInput.trim());
      setTextInput("");
    }
  };

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

      {/* Mic button with state-dependent ring */}
      <button
        onClick={onToggleRecording}
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 relative",
          isRecording
            ? "bg-gold text-walnut"
            : "bg-shelf text-sleeve hover:text-cream hover:bg-edge"
        )}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {agentState === "listening" && (
          <span className="absolute inset-0 rounded-full border-2 border-gold animate-ping opacity-40" />
        )}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          {isRecording ? (
            <rect x="4" y="4" width="8" height="8" rx="1" />
          ) : (
            <path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V3a2 2 0 0 1 2-2zm-3 6a3 3 0 1 0 6 0h1a4 4 0 0 1-3.5 3.97V13H10v1H6v-1h1.5v-2.03A4 4 0 0 1 4 7h1z" />
          )}
        </svg>
      </button>

      {/* Agent thinking indicator */}
      {agentState === "agent_thinking" && (
        <div className="flex gap-1 items-center flex-shrink-0">
          <span className="w-1.5 h-1.5 bg-amber rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 bg-amber rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 bg-amber rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      )}

      {/* Transcript / Text input area */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            transcript
              ? `${transcript.role === "user" ? "You" : "Curator"}: ${transcript.text}`
              : isRecording
                ? "Listening..."
                : "Type a message..."
          }
          className="flex-1 bg-transparent text-cream text-sm placeholder:text-shadow outline-none truncate"
        />
      </div>

      {/* Send text button */}
      {textInput.trim() && (
        <button
          onClick={handleSend}
          className="text-amber hover:text-amber/80 flex-shrink-0"
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 1l14 7-14 7V9l10-1-10-1V1z" />
          </svg>
        </button>
      )}

      {/* Brand mark */}
      <span className="label-uppercase text-[10px] text-sleeve hidden md:block flex-shrink-0">
        Extended Play
      </span>
    </header>
  );
}
