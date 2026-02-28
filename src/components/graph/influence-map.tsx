"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useForceGraph, GraphNode, GraphEdge, CommunityInfo } from "./use-force-graph";
import { GraphLegend } from "./graph-legend";
import { WelcomeOverlay } from "./welcome-overlay";

interface InfluenceMapProps {
  onNodeClick?: (artistId: string) => void;
  selectedNodeId?: string;
  filterArtistIds?: Set<string>;
  isExploring?: boolean;
  revealedArtistIds?: Set<string>;
  onExploreAll?: () => void;
  hasClickedNode?: boolean;
}

// Fallback demo data (only used if no snapshot AND no bridge data)
const demoNodes: GraphNode[] = [
  { id: "1", name: "Fela Kuti", communityId: 0, bridgeScore: 0.8, connectionCount: 4 },
  { id: "2", name: "Tony Allen", communityId: 0, bridgeScore: 0.5, connectionCount: 2 },
  { id: "3", name: "Kokoroko", communityId: 1, bridgeScore: 0.6, connectionCount: 4 },
  { id: "4", name: "Ezra Collective", communityId: 1, bridgeScore: 0.3, connectionCount: 2 },
  { id: "5", name: "Antibalas", communityId: 0, bridgeScore: 0.4, connectionCount: 2 },
  { id: "6", name: "Budos Band", communityId: 2, bridgeScore: 0.2, connectionCount: 1 },
  { id: "7", name: "Shabaka Hutchings", communityId: 1, bridgeScore: 0.7, connectionCount: 3 },
  { id: "8", name: "Sons of Kemet", communityId: 1, bridgeScore: 0.3, connectionCount: 1 },
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

const demoCommunities: CommunityInfo[] = [
  { id: 0, label: "Afrobeat / Highlife", count: 3 },
  { id: 1, label: "UK Jazz", count: 4 },
  { id: 2, label: "Funk Revival", count: 1 },
];

/** Parse graph snapshot chunks into nodes + edges */
function parseSnapshot(graphSnapshot: any): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const rawNodes = JSON.parse(graphSnapshot.nodesJson);
  const rawEdges = JSON.parse(graphSnapshot.edgesJson);
  const imageMap: Record<string, string> = {};

  for (const chunk of graphSnapshot.chunks ?? []) {
    if (chunk.nodesJson) {
      try { rawNodes.push(...JSON.parse(chunk.nodesJson)); } catch {}
    }
    if (chunk.edgesJson) {
      try { rawEdges.push(...JSON.parse(chunk.edgesJson)); } catch {}
    }
    if (chunk.nodeImagesJson) {
      try { Object.assign(imageMap, JSON.parse(chunk.nodeImagesJson)); } catch {}
    }
  }
  if (graphSnapshot.nodeImagesJson) {
    try { Object.assign(imageMap, JSON.parse(graphSnapshot.nodeImagesJson)); } catch {}
  }

  const nodes: GraphNode[] = rawNodes.map((n: any) => ({
    id: n.id,
    name: n.name,
    imageUrl: n.img || n.imageUrl || imageMap[n.id],
    communityId: n.c ?? n.community ?? n.communityId,
    bridgeScore: n.bs ?? n.bridgeScore,
    connectionCount: n.cc ?? n.connectionCount,
    influenceScore: n.is ?? n.influenceScore,
  }));

  const edges: GraphEdge[] = rawEdges.map((e: any) => ({
    source: e.source,
    target: e.target,
    weight: e.w ?? e.weight,
  }));

  return { nodes, edges };
}

