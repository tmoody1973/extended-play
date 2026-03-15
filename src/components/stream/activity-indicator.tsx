"use client";

const TOOL_LABELS: Record<string, string> = {
  explore_artist: "Looking up artist",
  get_connections: "Tracing connections",
  search_artists: "Searching artists",
  get_bridge_artists: "Finding bridge artists",
  search_reviews: "Searching reviews",
  generate_scene_image: "Generating illustration",
  get_episode: "Loading episode",
  create_playlist: "Creating playlist",
  add_to_playlist: "Adding to playlist",
  seed_artist_corpus: "Building knowledge",
};

interface ActivityIndicatorProps {
  tool: string;
}

export function ActivityIndicator({ tool }: ActivityIndicatorProps) {
  const label = TOOL_LABELS[tool] || tool;

  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <div className="flex gap-1">
        <span className="w-1 h-1 bg-amber/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1 h-1 bg-amber/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1 h-1 bg-amber/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <span className="text-sleeve/60 text-xs font-data italic">{label}</span>
    </div>
  );
}
