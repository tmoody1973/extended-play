"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

interface EpisodeCinematicProps {
  title: string;
  airDate?: string;
  premise: string;
  coverImage?: string | null;
  onComplete: () => void;
}

export function EpisodeCinematic({
  title,
  airDate,
  premise,
  coverImage,
  onComplete,
}: EpisodeCinematicProps) {
  const [phase, setPhase] = useState<"intro" | "premise" | "fadeout">("intro");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("premise"), 2000);
    const t2 = setTimeout(() => setPhase("fadeout"), 6000);
    const t3 = setTimeout(() => onComplete(), 7000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  const handleClick = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== "fadeout" ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
          onClick={handleClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* Background image with Ken Burns */}
          {coverImage && (
            <motion.div
              className="absolute inset-0"
              animate={{ scale: [1, 1.05] }}
              transition={{ duration: 8, ease: "linear" }}
            >
              <img
                src={`data:image/png;base64,${coverImage}`}
                alt=""
                className="w-full h-full object-cover blur-sm"
              />
            </motion.div>
          )}

          {/* Dark vignette overlay */}
          <div className="absolute inset-0 bg-gradient-radial from-transparent to-walnut/90" />
          <div className="absolute inset-0 bg-walnut/60" />

          {/* Content */}
          <div className="relative z-10 text-center space-y-4 px-8 max-w-2xl">
            <motion.p
              className="text-amber/60 text-xs font-data uppercase tracking-[0.3em]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              Rhythm Lab Radio
            </motion.p>

            <motion.h1
              className="font-editorial text-cream text-4xl md:text-5xl font-bold leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
            >
              {title}
            </motion.h1>

            {airDate && (
              <motion.p
                className="text-sleeve text-xs font-data"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.4 }}
              >
                {airDate}
              </motion.p>
            )}

            {phase === "premise" && (
              <motion.p
                className="font-editorial italic text-cream/80 text-base md:text-lg leading-relaxed mt-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
              >
                {premise}
              </motion.p>
            )}

            <motion.p
              className="text-shadow/40 text-xs mt-8 animate-pulse"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
            >
              Click to skip
            </motion.p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