export function InfluenceMap({
  onNodeClick,
  selectedNodeId,
  filterArtistIds,
  isExploring = false,
  revealedArtistIds,
  onExploreAll,
  hasClickedNode = false,
}: InfluenceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [highlightedCommunityId, setHighlightedCommunityId] = useState<number | undefined>();

  // Layer 1: Bridge artists from enriched artist docs (fast, lightweight)
  const bridgeData = useQuery((api as any).queries.getBridgeArtists, { limit: 50 });
  const hasBridgeData = bridgeData?.nodes && bridgeData.nodes.length > 0;

  // Layer 2: Graph snapshot — loaded as fallback when bridge query returns nothing
  // (artists still stubs), or when agent reveals artists beyond the bridge set
  const needsFullGraph = useMemo(() => {
    if (filterArtistIds) return true;
    if (!revealedArtistIds || revealedArtistIds.size === 0) return false;
    if (!hasBridgeData) return false;
    const bridgeIds = new Set(bridgeData!.nodes.map((n: any) => n.id));
    for (const id of revealedArtistIds) {
      if (!bridgeIds.has(id)) return true;
    }
    return false;
  }, [filterArtistIds, revealedArtistIds, hasBridgeData, bridgeData]);

  // Load snapshot when: bridge data is empty (fallback), or full graph needed
  const graphSnapshot = useQuery(
    (api as any).queries.getActiveGraph,
    needsFullGraph || !hasBridgeData ? {} : "skip"
  );

  // Parse snapshot (only when loaded)
  const { snapshotNodes, snapshotEdges } = useMemo(() => {
    if (!graphSnapshot) return { snapshotNodes: [], snapshotEdges: [] };
    const parsed = parseSnapshot(graphSnapshot);
    return { snapshotNodes: parsed.nodes, snapshotEdges: parsed.edges };
  }, [graphSnapshot]);

  // Bridge nodes: prefer enriched artist data, fall back to snapshot top bridges
  const { bridgeNodes, bridgeEdges } = useMemo(() => {
    // Best case: enriched artist data with real images from DB
    if (hasBridgeData) {
      const nodes: GraphNode[] = bridgeData!.nodes.map((n: any) => ({
        id: n.id,
        name: n.name,
        imageUrl: n.imageUrl,
        communityId: n.communityId ?? 0,
        bridgeScore: n.bridgeScore ?? 0,
        connectionCount: 0,
      }));
      const edges: GraphEdge[] = bridgeData!.edges.map((e: any) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
      }));
      return { bridgeNodes: nodes, bridgeEdges: edges };
    }

    // Fallback: extract top 50 bridge artists from graph snapshot
    if (snapshotNodes.length > 0) {
      const sorted = [...snapshotNodes].sort(
        (a, b) => (b.bridgeScore ?? 0) - (a.bridgeScore ?? 0)
      );
      const top = sorted.slice(0, 50);
      const topIds = new Set(top.map((n) => n.id));
      const edges = snapshotEdges.filter(
        (e) => topIds.has(e.source as string) && topIds.has(e.target as string)
      );
      return { bridgeNodes: top, bridgeEdges: edges };
    }

    // Last resort: demo data
    return { bridgeNodes: demoNodes, bridgeEdges: demoEdges };
  }, [hasBridgeData, bridgeData, snapshotNodes, snapshotEdges]);

  // All nodes: bridge nodes + full graph when agent reveals more
  const allNodes = useMemo(() => {
    if (!needsFullGraph || snapshotNodes.length === 0) return bridgeNodes;
    const fullMap = new Map(snapshotNodes.map((n) => [n.id, n]));
    for (const bn of bridgeNodes) {
      const fn = fullMap.get(bn.id);
      if (fn) {
        fullMap.set(bn.id, { ...fn, imageUrl: bn.imageUrl || fn.imageUrl });
      } else {
        fullMap.set(bn.id, bn);
      }
    }
    return Array.from(fullMap.values());
  }, [bridgeNodes, snapshotNodes, needsFullGraph]);

  const allEdges = useMemo(() => {
    if (!needsFullGraph || snapshotEdges.length === 0) return bridgeEdges;
    const edgeKey = (e: GraphEdge) => `${e.source}-${e.target}`;
    const seen = new Set(snapshotEdges.map(edgeKey));
    const extra = bridgeEdges.filter((e) => !seen.has(edgeKey(e)));
    return [...snapshotEdges, ...extra];
  }, [bridgeEdges, snapshotEdges, needsFullGraph]);

  // Build communities from visible nodes
  const allCommunities: CommunityInfo[] = useMemo(() => {
    if (graphSnapshot?.communitiesJson) {
      try { return JSON.parse(graphSnapshot.communitiesJson); } catch {}
    }
    const map = new Map<number, { label: string; count: number }>();
    for (const n of bridgeNodes) {
      if (n.communityId == null) continue;
      const entry = map.get(n.communityId) || { label: `Community ${n.communityId}`, count: 0 };
      entry.count++;
      map.set(n.communityId, entry);
    }
    if (map.size === 0) return demoCommunities;
    return Array.from(map.entries()).map(([id, { label, count }]) => ({ id, label, count }));
  }, [graphSnapshot, bridgeNodes]);

  // Filter nodes based on state:
  //   welcome        → top 8 bridges (ambient background, real data)
  //   explore (base) → all 50 bridges (curated landmarks)
  //   explore + revealed → bridges + agent-surfaced artists
  //   episode filter → only that episode's artists
  const nodes = useMemo(() => {
    if (filterArtistIds) {
      return allNodes.filter((n) => filterArtistIds.has(n.id));
    }
    if (!isExploring) {
      return bridgeNodes.slice(0, 8);
    }
    if (revealedArtistIds && revealedArtistIds.size > 0) {
      const bridgeIds = new Set(bridgeNodes.map((n) => n.id));
      return allNodes.filter(
        (n) => bridgeIds.has(n.id) || revealedArtistIds.has(n.id)
      );
    }
    return bridgeNodes;
  }, [allNodes, bridgeNodes, filterArtistIds, isExploring, revealedArtistIds]);

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = allEdges.filter(
    (e) => nodeIds.has(e.source as string) && nodeIds.has(e.target as string)
  );

  // Filtered communities
  const communities = useMemo(() => {
    if (!filterArtistIds) return allCommunities;
    const counts = new Map<number, number>();
    for (const n of nodes) {
      if (n.communityId == null) continue;
      counts.set(n.communityId, (counts.get(n.communityId) || 0) + 1);
    }
    return allCommunities
      .filter((c) => counts.has(c.id))
      .map((c) => ({ ...c, count: counts.get(c.id)! }));
  }, [allCommunities, nodes, filterArtistIds]);

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

  const { svgRef } = useForceGraph({
    nodes,
    edges,
    communities,
    width: dimensions.width,
    height: dimensions.height,
    canvasRef,
    onNodeClick,
    selectedNodeId,
    highlightedCommunityId,
  });

  const hasData = hasBridgeData || snapshotNodes.length > 0;

  return (
    <div ref={containerRef} className="h-full w-full relative overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ pointerEvents: "none", zIndex: 0 }}
      />
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
        style={{ position: "relative", zIndex: 1 }}
      />
      <WelcomeOverlay isExploring={isExploring} onExploreAll={onExploreAll ?? (() => {})} />
      {isExploring && !hasClickedNode && !filterArtistIds && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-wood/90 backdrop-blur-sm text-cream/80 text-sm font-body px-4 py-2 rounded-full border border-gold/20"
          style={{ animation: "fade-in 0.6s ease-out" }}
        >
          Click any artist to explore their connections
        </div>
      )}
      <GraphLegend
        communities={communities}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        highlightedCommunityId={highlightedCommunityId}
        onCommunityClick={setHighlightedCommunityId}
        isExploring={isExploring}
      />
      {!hasData && (
        <div className="absolute bottom-3 right-3 bg-wood/80 text-shadow text-xs font-data px-2 py-1 rounded">
          Demo graph — ingest episodes to populate
        </div>
      )}
    </div>
  );
}
