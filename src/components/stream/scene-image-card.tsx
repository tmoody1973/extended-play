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
    <div className="rounded-lg overflow-hidden bg-wood border border-edge">
      <img
        src={`data:${mimeType};base64,${imageData}`}
        alt={caption || "Scene illustration"}
        className={`w-full transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
      />
      {caption && (
        <p className="px-3 py-2 text-sleeve text-xs font-data italic">{caption}</p>
      )}
    </div>
  );
}
