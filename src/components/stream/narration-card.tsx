"use client";

import { useState, useEffect } from "react";

interface NarrationCardProps {
  content: string;
  timestamp?: string;
  style?: string;
}

export function NarrationCard({ content, timestamp, style }: NarrationCardProps) {
  const [displayedLength, setDisplayedLength] = useState(0);
  const isQuote = style === "quote";

  // Typing reveal — shows ~3 chars per frame at 16ms intervals
  useEffect(() => {
    if (displayedLength >= content.length) return;
    const timer = setTimeout(() => {
      setDisplayedLength((prev) => Math.min(prev + 3, content.length));
    }, 16);
    return () => clearTimeout(timer);
  }, [displayedLength, content.length]);

  const visibleText = content.slice(0, displayedLength);
  const isComplete = displayedLength >= content.length;

  if (isQuote) {
    return (
      <div className="border-l-2 border-amber pl-4 py-2">
        <p className="text-cream text-base font-editorial italic leading-relaxed">
          &ldquo;{visibleText}&rdquo;
          {!isComplete && <span className="inline-block w-0.5 h-4 bg-amber ml-0.5 animate-pulse" />}
        </p>
        {timestamp && (
          <p className="text-shadow text-xs font-data mt-2">{timestamp}</p>
        )}
      </div>
    );
  }

  return (
    <div className="py-2">
      <p className="text-cream/90 text-[15px] leading-relaxed whitespace-pre-wrap">
        {visibleText}
        {!isComplete && <span className="inline-block w-0.5 h-4 bg-amber/60 ml-0.5 animate-pulse" />}
      </p>
      {isComplete && timestamp && (
        <p className="text-shadow text-[10px] font-data mt-2">{timestamp}</p>
      )}
    </div>
  );
}
