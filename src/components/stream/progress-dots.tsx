"use client";

import { motion } from "motion/react";

interface ProgressDotsProps {
  total: number;
  current: number;
  isPaused?: boolean;
  onPauseToggle?: () => void;
}

export function ProgressDots({
  total,
  current,
  isPaused = false,
  onPauseToggle,
}: ProgressDotsProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors duration-300 ${
              i < current
                ? "bg-gold"
                : i === current
                ? "bg-gold/60"
                : "bg-shelf"
            }`}
          >
            {i === current && !isPaused && (
              <motion.div
                className="w-full h-full rounded-full bg-gold"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>
        ))}
      </div>

      {onPauseToggle && (
        <button
          onClick={onPauseToggle}
          className="ml-2 text-sleeve hover:text-cream text-xs font-data transition-colors"
        >
          {isPaused ? "\u25B6" : "\u275A\u275A"}
        </button>
      )}
    </div>
  );
}
