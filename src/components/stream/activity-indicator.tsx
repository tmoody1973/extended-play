"use client";

const TOOL_LABELS: Record<string, string> = {
  explore_artist: "Looking up artist...",
  get_connections: "Tracing connections...",
  search_artists: "Searching artists...",
  get_bridge_artists: "Finding bridge artists...",
  search_reviews: "Searching reviews...",
  generate_scene_image: "Generating illustration...",
  get_episode: "Loading episode...",
  create_playlist: "Creating playlist...",
  add_to_playlist: "Adding to playlist...",
  seed_artist_corpus: "Building knowledge...",
};

interface ActivityIndicatorProps {
  tool: string;
}

export function ActivityIndicator({ tool }: ActivityIndicatorProps) {
  const label = TOOL_LABELS[tool] || `Working on ${tool}...`;

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 animate-pulse">
      <div className="w-1.5 h-1.5 bg-amber rounded-full animate-ping" />
      <span className="text-sleeve text-xs font-data">{label}</span>
    </div>
  );
}
