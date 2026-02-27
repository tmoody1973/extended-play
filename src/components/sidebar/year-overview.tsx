"use client";

import { YearSummary } from "@/hooks/use-episode-calendar";

interface YearOverviewProps {
  years: YearSummary[];
  maxMonthEpisodes: number;
  onYearSelect: (year: number) => void;
  onTimeRangeSelect: (start: number, end: number) => void;
}

function MonthHeatmapBar({
  months,
  maxEpisodes,
}: {
  months: YearSummary["months"];
  maxEpisodes: number;
}) {
  return (
    <div className="flex gap-px flex-1 h-2.5 rounded-sm overflow-hidden" role="img" aria-hidden="true">
      {months.map((m) => {
        const intensity = m.episodeCount / maxEpisodes;
        return (
          <div
            key={m.month}
            className="flex-1 rounded-[1px] transition-colors"
            style={{
              backgroundColor:
                m.episodeCount > 0
                  ? `rgba(220, 165, 74, ${0.15 + intensity * 0.85})`
                  : "rgba(37, 32, 24, 0.5)",
            }}
          />
        );
      })}
    </div>
  );
}

export function YearOverview({
  years,
  maxMonthEpisodes,
  onYearSelect,
  onTimeRangeSelect,
}: YearOverviewProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {years.map((y) => (
        <div key={y.year} className="group flex items-center gap-2">
          <button
            onClick={() => onTimeRangeSelect(y.startTimestamp, y.endTimestamp)}
            className="shrink-0 w-10 text-right font-data text-[10px] text-sleeve
                       hover:text-gold transition-colors cursor-pointer"
            aria-label={`View ${y.year} era graph, ${y.episodeCount} episodes`}
            title={`Filter graph to ${y.year}`}
          >
            {y.year}
          </button>

          <button
            onClick={() => onYearSelect(y.year)}
            className="flex items-center gap-2 flex-1 min-w-0 py-1 px-1.5
                       rounded hover:bg-shelf/50 transition-colors cursor-pointer"
            aria-label={`Browse ${y.year}, ${y.episodeCount} episodes`}
          >
            <MonthHeatmapBar months={y.months} maxEpisodes={maxMonthEpisodes} />
            <span className="shrink-0 font-data text-[10px] text-shadow tabular-nums w-5 text-right group-hover:text-cream transition-colors">
              {y.episodeCount}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
