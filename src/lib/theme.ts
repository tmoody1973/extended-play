// Tokyo Record Bar — Design tokens for programmatic use (D3, Recharts, etc.)

export const colors = {
  walnut: "#1a1612",
  wood: "#2a2420",
  shelf: "#352f29",
  amber: "#d4a054",
  vinylBlue: "#7ca5b8",
  cream: "#e8ddd0",
  sleeve: "#9a8e82",
  shadow: "#6b6058",
  ledGreen: "#7ab87c",
  skipRed: "#c45c5c",
  edge: "#4a4038",
} as const;

// Community colors for graph node borders (distinct from amber accent)
export const communityColors = [
  "#d4a054", // amber (default)
  "#7ca5b8", // vinyl blue
  "#7ab87c", // led green
  "#c45c5c", // skip red
  "#b08fd8", // lavender
  "#e0a870", // gold
  "#6bb5b5", // teal
  "#d4708a", // rose
] as const;

export const fonts = {
  editorial: "'Playfair Display', serif",
  body: "'Inter', sans-serif",
  data: "'JetBrains Mono', monospace",
} as const;
