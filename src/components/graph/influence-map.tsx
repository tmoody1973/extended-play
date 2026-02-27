"use client";

import { useRef, useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useForceGraph, GraphNode, GraphEdge } from "./use-force-graph";

interface InfluenceMapProps {
  onNodeClick?: (artistId: string) => void;
  highlightedNodeId?: string;
}

// Demo data for when Convex has no graph snapshot yet
const demoNodes: GraphNode[] = [
  { id: "1", name: "Fela Kuti" },
  { id: "2", name: "Tony Allen" },
  { id: "3", name: "Kokoroko" },
  { id: "4", name: "Ezra Collective" },
  { id: "5", name: "Antibalas" },
  { id: "6", name: "Budos Band" },
  { id: "7", name: "Shabaka Hutchings" },
  { id: "8", name: "Sons of Kemet" },
];

const demoEdges: GraphEdge[] = [
  { source: "1", target: "2", weight: 4 },
  { source: "1", target: "3", weight: 2 },
  { source: "1", target: "5", weight: 3 },
  { source: "2", target: "3", weight: 2 },
  { source: "3", target: "4", weight: 3 },
  { source: "4", target: "7", weight: 2 },
  { source: "7", target: "8", weight: 3 },
  { source: "5", target: "6", weight: 2 },
  { source: "3", target: "7", weight: 1 },
];

export function InfluenceMap({ onNodeClick, highlightedNodeId }: InfluenceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Try to load real graph data from Convex
  // Note: api.queries.getActiveGraph may not be typed until `npx convex dev` generates types
  const graphSnapshot = useQuery((api as any).queries.getActiveGraph);

  // Use real data if available, otherwise demo
  const nodes: GraphNode[] = graphSnapshot
    ? JSON.parse(graphSnapshot.nodesJson).map((n: any) => ({
        id: n.id,
        name: n.name,
        imageUrl: n.imageUrl,
        communityId: n.community,
      }))
    : demoNodes;

  const edges: GraphEdge[] = graphSnapshot
    ? JSON.parse(graphSnapshot.edgesJson).map((e: any) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
      }))
    : demoEdges;

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const svgRef = useForceGraph({
    nodes,
    edges,
    width: dimensions.width,
    height: dimensions.height,
    onNodeClick,
  });

  return (
    <div ref={containerRef} className="h-full w-full relative">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
      />
      {!graphSnapshot && (
        <div className="absolute bottom-3 left-3 bg-wood/80 text-shadow text-xs font-data px-2 py-1 rounded">
          Demo graph — ingest episodes to populate
        </div>
      )}
    </div>
  );
}
