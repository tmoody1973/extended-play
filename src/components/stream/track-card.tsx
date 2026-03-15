"use client";

import { motion } from "motion/react";

interface TrackCardProps {
  artistName: string;
  trackTitle: string;
  genres?: string[];
  imageData?: string | null;
  isPlayingAudio?: boolean;
}

export function TrackCard({
  artistName,
  trackTitle,
  genres = [],
  imageData,
  isPlayingAudio = false,
}: TrackCardProps) {
  return (
    <div className="relative rounded-lg overflow-hidden bg-wood border border-edge/50">
      {/* Left gold accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gold/40" />

      {/* Gemini-generated image with Ken Burns */}
      {imageData && (
        <div className="relative h-48 overflow-hidden">
          <motion.img
            src={`data:image/png;base64,${imageData}`}
            alt={`${artistName} illustration`}
            className="w-full h-full object-cover"
            animate={{ scale: [1, 1.05] }}
            transition={{ duration: 8, ease: "linear", repeat: Infinity, repeatType: "reverse" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-wood via-transparent to-transparent" />
        </div>
      )}

      {/* Track info with staggered animation */}
      <div className="p-4 pl-5 space-y-2">
        <motion.h3
          className="font-editorial text-cream text-lg font-bold"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          {artistName}
        </motion.h3>

        <motion.p
          className="text-sleeve text-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          {trackTitle}
        </motion.p>

        {genres.length > 0 && (
          <motion.div
            className="flex flex-wrap gap-1.5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            {genres.map((g) => (
              <span
                key={g}
                className="px-2 py-0.5 rounded-full bg-shelf text-sleeve text-[10px] font-data"
              >
                {g}
              </span>
            ))}
          </motion.div>
        )}

        {/* Equalizer animation when playing */}
        {isPlayingAudio && (
          <motion.div
            className="flex items-end gap-0.5 h-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-0.5 bg-gold/60 rounded-full"
                animate={{ height: ["4px", "12px", "6px", "10px", "4px"] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
