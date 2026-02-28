// Brownswood × NTS — Design tokens for programmatic use (D3, Recharts, etc.)

export const colors = {
  walnut: "#0D0B07",
  wood: "#171310",
  shelf: "#252018",
  gold: "#DCA54A",
  goldDim: "#C4923F",
  vinylBlue: "#7CA5B8",
  cream: "#FAF5E5",
  sleeve: "#9D825D",
  shadow: "#6B5D42",
  ledGreen: "#7AB87C",
  skipRed: "#C45C5C",
  edge: "#2E2820",
} as const;

// Community colors for graph node borders
export const communityColors = [
  "#DCA54A", // gold (default)
  "#7CA5B8", // vinyl blue
  "#7AB87C", // led green
  "#C45C5C", // skip red
  "#b08fd8", // lavender
  "#e0a870", // warm gold
  "#6bb5b5", // teal
  "#d4708a", // rose
] as const;

export const fonts = {
  editorial: "'Syne', sans-serif",
  body: "'Hanken Grotesk', sans-serif",
  data: "'JetBrains Mono', monospace",
} as const;
