"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface SonicProfile {
  name: string;
  energy?: number;
  danceability?: number;
  valence?: number;
  acousticness?: number;
  instrumentalness?: number;
}

interface SonicComparisonCardProps {
  artist1: SonicProfile;
  artist2: SonicProfile;
}

const DIMENSIONS = ["energy", "danceability", "valence", "acousticness", "instrumentalness"] as const;

export function SonicComparisonCard({ artist1, artist2 }: SonicComparisonCardProps) {
  const data = DIMENSIONS.map((dim) => ({
    dimension: dim.charAt(0).toUpperCase() + dim.slice(1),
    [artist1.name]: Math.round((artist1[dim] ?? 0.5) * 100),
    [artist2.name]: Math.round((artist2[dim] ?? 0.5) * 100),
  }));

  return (
    <div className="bg-wood border border-edge rounded-lg p-3">
      <h4 className="text-sleeve text-xs font-data uppercase mb-2">Sonic Comparison</h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid stroke="#3a332d" />
            <PolarAngleAxis dataKey="dimension" tick={{ fill: "#8a7e6e", fontSize: 10 }} />
            <Radar
              name={artist1.name}
              dataKey={artist1.name}
              stroke="#DCA54A"
              fill="#DCA54A"
              fillOpacity={0.2}
            />
            <Radar
              name={artist2.name}
              dataKey={artist2.name}
              stroke="#7ca5b8"
              fill="#7ca5b8"
              fillOpacity={0.2}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: "#8a7e6e" }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
