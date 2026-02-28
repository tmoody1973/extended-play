"use client";

interface WelcomeOverlayProps {
  isExploring: boolean;
  onExploreAll: () => void;
}

export function WelcomeOverlay({ isExploring, onExploreAll }: WelcomeOverlayProps) {
  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center bg-walnut/60 backdrop-blur-sm transition-opacity duration-700 ${
        isExploring ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <h1 className="font-editorial text-gold text-4xl mb-2">Extended Play</h1>
      <p className="text-cream/60 text-sm mb-8">
        20 years of Rhythm Lab Radio — mapped
      </p>

      <div className="flex flex-col items-center gap-2">
        <div className="w-10 h-10 rounded-full border border-gold/40 flex items-center justify-center animate-pulse">
          <svg
            className="w-5 h-5 text-gold"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </div>
        <p className="text-sleeve text-sm">
          Talk to the curator to start exploring
        </p>
      </div>

      <button
        onClick={onExploreAll}
        className="mt-6 text-gold text-xs hover:text-cream transition-colors cursor-pointer"
      >
        or browse the map &rarr;
      </button>
    </div>
  );
}
