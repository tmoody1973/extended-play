import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export interface EpisodeSummary {
  _id: Id<"episodes">;
  title: string;
  airDate: string;
  airDateTimestamp: number;
  trackCount: number;
}

export interface MonthSummary {
  month: number; // 0-11
  label: string; // "Jan", "Feb", etc.
  episodeCount: number;
  episodes: EpisodeSummary[];
}

export interface YearSummary {
  year: number;
  episodeCount: number;
  months: MonthSummary[];
  // For time-range filtering: start/end timestamps for the full year
  startTimestamp: number;
  endTimestamp: number;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function useEpisodeCalendar() {
  const episodes = useQuery(api.queries.getEpisodeDateSummary);

  const years = useMemo<YearSummary[]>(() => {
    if (!episodes) return [];

    const yearMap = new Map<number, Map<number, EpisodeSummary[]>>();

    for (const ep of episodes) {
      const date = new Date(ep.airDate);
      const year = date.getFullYear();
      const month = date.getMonth();

      if (!yearMap.has(year)) {
        yearMap.set(year, new Map());
      }
      const monthMap = yearMap.get(year)!;
      if (!monthMap.has(month)) {
        monthMap.set(month, []);
      }
      monthMap.get(month)!.push(ep);
    }

    // Find global max episodes per month for normalization
    let maxMonthEpisodes = 1;
    for (const monthMap of yearMap.values()) {
      for (const eps of monthMap.values()) {
        maxMonthEpisodes = Math.max(maxMonthEpisodes, eps.length);
      }
    }

    const result: YearSummary[] = [];

    for (const [year, monthMap] of yearMap) {
      const months: MonthSummary[] = [];
      let totalEpisodes = 0;

      for (let m = 0; m < 12; m++) {
        const eps = monthMap.get(m) || [];
        totalEpisodes += eps.length;
        months.push({
          month: m,
          label: MONTH_LABELS[m],
          episodeCount: eps.length,
          episodes: eps,
        });
      }

      result.push({
        year,
        episodeCount: totalEpisodes,
        months,
        startTimestamp: new Date(year, 0, 1).getTime(),
        endTimestamp: new Date(year, 11, 31, 23, 59, 59, 999).getTime(),
      });
    }

    // Sort descending (most recent first)
    result.sort((a, b) => b.year - a.year);

    return result;
  }, [episodes]);

  // Global max for heatmap normalization
  const maxMonthEpisodes = useMemo(() => {
    let max = 1;
    for (const y of years) {
      for (const m of y.months) {
        max = Math.max(max, m.episodeCount);
      }
    }
    return max;
  }, [years]);

  return {
    years,
    maxMonthEpisodes,
    isLoading: episodes === undefined,
  };
}
