"use client";

import { useState } from "react";
import { YearSummary, MonthSummary } from "@/hooks/use-episode-calendar";
import { Id } from "../../../convex/_generated/dataModel";

interface MonthViewProps {
  yearData: YearSummary;
  maxMonthEpisodes: number;
  onBack: () => void;
  onEpisodeSelect: (episodeId: Id<"episodes">) => void;
  onTimeRangeSelect: (start: number, end: number) => void;
}

function MonthCell({
  month,
  year,
  maxEpisodes,
  isSelected,
  onClick,
}: {
  month: MonthSummary;
  year: number;
  maxEpisodes: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const intensity = month.episodeCount / maxEpisodes;
  const hasEpisodes = month.episodeCount > 0;

  return (
    <button
      onClick={onClick}
      disabled={!hasEpisodes}
      className={`
        relative flex flex-col items-center justify-center
        aspect-square rounded-md transition-all text-center
        ${hasEpisodes ? "cursor-pointer hover:scale-105" : "cursor-default opacity-40"}
        ${isSelected ? "ring-1 ring-gold" : ""}
      `}
      style={{
        backgroundColor: hasEpisodes
          ? `rgba(220, 165, 74, ${0.08 + intensity * 0.35})`
          : "rgba(37, 32, 24, 0.3)",
        boxShadow: isSelected
          ? "0 0 12px rgba(220, 165, 74, 0.4), 0 0 4px rgba(220, 165, 74, 0.6)"
          : hasEpisodes
            ? `0 0 ${intensity * 8}px rgba(220, 165, 74, ${intensity * 0.3})`
            : "none",
      }}
      aria-label={`${month.label} ${year}, ${month.episodeCount} episodes`}
    >
      <span className="font-data text-[9px] text-sleeve leading-none uppercase">
        {month.label}
      </span>
      {hasEpisodes && (
        <span className="font-data text-[11px] text-gold leading-none mt-0.5">
          {month.episodeCount}
        </span>
      )}
    </button>
  );
}

export function MonthView({
  yearData,
  maxMonthEpisodes,
  onBack,
  onEpisodeSelect,
  onTimeRangeSelect,
}: MonthViewProps) {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const selectedMonthData = selectedMonth !== null
    ? yearData.months[selectedMonth]
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sleeve hover:text-cream
                     transition-colors text-sm cursor-pointer"
        >
          <span className="text-xs">&larr;</span>
          <span className="font-editorial font-bold">{yearData.year}</span>
        </button>
        <button
          onClick={() => onTimeRangeSelect(yearData.startTimestamp, yearData.endTimestamp)}
          className="label-uppercase text-[9px] text-gold/70 hover:text-gold
                     transition-colors cursor-pointer px-1.5 py-0.5
                     rounded border border-gold/20 hover:border-gold/40"
        >
          View Era
        </button>
      </div>

      {/* 6x2 Month Grid */}
      <div
        className="grid grid-cols-6 gap-1"
        role="grid"
        aria-label={`Months of ${yearData.year}`}
      >
        {yearData.months.map((m) => (
          <MonthCell
            key={m.month}
            month={m}
            year={yearData.year}
            maxEpisodes={maxMonthEpisodes}
            isSelected={selectedMonth === m.month}
            onClick={() => setSelectedMonth(m.month)}
          />
        ))}
      </div>

      {/* Episode List for Selected Month */}
      {selectedMonthData && selectedMonthData.episodes.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <div className="label-uppercase text-[9px] text-shadow px-1">
            {selectedMonthData.label} {yearData.year} &middot; {selectedMonthData.episodeCount} ep
          </div>
          <div className="flex flex-col">
            {selectedMonthData.episodes.map((ep) => (
              <button
                key={ep._id}
                onClick={() => onEpisodeSelect(ep._id)}
                className="text-left px-2 py-1.5 rounded hover:bg-shelf/50
                           transition-colors cursor-pointer group"
              >
                <div className="text-sm text-cream/90 group-hover:text-cream truncate">
                  {ep.title}
                </div>
                <div className="font-data text-[10px] text-shadow">
                  {new Date(ep.airDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  {ep.trackCount > 0 && ` · ${ep.trackCount} tracks`}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
