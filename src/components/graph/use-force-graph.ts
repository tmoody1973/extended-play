"use client";

import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { colors, communityColors, fonts } from "@/lib/theme";

export interface GraphNode {
  id: string;
  name: string;
  imageUrl?: string;
  communityId?: number;
  bridgeScore?: number;
  connectionCount?: number;
  influenceScore?: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  weight: number;
}

export interface CommunityInfo {
  id: number;
  label: string;
  count: number;
}

interface UseForceGraphOptions {
  nodes: GraphNode[];
  edges: GraphEdge[];
  communities?: CommunityInfo[];
  width: number;
  height: number;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onNodeClick?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
  selectedNodeId?: string;
  highlightedCommunityId?: number;
}

// ─── Node sizing ───
function nodeRadius(d: GraphNode): number {
  const base = 18;
  const score = d.influenceScore ?? d.bridgeScore ?? 0;
  return base + Math.min(score * 4, 12);
}

function communityColor(communityId?: number): string {
  if (communityId == null) return communityColors[0];
  return communityColors[communityId % communityColors.length];
}

// ─── O(N) cluster force — replaces O(N²) forceX/forceY pair ───
function clusterForce(strength = 0.12) {
  let _nodes: GraphNode[] = [];

  function force(alpha: number) {
    const centroids = new Map<number, { x: number; y: number; count: number }>();
    for (const n of _nodes) {
      if (n.communityId == null || n.x == null || n.y == null) continue;
      const c = centroids.get(n.communityId) || { x: 0, y: 0, count: 0 };
      c.x += n.x;
      c.y += n.y;
      c.count++;
      centroids.set(n.communityId, c);
    }
    for (const n of _nodes) {
      if (n.communityId == null || n.x == null || n.y == null) continue;
      const c = centroids.get(n.communityId);
      if (!c || c.count < 2) continue;
      n.vx! += (c.x / c.count - n.x) * strength * alpha;
      n.vy! += (c.y / c.count - n.y) * strength * alpha;
    }
  }

  force.initialize = (_n: GraphNode[]) => { _nodes = _n; };
  return force;
}

// ─── Adjacency lookup ───
function buildAdjacency(edges: GraphEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    const s = typeof e.source === "string" ? e.source : e.source.id;
    const t = typeof e.target === "string" ? e.target : e.target.id;
    if (!adj.has(s)) adj.set(s, new Set());
    if (!adj.has(t)) adj.set(t, new Set());
    adj.get(s)!.add(t);
    adj.get(t)!.add(s);
  }
  return adj;
}

// ─── Parse hex → RGB tuple (avoid per-frame string ops) ───
function hexToRgb(hex: string): [number, number, number] {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [0, 0, 0];
}

// Pre-compute color tuples once
const edgeRgb = hexToRgb(colors.edge);
const goldRgb = hexToRgb(colors.gold);

