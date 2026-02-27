"use client";

import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { colors, fonts } from "@/lib/theme";

export interface GraphNode {
  id: string;
  name: string;
  imageUrl?: string;
  communityId?: number;
  bridgeScore?: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface UseForceGraphOptions {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  onNodeClick?: (nodeId: string) => void;
  highlightedNodeId?: string;
}

export function useForceGraph({ nodes, edges, width, height, onNodeClick, highlightedNodeId }: UseForceGraphOptions) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const prevHighlightRef = useRef<string | undefined>(undefined);

  const render = useCallback(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    // Force simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphEdge>(edges).id((d) => d.id).distance(80).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(30));

    simulationRef.current = simulation;

    // Edges
    const link = g.append("g")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", colors.edge)
      .attr("stroke-width", (d) => Math.max(1, Math.min(d.weight, 4)))
      .attr("stroke-opacity", 0.6);

    // Node groups
    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
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

    // Node circles
    node.append("circle")
      .attr("r", 20)
      .attr("fill", colors.shelf)
      .attr("stroke", colors.amber)
      .attr("stroke-width", 2);

    // Node labels
    node.append("text")
      .text((d) => d.name.length > 12 ? d.name.substring(0, 10) + "\u2026" : d.name)
      .attr("text-anchor", "middle")
      .attr("dy", 32)
      .attr("fill", colors.cream)
      .attr("font-size", "10px")
      .attr("font-family", fonts.body);

    // Hover effects
    node.on("mouseenter", function () {
      d3.select(this).select("circle")
        .transition().duration(200)
        .attr("stroke-width", 3)
        .attr("r", 24);
    }).on("mouseleave", function () {
      d3.select(this).select("circle")
        .transition().duration(200)
        .attr("stroke-width", 2)
        .attr("r", 20);
    });

    // Tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, width, height, onNodeClick]);

  useEffect(() => {
    const cleanup = render();
    return () => cleanup?.();
  }, [render]);

  // Highlight effect — responds to highlightedNodeId changes without re-rendering the graph
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const prev = prevHighlightRef.current;

    // Reset previously highlighted node
    if (prev) {
      svg.selectAll<SVGGElement, GraphNode>("g g g")
        .filter((d) => d.id === prev)
        .select("circle")
        .transition()
        .duration(300)
        .attr("r", 20)
        .attr("stroke", colors.amber)
        .attr("stroke-width", 2);
    }

    // Apply highlight to new node
    if (highlightedNodeId) {
      svg.selectAll<SVGGElement, GraphNode>("g g g")
        .filter((d) => d.id === highlightedNodeId)
        .select("circle")
        .transition()
        .duration(300)
        .attr("r", 26)
        .attr("stroke", colors.cream)
        .attr("stroke-width", 4);
    }

    prevHighlightRef.current = highlightedNodeId;
  }, [highlightedNodeId]);

  return svgRef;
}
