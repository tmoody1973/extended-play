"use client";

import { useState } from "react";

interface SceneImageCardProps {
  imageData: string;
  mimeType?: string;
  caption?: string;
}

export function SceneImageCard({ imageData, mimeType = "image/png", caption }: SceneImageCardProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="rounded-lg overflow-hidden bg-walnut -mx-1">
      <div className="relative">
        <img
          src={`data:${mimeType};base64,${imageData}`}
          alt={caption || "Scene illustration"}
          className={`w-full transition-all duration-1000 ${
            loaded ? "opacity-100 scale-100" : "opacity-0 scale-105"
          }`}
          onLoad={() => setLoaded(true)}
        />
        {/* Gradient overlay for caption readability */}
        {caption && loaded && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-walnut/90 via-walnut/40 to-transparent p-4 pt-12">
            <p className="text-cream/80 text-sm font-editorial italic leading-relaxed">
              {caption}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
