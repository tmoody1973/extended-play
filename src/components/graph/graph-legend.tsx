"use client";

import { communityColors } from "@/lib/theme";
import type { CommunityInfo } from "./use-force-graph";

interface GraphLegendProps {
  communities: CommunityInfo[];
  nodeCount: number;
  edgeCount: number;
  highlightedCommunityId?: number;
  onCommunityClick?: (communityId: number | undefined) => void;
  isExploring?: boolean;
}

export function GraphLegend({
  communities,
  nodeCount,
  edgeCount,
  highlightedCommunityId,
  onCommunityClick,
  isExploring = true,
}: GraphLegendProps) {
  if (communities.length === 0 || !isExploring) return null;

  return (
    <div className="absolute bottom-3 left-3 bg-walnut/80 backdrop-blur-sm border border-edge rounded-md px-3 py-2.5 max-w-[200px] z-10">
      <h4 className="label-uppercase text-[9px] text-sleeve mb-1.5">Communities</h4>
      <div className="space-y-1">
        {communities.map((c) => {
          const color = communityColors[c.id % communityColors.length];
          const isActive = highlightedCommunityId === c.id;
          return (
            <button
              key={c.id}
              className="flex items-center gap-2 w-full text-left group"
              onClick={() =>
                onCommunityClick?.(isActive ? undefined : c.id)
              }
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 transition-transform"
                style={{
                  backgroundColor: color,
                  transform: isActive ? "scale(1.4)" : "scale(1)",
                }}
              />
              <span
                className="text-[10px] truncate transition-colors"
                style={{
                  color: isActive ? color : "var(--color-cream)",
                  opacity: isActive ? 1 : 0.7,
                }}
              >
                {c.label}
              </span>
              <span className="text-[9px] font-data text-shadow ml-auto">
                {c.count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-edge mt-2 pt-1.5 text-[9px] font-data text-shadow">
        {nodeCount} artists · {edgeCount} edges
      </div>
    </div>
  );
}
