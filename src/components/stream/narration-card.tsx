"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";

interface NarrationCardProps {
  content: string;
  timestamp?: string;
  style?: string;
  isSpeaking?: boolean;
}

export function NarrationCard({
  content,
  timestamp,
  style,
  isSpeaking = false,
}: NarrationCardProps) {
  const [displayedLength, setDisplayedLength] = useState(0);
  const isQuote = style === "quote";
  const isClosing = style === "closing";

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

  const speakerIcon = isSpeaking ? (
    <motion.span
      className="inline-flex items-end gap-0.5 h-3 ml-2 align-middle"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block w-0.5 bg-gold/60 rounded-full"
          animate={{ height: ["3px", "10px", "5px", "8px", "3px"] }}
          transition={{
            duration: 1.0,
            repeat: Infinity,
            delay: i * 0.12,
            ease: "easeInOut",
          }}
        />
      ))}
    </motion.span>
  ) : null;

  if (isQuote) {
    return (
      <div className="border-l-2 border-amber pl-4 py-2">
        <p className="text-cream text-base font-editorial italic leading-relaxed">
          &ldquo;{visibleText}&rdquo;
          {!isComplete && <span className="inline-block w-0.5 h-4 bg-amber ml-0.5 animate-pulse" />}
          {speakerIcon}
        </p>
        {timestamp && (
          <p className="text-shadow text-xs font-data mt-2">{timestamp}</p>
        )}
      </div>
    );
  }

  if (isClosing) {
    return (
      <div className="border-l-2 border-gold/20 pl-4 py-3 mt-4 bg-walnut/30 rounded-r-lg">
        <p className="font-editorial italic text-cream/80 text-[15px] leading-relaxed whitespace-pre-wrap">
          {visibleText}
          {!isComplete && <span className="inline-block w-0.5 h-4 bg-gold/40 ml-0.5 animate-pulse" />}
          {speakerIcon}
        </p>
        {isComplete && timestamp && (
          <p className="text-shadow text-[10px] font-data mt-2">{timestamp}</p>
        )}
      </div>
    );
  }

  return (
    <div className="border-l-2 border-gold/20 pl-4 py-2">
      <p className="font-editorial italic text-cream/90 text-[15px] leading-relaxed whitespace-pre-wrap">
        {visibleText}
        {!isComplete && <span className="inline-block w-0.5 h-4 bg-amber/60 ml-0.5 animate-pulse" />}
        {speakerIcon}
      </p>
      {isComplete && timestamp && (
        <p className="text-shadow text-[10px] font-data mt-2">{timestamp}</p>
      )}
    </div>
  );
}