export function useForceGraph({
  nodes,
  edges,
  communities,
  width,
  height,
  canvasRef,
  onNodeClick,
  onNodeHover,
  selectedNodeId,
  highlightedCommunityId,
}: UseForceGraphOptions) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const transformRef = useRef(d3.zoomIdentity);
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | undefined>(selectedNodeId);
  const edgeFrameRef = useRef<number>(0);
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());

  useEffect(() => { selectedIdRef.current = selectedNodeId; }, [selectedNodeId]);

  // ─── Canvas edge drawing (straight lines, viewport-culled) ───
  const drawEdges = useCallback(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const t = transformRef.current;
    const activeId = hoveredIdRef.current || selectedIdRef.current;
    const activeNeighbors = activeId ? adjacencyRef.current.get(activeId) : undefined;

    // Viewport bounds in graph space (with padding)
    const pad = 150;
    const vl = (-t.x / t.k) - pad;
    const vt2 = (-t.y / t.k) - pad;
    const vr = ((width - t.x) / t.k) + pad;
    const vb = ((height - t.y) / t.k) + pad;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    const [er, eg, eb] = edgeRgb;
    const [gr, gg, gb] = goldRgb;

    // Batch non-highlighted edges into a single path for fewer draw calls
    if (!activeId) {
      ctx.strokeStyle = `rgba(${er},${eg},${eb},0.2)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const s = e.source as GraphNode;
        const tgt = e.target as GraphNode;
        if (s.x == null || s.y == null || tgt.x == null || tgt.y == null) continue;
        // Viewport culling
        if (Math.max(s.x, tgt.x) < vl || Math.min(s.x, tgt.x) > vr) continue;
        if (Math.max(s.y, tgt.y) < vt2 || Math.min(s.y, tgt.y) > vb) continue;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tgt.x, tgt.y);
      }
      ctx.stroke();
    } else {
      // Two passes: dim edges first, then highlighted on top
      ctx.strokeStyle = `rgba(${er},${eg},${eb},0.04)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const s = e.source as GraphNode;
        const tgt = e.target as GraphNode;
        if (s.x == null || s.y == null || tgt.x == null || tgt.y == null) continue;
        if (Math.max(s.x, tgt.x) < vl || Math.min(s.x, tgt.x) > vr) continue;
        if (Math.max(s.y, tgt.y) < vt2 || Math.min(s.y, tgt.y) > vb) continue;
        if (s.id === activeId || tgt.id === activeId) continue; // skip highlighted
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tgt.x, tgt.y);
      }
      ctx.stroke();

      // Highlighted edges
      ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.8)`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const s = e.source as GraphNode;
        const tgt = e.target as GraphNode;
        if (s.x == null || s.y == null || tgt.x == null || tgt.y == null) continue;
        if (s.id !== activeId && tgt.id !== activeId) continue;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tgt.x, tgt.y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }, [edges, width, height, canvasRef]);

  const requestEdgeDraw = useCallback(() => {
    if (edgeFrameRef.current) return;
    edgeFrameRef.current = requestAnimationFrame(() => {
      edgeFrameRef.current = 0;
      drawEdges();
    });
  }, [drawEdges]);

  // ─── Canvas sizing (retina-aware) ───
  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }, [width, height, canvasRef]);

  // ─── Zoom helpers ───
  const zoomToNode = useCallback((nodeId: string) => {
    if (!svgRef.current || !zoomRef.current) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.x == null || node.y == null) return;
    const svg = d3.select(svgRef.current);
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(1.5)
      .translate(-node.x, -node.y);
    svg.transition().duration(750).call(zoomRef.current.transform, transform);
  }, [nodes, width, height]);

  const resetZoom = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(750).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(0, 0).scale(1)
    );
  }, []);

  // ═══════════════════════════════════════════════════════════════
  //  Main render — SVG nodes only (edges on canvas)
  // ═══════════════════════════════════════════════════════════════
  const render = useCallback(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const adjacency = buildAdjacency(edges);
    adjacencyRef.current = adjacency;

    // ─── Defs: bucketed clip paths (fewer DOM nodes than per-node) ───
    const defs = svg.append("defs");
    const radiiBuckets = new Set<number>();
    nodes.forEach((n) => radiiBuckets.add(Math.round(nodeRadius(n))));
    radiiBuckets.forEach((r) => {
      defs.append("clipPath")
        .attr("id", `clip-r${r}`)
        .append("circle")
        .attr("r", r)
        .attr("cx", 0)
        .attr("cy", 0);
    });

    // Glow filter — only applied on hover/select, not all nodes
    const filter = defs.append("filter")
      .attr("id", "glow")
      .attr("x", "-50%").attr("y", "-50%")
      .attr("width", "200%").attr("height", "200%");
    filter.append("feGaussianBlur")
      .attr("stdDeviation", "3")
      .attr("result", "blur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "blur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const g = svg.append("g");
    gRef.current = g;

    // ─── Zoom with LOD ───
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        g.attr("transform", event.transform);
        requestEdgeDraw();

        // LOD: toggle labels + rings by zoom level
        const k = event.transform.k;
        g.selectAll<SVGTextElement, GraphNode>(".node-label")
          .attr("display", (d) => {
            if (k > 0.8) return null;
            if (k > 0.4) return (d.bridgeScore ?? 0) > 0.4 ? null : "none";
            return "none";
          });
        g.selectAll(".ring-outer")
          .attr("display", k > 0.4 ? null : "none");
      });
    zoomRef.current = zoom;
    svg.call(zoom);

    // ─── Force simulation (tuned for fast settling) ───
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphEdge>(edges)
        .id((d) => d.id)
        .distance(100)
        .strength(0.3))
      .force("charge", d3.forceManyBody()
        .strength(-250)
        .theta(1.2)          // Less accurate but much faster Barnes-Hut
        .distanceMax(500))    // Ignore far-away repulsion
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d) + 8))
      .force("cluster", clusterForce(0.12))
      .alphaDecay(0.04)      // ~2× faster cooldown (default 0.023)
      .alphaMin(0.005)
      .velocityDecay(0.45);

    simulationRef.current = simulation;

    // ─── Community labels ───
    const communityLabelGroup = g.append("g").attr("class", "community-labels");
    const communityLabels = communities && communities.length > 0
      ? communityLabelGroup
          .selectAll<SVGTextElement, CommunityInfo>("text")
          .data(communities)
          .join("text")
          .attr("fill", colors.sleeve)
          .attr("fill-opacity", 0.5)
          .attr("font-size", "9px")
          .attr("font-family", fonts.editorial)
          .attr("font-weight", "700")
          .attr("text-anchor", "middle")
          .attr("letter-spacing", "0.08em")
          .attr("pointer-events", "none")
          .text((d) => d.label.toUpperCase())
      : null;

    // ─── SVG nodes (no edges — those are on canvas) ───
    const nodeGroup = g.append("g").attr("class", "nodes");
    const node = nodeGroup
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .style("opacity", 0)
      .on("click", (_, d) => onNodeClick?.(d.id))
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }) as any
      );

    // Staggered fade-in (capped for large graphs)
    const maxDelay = Math.min(nodes.length * 15, 2000);
    node.transition()
      .delay((_, i) => (i / nodes.length) * maxDelay)
      .duration(400)
      .style("opacity", 1);

    // Ring — NO glow filter by default (saves GPU)
    node.append("circle")
      .attr("class", "ring-outer")
      .attr("r", (d) => nodeRadius(d) + 4)
      .attr("fill", "none")
      .attr("stroke", (d) => communityColor(d.communityId))
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.6);

    // Photo or fallback initial
    node.each(function (d) {
      const el = d3.select(this);
      const r = nodeRadius(d);
      const bucketR = Math.round(r);

      if (d.imageUrl) {
        el.append("image")
          .attr("href", d.imageUrl)
          .attr("x", -r)
          .attr("y", -r)
          .attr("width", r * 2)
          .attr("height", r * 2)
          .attr("clip-path", `url(#clip-r${bucketR})`)
          .attr("preserveAspectRatio", "xMidYMid slice");
      } else {
        el.append("circle")
          .attr("r", r)
          .attr("fill", colors.shelf)
          .attr("stroke", communityColor(d.communityId))
          .attr("stroke-width", 1.5);
        el.append("text")
          .text(d.name.charAt(0).toUpperCase())
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .attr("fill", colors.cream)
          .attr("font-size", `${r * 0.8}px`)
          .attr("font-family", fonts.editorial)
          .attr("font-weight", "700")
          .attr("pointer-events", "none");
      }
    });

    // Name label
    node.append("text")
      .attr("class", "node-label")
      .text((d) => d.name.length > 14 ? d.name.substring(0, 12) + "\u2026" : d.name)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => nodeRadius(d) + 14)
      .attr("fill", colors.cream)
      .attr("fill-opacity", 0.85)
      .attr("font-size", "10px")
      .attr("font-family", fonts.body)
      .attr("pointer-events", "none");

    // ─── Hover: dim nodes via SVG, redraw edges via canvas ───
    node.on("mouseenter", function (_, d) {
      hoveredIdRef.current = d.id;
      onNodeHover?.(d.id);
      const neighbors = adjacency.get(d.id) || new Set<string>();

      node.transition().duration(200)
        .style("opacity", (n: GraphNode) =>
          n.id === d.id || neighbors.has(n.id) ? 1 : 0.25
        );

      d3.select(this).select(".ring-outer")
        .transition().duration(200)
        .attr("r", nodeRadius(d) + 7)
        .attr("stroke-width", 3)
        .attr("stroke-opacity", 1)
        .attr("filter", "url(#glow)");

      requestEdgeDraw();
    });

    node.on("mouseleave", function (_, d) {
      hoveredIdRef.current = null;
      onNodeHover?.(null);

      node.transition().duration(300).style("opacity", 1);

      d3.select(this).select(".ring-outer")
        .transition().duration(300)
        .attr("r", nodeRadius(d) + 4)
        .attr("stroke-width", 2)
        .attr("stroke-opacity", 0.6)
        .attr("filter", null);

      requestEdgeDraw();
    });

    // ─── Tick: throttled edge draw (~30fps), full-rate node positions ───
    let tickCount = 0;
    simulation.on("tick", () => {
      tickCount++;
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);

      // Community label centroids
      if (communityLabels && communities) {
        const centroids = new Map<number, { x: number; y: number; count: number }>();
        for (const n of nodes) {
          if (n.communityId == null || n.x == null || n.y == null) continue;
          const c = centroids.get(n.communityId) || { x: 0, y: 0, count: 0 };
          c.x += n.x;
          c.y += n.y;
          c.count++;
          centroids.set(n.communityId, c);
        }
        communityLabels
          .attr("x", (d) => { const c = centroids.get(d.id); return c ? c.x / c.count : 0; })
          .attr("y", (d) => { const c = centroids.get(d.id); return c ? (c.y / c.count) - 30 : 0; });
      }

      // Canvas edges at half frame rate during simulation
      if (tickCount % 2 === 0) drawEdges();
    });

    // Final edge draw when simulation fully settles
    simulation.on("end", () => drawEdges());

    return () => {
      simulation.stop();
      if (edgeFrameRef.current) cancelAnimationFrame(edgeFrameRef.current);
    };
  }, [nodes, edges, communities, width, height, onNodeClick, onNodeHover, drawEdges, requestEdgeDraw]);

  useEffect(() => {
    const cleanup = render();
    return () => cleanup?.();
  }, [render]);

  // ─── Selected node highlight ───
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    if (selectedNodeId) {
      const neighbors = adjacencyRef.current.get(selectedNodeId) || new Set<string>();

      svg.selectAll<SVGGElement, GraphNode>(".nodes g")
        .transition().duration(300)
        .style("opacity", (d) =>
          d.id === selectedNodeId || neighbors.has(d.id) ? 1 : 0.2
        );

      svg.selectAll<SVGGElement, GraphNode>(".nodes g")
        .filter((d) => d.id === selectedNodeId)
        .select(".ring-outer")
        .transition().duration(300)
        .attr("stroke", colors.cream)
        .attr("stroke-width", 3.5)
        .attr("stroke-opacity", 1)
        .attr("filter", "url(#glow)");

      requestEdgeDraw();
      zoomToNode(selectedNodeId);
    } else {
      svg.selectAll<SVGGElement, GraphNode>(".nodes g")
        .transition().duration(300)
        .style("opacity", 1);

      svg.selectAll<SVGGElement, GraphNode>(".nodes g")
        .select(".ring-outer")
        .transition().duration(300)
        .attr("stroke", (d: GraphNode) => communityColor(d.communityId))
        .attr("stroke-width", 2)
        .attr("stroke-opacity", 0.6)
        .attr("filter", null);

      requestEdgeDraw();
      resetZoom();
    }
  }, [selectedNodeId, zoomToNode, resetZoom, requestEdgeDraw]);

  // ─── Community highlight ───
  useEffect(() => {
    if (!svgRef.current || highlightedCommunityId == null) return;
    const svg = d3.select(svgRef.current);

    svg.selectAll<SVGGElement, GraphNode>(".nodes g")
      .transition().duration(300)
      .style("opacity", (d) =>
        d.communityId === highlightedCommunityId ? 1 : 0.15
      );
  }, [highlightedCommunityId]);

  return { svgRef, zoomToNode, resetZoom };
}
