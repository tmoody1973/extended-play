# Crate Dig Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Crate Dig frontend (Next.js 15 + Convex + shadcn/ui) with the Tokyo record bar design system, responsive three-column layout, and all core components wired to live Convex data.

**Architecture:** Single Next.js 15 App Router project with Convex as the reactive data layer. shadcn/ui components customized with a warm analog "Tokyo record bar" theme. D3.js for the force-directed influence map. All data flows through Convex `useQuery`/`useMutation` hooks — no REST polling.

**Tech Stack:** Next.js 15, Convex, shadcn/ui, Tailwind CSS v4, D3.js, Recharts, TypeScript

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `convex.json`, `convex/schema.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `components.json`, `tailwind.config.ts`

**Step 1: Initialize Next.js 15 project**

Run from the `extended-play/` directory:

```bash
npx create-next-app@latest crate-dig --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack
```

When prompted, accept defaults. This creates `crate-dig/` with Next.js 15 + Tailwind + App Router.

**Step 2: Install Convex**

```bash
cd crate-dig
npm install convex
```

**Step 3: Initialize Convex project**

```bash
npx convex dev
```

This will prompt you to log in and create a new Convex project. Name it `crate-dig`. It creates `convex/` directory and `.env.local` with `NEXT_PUBLIC_CONVEX_URL`.

Press Ctrl+C after initialization — we'll run it again later.

**Step 4: Install shadcn/ui**

```bash
npx shadcn@latest init
```

Choose: New York style, Zinc base color, yes to CSS variables. This creates `components.json` and updates `globals.css`.

**Step 5: Install additional dependencies**

```bash
npm install d3 @types/d3 recharts
npm install @fontsource/playfair-display @fontsource/jetbrains-mono
```

**Step 6: Install shadcn/ui base components**

```bash
npx shadcn@latest add button card input dropdown-menu scroll-area sheet badge separator tooltip tabs textarea
```

**Step 7: Verify the app runs**

```bash
npm run dev
```

Open `http://localhost:3000` — should see default Next.js page. Stop the server.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 + Convex + shadcn/ui project"
```

---

## Task 2: Convex Schema & Backend Functions

**Files:**
- Create: `convex/schema.ts`
- Create: `convex/ingest.ts`
- Create: `convex/enrichment.ts`
- Create: `convex/queries.ts`
- Create: `convex/playlists.ts`
- Create: `convex/admin.ts`
- Create: `convex/reviewSearch.ts`
- Create: `convex/crons.ts`

**Step 1: Copy schema from background-docs**

Copy the contents of `../background-docs/convex-schema.ts` into `convex/schema.ts`. This is the 12-table schema with all indexes and search indexes.

**Step 2: Copy all backend functions**

Copy each file from `../background-docs/` into `convex/`:
- `convex-ingest.ts` → `convex/ingest.ts`
- `convex-enrichment.ts` → `convex/enrichment.ts`
- `convex-queries.ts` → `convex/queries.ts`
- `convex-playlists.ts` → `convex/playlists.ts`
- `convex-admin.ts` → `convex/admin.ts`
- `convex-reviewSearch.ts` → `convex/reviewSearch.ts`
- `convex-crons.ts` → `convex/crons.ts`

**Step 3: Deploy schema to Convex**

```bash
npx convex dev
```

Wait for "Convex functions ready!" message. The schema and all functions should deploy. Fix any TypeScript errors that Convex reports.

Leave `npx convex dev` running in a separate terminal — it watches for changes.

**Step 4: Verify in Convex dashboard**

Open the Convex dashboard URL shown in terminal. Verify all 12 tables exist (episodes, artists, tracks, etc.) and all functions are listed.

**Step 5: Commit**

```bash
git add convex/
git commit -m "feat: deploy Convex schema and backend functions (12 tables, enrichment pipeline)"
```

---

## Task 3: Design System — Tailwind Theme & CSS Variables

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Create: `src/lib/utils.ts` (may already exist from shadcn)
- Create: `src/lib/theme.ts`

**Step 1: Configure Tailwind theme**

Replace the contents of `tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        walnut: "#1a1612",
        wood: "#2a2420",
        shelf: "#352f29",
        amber: "#d4a054",
        "vinyl-blue": "#7ca5b8",
        cream: "#e8ddd0",
        sleeve: "#9a8e82",
        shadow: "#6b6058",
        "led-green": "#7ab87c",
        "skip-red": "#c45c5c",
        edge: "#4a4038",
        // shadcn/ui semantic tokens mapped to our palette
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      fontFamily: {
        editorial: ["Playfair Display", "serif"],
        body: ["Inter", "sans-serif"],
        data: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        vinyl: "0 4px 20px rgba(26, 22, 18, 0.6), 0 2px 8px rgba(212, 160, 84, 0.1)",
      },
      keyframes: {
        "vu-pulse": {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "vu-pulse": "vu-pulse 1.5s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

**Step 2: Set up CSS variables in globals.css**

Replace the contents of `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Tokyo Record Bar theme — mapped to HSL for shadcn/ui */
    --background: 24 16% 8%;        /* #1a1612 walnut */
    --foreground: 28 30% 86%;       /* #e8ddd0 cream */

    --card: 22 15% 18%;             /* #352f29 shelf */
    --card-foreground: 28 30% 86%;  /* cream */

    --popover: 22 15% 18%;          /* shelf */
    --popover-foreground: 28 30% 86%;

    --primary: 36 56% 58%;          /* #d4a054 amber */
    --primary-foreground: 24 16% 8%; /* walnut */

    --secondary: 200 30% 60%;       /* #7ca5b8 vinyl-blue */
    --secondary-foreground: 28 30% 86%;

    --muted: 24 12% 14%;            /* #2a2420 wood */
    --muted-foreground: 24 12% 56%; /* #9a8e82 sleeve */

    --accent: 24 12% 14%;           /* wood */
    --accent-foreground: 28 30% 86%;

    --destructive: 0 45% 56%;       /* #c45c5c skip-red */
    --destructive-foreground: 28 30% 86%;

    --border: 24 10% 24%;           /* #4a4038 edge */
    --input: 24 10% 24%;
    --ring: 36 56% 58%;             /* amber */

    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-walnut text-cream font-body antialiased;
  }
  h1, h2, h3, h4, h5, h6 {
    @apply font-editorial;
  }
}

/* Wood grain texture overlay */
.bg-wood-grain {
  background-image: url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
}

/* Tube glow ring for graph nodes */
.ring-tube-glow {
  box-shadow: 0 0 12px rgba(212, 160, 84, 0.4), 0 0 4px rgba(212, 160, 84, 0.6);
}

/* Vinyl edge shadow for album art */
.shadow-vinyl {
  box-shadow: 0 4px 20px rgba(26, 22, 18, 0.6), 0 2px 8px rgba(212, 160, 84, 0.1);
}
```

**Step 3: Create theme constants file**

Create `src/lib/theme.ts`:

```typescript
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
```

**Step 4: Ensure utils.ts has cn() helper**

Verify `src/lib/utils.ts` exists (shadcn creates it). It should contain:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 5: Verify theme renders correctly**

Update `src/app/page.tsx` temporarily to display theme swatches:

```tsx
export default function Home() {
  return (
    <main className="min-h-screen bg-walnut bg-wood-grain p-8">
      <h1 className="text-4xl font-editorial text-cream mb-6">Crate Dig</h1>
      <p className="text-sleeve font-body mb-8">Tokyo Record Bar Theme Test</p>
      <div className="flex gap-3 mb-6">
        {["walnut","wood","shelf","amber","vinyl-blue","cream","sleeve","shadow","led-green","skip-red","edge"].map(c => (
          <div key={c} className={`w-12 h-12 rounded bg-${c} ring-1 ring-edge`} title={c} />
        ))}
      </div>
      <div className="bg-shelf p-6 rounded-lg shadow-vinyl max-w-md">
        <h2 className="text-2xl font-editorial text-cream mb-2">Album Card</h2>
        <p className="text-sleeve text-sm font-data">JetBrains Mono metadata</p>
        <p className="text-cream mt-2">This card uses the shelf background with vinyl shadow.</p>
      </div>
    </main>
  );
}
```

Run `npm run dev` and verify:
- Dark walnut background with subtle wood grain texture
- Playfair Display headings, Inter body, JetBrains Mono data
- Color swatches render correctly
- Card has warm vinyl shadow

**Step 6: Commit**

```bash
git add tailwind.config.ts src/app/globals.css src/lib/theme.ts src/lib/utils.ts src/app/page.tsx
git commit -m "feat: implement Tokyo record bar design system (colors, fonts, textures, shadows)"
```

---

## Task 4: Convex Client Provider

**Files:**
- Create: `src/app/ConvexClientProvider.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create Convex provider component**

Create `src/app/ConvexClientProvider.tsx`:

```tsx
"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
```

**Step 2: Update root layout**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Playfair_Display, Inter, JetBrains_Mono } from "next/font/google";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-editorial",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-data",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Crate Dig — Rhythm Lab Radio",
  description: "Explore 20 years of music connections through conversation, powered by Gemini and Google Cloud.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-walnut text-cream font-body antialiased">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
```

**Step 3: Update Tailwind font config to use CSS variables**

In `tailwind.config.ts`, update the fontFamily section:

```typescript
fontFamily: {
  editorial: ["var(--font-editorial)", "serif"],
  body: ["var(--font-body)", "sans-serif"],
  data: ["var(--font-data)", "monospace"],
},
```

**Step 4: Verify Convex connection**

Make sure `npx convex dev` is running in another terminal. Run `npm run dev`. Open the browser console — no Convex connection errors should appear.

**Step 5: Commit**

```bash
git add src/app/ConvexClientProvider.tsx src/app/layout.tsx tailwind.config.ts
git commit -m "feat: wire Convex provider and Google Fonts (Playfair, Inter, JetBrains Mono)"
```

---

## Task 5: App Shell & Responsive Layout

**Files:**
- Create: `src/components/layout/app-shell.tsx`
- Create: `src/components/layout/main-layout.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create the AppShell component**

Create `src/components/layout/app-shell.tsx`:

```tsx
import { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-walnut bg-wood-grain overflow-hidden">
      {children}
    </div>
  );
}
```

**Step 2: Create the MainLayout component**

Create `src/components/layout/main-layout.tsx`:

```tsx
import { ReactNode } from "react";

interface MainLayoutProps {
  sidebar?: ReactNode;
  graph?: ReactNode;
  stream?: ReactNode;
}

export function MainLayout({ sidebar, graph, stream }: MainLayoutProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Episode Sidebar — hidden on mobile, visible on desktop */}
      {sidebar && (
        <aside className="hidden lg:flex w-[250px] flex-shrink-0 border-r border-edge overflow-y-auto">
          {sidebar}
        </aside>
      )}

      {/* Influence Map — takes remaining space */}
      <div className="flex-1 min-w-0 hidden md:block">
        {graph}
      </div>

      {/* Story Stream — fixed width on desktop, full width on mobile */}
      <div className="w-full md:w-[400px] lg:w-[400px] flex-shrink-0 border-l border-edge overflow-y-auto">
        {stream}
      </div>
    </div>
  );
}
```

**Step 3: Wire up the page with placeholder panels**

Replace `src/app/page.tsx`:

```tsx
import { AppShell } from "@/components/layout/app-shell";
import { MainLayout } from "@/components/layout/main-layout";

export default function Home() {
  return (
    <AppShell>
      {/* Voice Bar placeholder */}
      <header className="h-14 flex items-center px-4 border-b border-edge bg-wood flex-shrink-0">
        <div className="w-3 h-3 rounded-full bg-amber animate-vu-pulse mr-3" />
        <span className="text-cream font-body text-sm">Talk to the show...</span>
        <div className="ml-auto text-sleeve text-sm font-data">Episode ▾</div>
      </header>

      <MainLayout
        sidebar={
          <div className="p-4">
            <h3 className="font-editorial text-cream text-lg mb-4">Episode Playlist</h3>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 mb-3 p-2 rounded hover:bg-shelf transition-colors cursor-pointer">
                <span className="text-shadow font-data text-xs w-5">{String(i).padStart(2, "0")}</span>
                <div className="w-8 h-8 rounded bg-shelf flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-cream text-sm truncate">Track Title {i}</p>
                  <p className="text-sleeve text-xs truncate">Artist Name</p>
                </div>
              </div>
            ))}
          </div>
        }
        graph={
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-shelf ring-2 ring-amber ring-tube-glow mx-auto mb-4" />
              <p className="text-cream font-editorial text-lg">Influence Map</p>
              <p className="text-sleeve text-sm mt-1">D3 force graph renders here</p>
            </div>
          </div>
        }
        stream={
          <div className="p-4">
            <h3 className="font-editorial text-cream text-lg mb-4">Story Stream</h3>
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-shelf rounded-lg p-4 mb-3 shadow-vinyl animate-slide-up">
                <p className="text-cream text-sm">Agent narration card {i}. Exploring the connection between Fela Kuti and Kokoroko through the lens of Afrobeat...</p>
                <p className="text-sleeve text-xs mt-2 font-data">2 min ago</p>
              </div>
            ))}
          </div>
        }
      />

      {/* Playlist Bar placeholder */}
      <footer className="h-16 flex items-center px-4 border-t border-edge bg-wood flex-shrink-0">
        <span className="text-cream text-sm font-editorial mr-4">♫ Playlist</span>
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-10 h-10 rounded bg-shelf" />
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button className="text-xs text-amber hover:text-cream transition-colors">+ Add</button>
          <button className="text-xs text-amber hover:text-cream transition-colors">Export ▾</button>
        </div>
      </footer>
    </AppShell>
  );
}
```

**Step 4: Verify responsive layout**

Run `npm run dev` and check:
- **Desktop (>1024px):** Three columns visible — sidebar, graph, stream
- **Tablet (768-1024px):** Two columns — graph + stream, sidebar hidden
- **Phone (<768px):** Single column — stream only
- Voice bar sticky at top, playlist bar at bottom
- Wood grain texture visible on background
- Amber pulse animation on voice indicator
- Cards have vinyl shadow and slide-up animation

**Step 5: Commit**

```bash
git add src/components/layout/ src/app/page.tsx
git commit -m "feat: implement responsive app shell (3-column desktop, 2-col tablet, 1-col phone)"
```

---

## Task 6: Voice Bar Component

**Files:**
- Create: `src/components/voice/voice-bar.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create VoiceBar component**

Create `src/components/voice/voice-bar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface VoiceBarProps {
  onEpisodeSelect?: (episodeId: string) => void;
}

export function VoiceBar({ onEpisodeSelect }: VoiceBarProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");

  return (
    <header className="h-14 flex items-center px-4 border-b border-edge bg-wood flex-shrink-0 gap-3">
      {/* Mic button */}
      <button
        onClick={() => setIsRecording(!isRecording)}
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0",
          isRecording
            ? "bg-amber text-walnut animate-vu-pulse"
            : "bg-shelf text-sleeve hover:text-cream hover:bg-edge"
        )}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          {isRecording ? (
            <rect x="4" y="4" width="8" height="8" rx="1" />
          ) : (
            <path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V3a2 2 0 0 1 2-2zm-3 6a3 3 0 1 0 6 0h1a4 4 0 0 1-3.5 3.97V13H10v1H6v-1h1.5v-2.03A4 4 0 0 1 4 7h1z" />
          )}
        </svg>
      </button>

      {/* Transcription / prompt area */}
      <div className="flex-1 min-w-0">
        {transcript ? (
          <p className="text-cream text-sm truncate">{transcript}</p>
        ) : (
          <p className="text-shadow text-sm">
            {isRecording ? "Listening..." : "Talk to the show..."}
          </p>
        )}
      </div>

      {/* Episode selector */}
      <button className="text-sleeve text-sm font-data hover:text-cream transition-colors flex-shrink-0">
        Episode ▾
      </button>
    </header>
  );
}
```

**Step 2: Replace the placeholder in page.tsx**

In `src/app/page.tsx`, import and use `VoiceBar`:

```tsx
import { AppShell } from "@/components/layout/app-shell";
import { MainLayout } from "@/components/layout/main-layout";
import { VoiceBar } from "@/components/voice/voice-bar";

export default function Home() {
  return (
    <AppShell>
      <VoiceBar />
      <MainLayout
        sidebar={/* ... keep existing placeholder ... */}
        graph={/* ... keep existing placeholder ... */}
        stream={/* ... keep existing placeholder ... */}
      />
      {/* ... keep existing playlist bar placeholder ... */}
    </AppShell>
  );
}
```

**Step 3: Verify**

Run `npm run dev`:
- Mic button toggles between mic icon and stop icon
- Amber pulse animation when recording
- "Talk to the show..." placeholder text
- "Listening..." when recording active

**Step 4: Commit**

```bash
git add src/components/voice/
git commit -m "feat: add VoiceBar component with mic toggle and amber pulse animation"
```

---

## Task 7: Episode Sidebar Component

**Files:**
- Create: `src/components/layout/episode-sidebar.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create EpisodeSidebar component**

Create `src/components/layout/episode-sidebar.tsx`:

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Id } from "../../../convex/_generated/dataModel";

interface EpisodeSidebarProps {
  episodeId?: Id<"episodes">;
  onTrackSelect?: (trackId: Id<"tracks">, artistId: Id<"artists">) => void;
}

export function EpisodeSidebar({ episodeId, onTrackSelect }: EpisodeSidebarProps) {
  const episodes = useQuery(api.queries.listEpisodes, { limit: 20 });
  const episodeWithTracks = useQuery(
    api.queries.getEpisodeWithTracks,
    episodeId ? { episodeId } : "skip"
  );

  return (
    <div className="h-full flex flex-col p-3 bg-walnut">
      <h3 className="font-editorial text-cream text-base mb-3 px-1">
        {episodeWithTracks?.title || "Episodes"}
      </h3>

      {!episodeId && episodes && (
        <div className="space-y-1 overflow-y-auto">
          {episodes.map((ep) => (
            <button
              key={ep._id}
              className="w-full text-left p-2 rounded hover:bg-shelf transition-colors"
            >
              <p className="text-cream text-sm truncate">{ep.title}</p>
              <p className="text-shadow text-xs font-data">{ep.airDate}</p>
            </button>
          ))}
        </div>
      )}

      {episodeWithTracks?.tracks && (
        <div className="space-y-0.5 overflow-y-auto flex-1">
          {episodeWithTracks.tracks.map((track, i) => (
            <button
              key={track._id}
              onClick={() => onTrackSelect?.(track._id, track.artistId)}
              className={cn(
                "w-full flex items-center gap-2.5 p-2 rounded transition-colors",
                "hover:bg-shelf cursor-pointer group"
              )}
            >
              <span className="text-shadow font-data text-xs w-5 flex-shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div
                className="w-8 h-8 rounded bg-shelf flex-shrink-0 bg-cover bg-center"
                style={
                  track.albumArtUrl
                    ? { backgroundImage: `url(${track.albumArtUrl})` }
                    : undefined
                }
              />
              <div className="min-w-0 flex-1">
                <p className="text-cream text-sm truncate group-hover:text-amber transition-colors">
                  {track.title}
                </p>
                <p className="text-sleeve text-xs truncate">{track.artistName}</p>
              </div>
              {track.enrichmentStatus !== "complete" && (
                <div className="w-1.5 h-1.5 rounded-full bg-amber animate-vu-pulse flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}

      {!episodes && !episodeWithTracks && (
        <div className="space-y-2 p-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-2.5 animate-pulse">
              <div className="w-5 h-3 rounded bg-shelf" />
              <div className="w-8 h-8 rounded bg-shelf" />
              <div className="flex-1 space-y-1">
                <div className="h-3 rounded bg-shelf w-3/4" />
                <div className="h-2.5 rounded bg-shelf w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Wire into page.tsx**

Update the sidebar slot in `src/app/page.tsx` to use `<EpisodeSidebar />`.

**Step 3: Verify**

With `npx convex dev` running:
- If no episodes in DB: loading shimmer shows, then empty state
- Component renders without errors
- Convex connection works (no console errors)

**Step 4: Commit**

```bash
git add src/components/layout/episode-sidebar.tsx src/app/page.tsx
git commit -m "feat: add EpisodeSidebar with Convex reactive data and loading states"
```

---

## Task 8: Story Stream Component

**Files:**
- Create: `src/components/stream/story-stream.tsx`
- Create: `src/components/stream/narration-card.tsx`
- Create: `src/components/stream/artist-card.tsx`
- Create: `src/components/stream/album-art-card.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create individual card components**

Create `src/components/stream/narration-card.tsx`:

```tsx
interface NarrationCardProps {
  content: string;
  timestamp?: string;
}

export function NarrationCard({ content, timestamp }: NarrationCardProps) {
  return (
    <div className="bg-shelf rounded-lg p-4 shadow-vinyl animate-slide-up">
      <p className="text-cream text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      {timestamp && (
        <p className="text-shadow text-xs font-data mt-2">{timestamp}</p>
      )}
    </div>
  );
}
```

Create `src/components/stream/artist-card.tsx`:

```tsx
interface ArtistCardProps {
  name: string;
  imageUrl?: string;
  genres?: string[];
  bio?: string;
  country?: string;
  communityLabel?: string;
}

export function ArtistCard({ name, imageUrl, genres, bio, country, communityLabel }: ArtistCardProps) {
  return (
    <div className="bg-shelf rounded-lg p-4 shadow-vinyl animate-slide-up">
      <div className="flex items-start gap-3">
        {/* Artist photo */}
        <div
          className="w-16 h-16 rounded-full bg-wood flex-shrink-0 ring-2 ring-amber ring-tube-glow bg-cover bg-center flex items-center justify-center"
          style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
        >
          {!imageUrl && (
            <span className="text-amber font-editorial text-lg">
              {name.charAt(0)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-cream font-editorial text-lg">{name}</h4>
          {country && (
            <p className="text-sleeve text-xs font-data">{country}</p>
          )}
          {communityLabel && (
            <span className="inline-block text-xs bg-wood text-amber px-2 py-0.5 rounded mt-1">
              {communityLabel}
            </span>
          )}
        </div>
      </div>
      {genres && genres.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {genres.slice(0, 5).map((g) => (
            <span key={g} className="text-xs bg-wood text-sleeve px-2 py-0.5 rounded">
              {g}
            </span>
          ))}
        </div>
      )}
      {bio && (
        <p className="text-sleeve text-sm mt-3 line-clamp-3">{bio}</p>
      )}
    </div>
  );
}
```

Create `src/components/stream/album-art-card.tsx`:

```tsx
interface AlbumArtCardProps {
  artUrl?: string;
  title: string;
  artistName: string;
  albumTitle?: string;
  year?: number;
}

export function AlbumArtCard({ artUrl, title, artistName, albumTitle, year }: AlbumArtCardProps) {
  return (
    <div className="bg-shelf rounded-lg overflow-hidden shadow-vinyl animate-slide-up">
      {artUrl && (
        <div
          className="w-full aspect-square bg-wood bg-cover bg-center"
          style={{ backgroundImage: `url(${artUrl})` }}
        />
      )}
      <div className="p-3">
        <p className="text-cream text-sm font-medium truncate">{title}</p>
        <p className="text-sleeve text-xs truncate">{artistName}</p>
        {albumTitle && (
          <p className="text-shadow text-xs font-data mt-1">
            {albumTitle}{year ? ` (${year})` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create the StoryStream container**

Create `src/components/stream/story-stream.tsx`:

```tsx
"use client";

import { NarrationCard } from "./narration-card";
import { ArtistCard } from "./artist-card";
import { AlbumArtCard } from "./album-art-card";
import { ScrollArea } from "@/components/ui/scroll-area";

// Temporary demo data — will be replaced with Convex queries
const demoItems = [
  {
    type: "narration" as const,
    content: "Let's explore the connection between Fela Kuti and Kokoroko. Kokoroko sits at a fascinating intersection — West African highlife tradition filtered through the London jazz scene.",
    timestamp: "Just now",
  },
  {
    type: "artist" as const,
    name: "Kokoroko",
    genres: ["Afrobeat", "UK Jazz", "Highlife"],
    country: "UK",
    communityLabel: "London Jazz Scene",
  },
  {
    type: "narration" as const,
    content: "Their horn arrangements directly reference Tony Allen's work with Fela. There's a straight line from Lagos in the '70s to Deptford in 2019.",
    timestamp: "1 min ago",
  },
  {
    type: "album" as const,
    title: "Zombie",
    artistName: "Fela Kuti",
    albumTitle: "Zombie",
    year: 1977,
  },
];

export function StoryStream() {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        <h3 className="font-editorial text-cream text-base mb-2">Story Stream</h3>
        {demoItems.map((item, i) => {
          switch (item.type) {
            case "narration":
              return <NarrationCard key={i} content={item.content} timestamp={item.timestamp} />;
            case "artist":
              return (
                <ArtistCard
                  key={i}
                  name={item.name}
                  genres={item.genres}
                  country={item.country}
                  communityLabel={item.communityLabel}
                />
              );
            case "album":
              return (
                <AlbumArtCard
                  key={i}
                  title={item.title}
                  artistName={item.artistName}
                  albumTitle={item.albumTitle}
                  year={item.year}
                />
              );
            default:
              return null;
          }
        })}
      </div>
    </ScrollArea>
  );
}
```

**Step 3: Wire into page.tsx**

Update the stream slot in `src/app/page.tsx` to use `<StoryStream />`.

**Step 4: Verify**

Run `npm run dev`:
- Story stream shows demo narration cards, artist card, album art card
- Cards have slide-up animation, vinyl shadow
- Artist card has amber ring-tube-glow around avatar
- Genre badges render in muted style
- Scrollable when content overflows

**Step 5: Commit**

```bash
git add src/components/stream/
git commit -m "feat: add story stream with narration, artist, and album art cards"
```

---

## Task 9: Playlist Bar Component

**Files:**
- Create: `src/components/playlist/playlist-bar.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create PlaylistBar component**

Create `src/components/playlist/playlist-bar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface PlaylistTrack {
  id: string;
  title: string;
  artistName: string;
  albumArtUrl?: string;
}

interface PlaylistBarProps {
  title?: string;
  tracks?: PlaylistTrack[];
  onExport?: (platform: string) => void;
}

export function PlaylistBar({ title = "Playlist", tracks = [], onExport }: PlaylistBarProps) {
  const [showExport, setShowExport] = useState(false);

  return (
    <footer className="h-16 flex items-center px-4 border-t border-edge bg-wood flex-shrink-0 gap-3">
      <span className="text-cream text-sm font-editorial flex-shrink-0">
        ♫ {title}
      </span>

      {/* Album art thumbnail strip */}
      <div className="flex gap-1.5 overflow-x-auto flex-1 min-w-0 py-1">
        {tracks.map((track) => (
          <div
            key={track.id}
            className="w-10 h-10 rounded bg-shelf flex-shrink-0 bg-cover bg-center group relative"
            style={
              track.albumArtUrl
                ? { backgroundImage: `url(${track.albumArtUrl})` }
                : undefined
            }
            title={`${track.artistName} — ${track.title}`}
          >
            {!track.albumArtUrl && (
              <span className="text-shadow text-xs flex items-center justify-center h-full">
                ♪
              </span>
            )}
          </div>
        ))}
        {tracks.length === 0 && (
          <p className="text-shadow text-xs self-center">No tracks yet</p>
        )}
      </div>

      {/* Track count */}
      {tracks.length > 0 && (
        <span className="text-sleeve text-xs font-data flex-shrink-0">
          {tracks.length} tracks
        </span>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0 relative">
        <button className="text-xs text-amber hover:text-cream transition-colors">
          + Add
        </button>
        <button
          className="text-xs text-amber hover:text-cream transition-colors"
          onClick={() => setShowExport(!showExport)}
        >
          Export ▾
        </button>
        {showExport && (
          <div className="absolute bottom-full right-0 mb-2 bg-shelf border border-edge rounded-lg p-1 min-w-[140px] shadow-vinyl">
            {["Spotify", "Apple Music", "YouTube Music", ".m3u"].map((p) => (
              <button
                key={p}
                onClick={() => {
                  onExport?.(p.toLowerCase().replace(/[.\s]/g, "_"));
                  setShowExport(false);
                }}
                className="w-full text-left text-sm text-cream hover:text-amber hover:bg-wood px-3 py-1.5 rounded transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
}
```

**Step 2: Wire into page.tsx**

Replace the footer placeholder in `src/app/page.tsx` with `<PlaylistBar />`. Pass some demo tracks:

```tsx
<PlaylistBar
  title="My Crate"
  tracks={[
    { id: "1", title: "Zombie", artistName: "Fela Kuti" },
    { id: "2", title: "Secret Agent", artistName: "Tony Allen" },
    { id: "3", title: "Abusey Junction", artistName: "Kokoroko" },
  ]}
/>
```

**Step 3: Verify**

- Playlist bar shows at bottom with album art thumbnails
- Track count displays
- Export dropdown opens and lists streaming platforms
- Amber accent on interactive elements

**Step 4: Commit**

```bash
git add src/components/playlist/ src/app/page.tsx
git commit -m "feat: add PlaylistBar with export dropdown and album art thumbnails"
```

---

## Task 10: Influence Map — D3 Force Graph

**Files:**
- Create: `src/components/graph/influence-map.tsx`
- Create: `src/components/graph/use-force-graph.ts`
- Modify: `src/app/page.tsx`

**Step 1: Create the D3 force simulation hook**

Create `src/components/graph/use-force-graph.ts`:

```typescript
"use client";

import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { colors } from "@/lib/theme";

export interface GraphNode {
  id: string;
  name: string;
  imageUrl?: string;
  communityId?: number;
  bridgeScore?: number;
  x?: number;
  y?: number;
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
}

export function useForceGraph({ nodes, edges, width, height, onNodeClick }: UseForceGraphOptions) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);

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

    // Node circles (photo background or gradient fallback)
    node.append("circle")
      .attr("r", 20)
      .attr("fill", colors.shelf)
      .attr("stroke", colors.amber)
      .attr("stroke-width", 2);

    // Node labels
    node.append("text")
      .text((d) => d.name.length > 12 ? d.name.substring(0, 10) + "…" : d.name)
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

  return svgRef;
}

// Import fonts for D3 text
import { fonts } from "@/lib/theme";
```

**Step 2: Create the InfluenceMap component**

Create `src/components/graph/influence-map.tsx`:

```tsx
"use client";

import { useRef, useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useForceGraph, GraphNode, GraphEdge } from "./use-force-graph";

interface InfluenceMapProps {
  onNodeClick?: (artistId: string) => void;
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

export function InfluenceMap({ onNodeClick }: InfluenceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Try to load real graph data from Convex
  const graphSnapshot = useQuery(api.queries.getActiveGraph);

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
```

**Step 3: Wire into page.tsx**

Update the graph slot in `src/app/page.tsx` to use `<InfluenceMap />`.

**Step 4: Verify**

Run `npm run dev`:
- D3 force graph renders with demo nodes (Fela Kuti, Kokoroko, etc.)
- Nodes are draggable
- Scroll zoom works
- Nodes have amber ring, labels beneath
- Hover effect enlarges nodes
- "Demo graph" label shows at bottom

**Step 5: Commit**

```bash
git add src/components/graph/
git commit -m "feat: add D3 force-directed influence map with demo data and Convex integration"
```

---

## Task 11: Admin Dashboard — Playlist Ingestion

**Files:**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/layout.tsx`

**Step 1: Create admin layout**

Create `src/app/admin/layout.tsx`:

```tsx
import { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-walnut bg-wood-grain">
      <nav className="h-12 flex items-center px-4 border-b border-edge bg-wood">
        <a href="/" className="text-amber text-sm hover:text-cream transition-colors mr-4">
          ← Back to Crate Dig
        </a>
        <h1 className="font-editorial text-cream text-lg">Admin Dashboard</h1>
      </nav>
      <main className="p-6 max-w-4xl mx-auto">{children}</main>
    </div>
  );
}
```

**Step 2: Create admin page with playlist paste tool and enrichment stats**

Create `src/app/admin/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPage() {
  const [rawText, setRawText] = useState("");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [airDate, setAirDate] = useState("");
  const [result, setResult] = useState<any>(null);
  const [isIngesting, setIsIngesting] = useState(false);

  const parseAndIngest = useMutation(api.admin.parseAndIngestPlaylist);
  const previewParse = useMutation(api.admin.previewParse);
  const enrichmentStats = useQuery(api.queries.getEnrichmentStats);
  const retryFailed = useMutation(api.admin.retryFailedJobs);

  const handlePreview = async () => {
    const preview = await previewParse({ rawText });
    setResult({ type: "preview", data: preview });
  };

  const handleIngest = async () => {
    if (!episodeTitle || !airDate || !rawText) return;
    setIsIngesting(true);
    try {
      const res = await parseAndIngest({
        rawText,
        episodeTitle,
        airDate,
        sourceType: "manual",
      });
      setResult({ type: "ingest", data: res });
      if (res.status === "success") {
        setRawText("");
        setEpisodeTitle("");
        setAirDate("");
      }
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Enrichment Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="font-editorial">Enrichment Stats</CardTitle>
        </CardHeader>
        <CardContent>
          {enrichmentStats ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sleeve text-xs font-data uppercase mb-2">Artists</p>
                <div className="space-y-1 text-sm">
                  <p className="text-cream">Total: <span className="text-amber font-data">{enrichmentStats.artistStats.total}</span></p>
                  <p className="text-sleeve">Stubs: {enrichmentStats.artistStats.stub}</p>
                  <p className="text-sleeve">Identified: {enrichmentStats.artistStats.identified}</p>
                  <p className="text-sleeve">Complete: {enrichmentStats.artistStats.complete}</p>
                  <p className="text-sleeve">With images: {enrichmentStats.artistStats.withImages}</p>
                </div>
              </div>
              <div>
                <p className="text-sleeve text-xs font-data uppercase mb-2">Tracks</p>
                <div className="space-y-1 text-sm">
                  <p className="text-cream">Total: <span className="text-amber font-data">{enrichmentStats.trackStats.total}</span></p>
                  <p className="text-sleeve">Raw: {enrichmentStats.trackStats.raw}</p>
                  <p className="text-sleeve">With art: {enrichmentStats.trackStats.withAlbumArt}</p>
                  <p className="text-sleeve">Complete: {enrichmentStats.trackStats.complete}</p>
                </div>
              </div>
              <div>
                <p className="text-sleeve text-xs font-data uppercase mb-2">Jobs</p>
                <div className="space-y-1 text-sm">
                  <p className="text-cream">Queued: <span className="text-amber font-data">{enrichmentStats.jobStats.queued}</span></p>
                  <p className="text-sleeve">Running: {enrichmentStats.jobStats.running}</p>
                  <p className="text-led-green">Completed: {enrichmentStats.jobStats.completed}</p>
                  <p className="text-skip-red">Failed: {enrichmentStats.jobStats.failed}</p>
                </div>
                {enrichmentStats.jobStats.failed > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-amber border-amber hover:bg-amber hover:text-walnut"
                    onClick={() => retryFailed({})}
                  >
                    Retry Failed
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sleeve text-sm">Loading stats...</p>
          )}
        </CardContent>
      </Card>

      {/* Playlist Paste Tool */}
      <Card>
        <CardHeader>
          <CardTitle className="font-editorial">Ingest Playlist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sleeve text-xs font-data block mb-1">Episode Title</label>
              <Input
                value={episodeTitle}
                onChange={(e) => setEpisodeTitle(e.target.value)}
                placeholder="Rhythm Lab Radio — Episode 412"
                className="bg-wood border-edge text-cream"
              />
            </div>
            <div>
              <label className="text-sleeve text-xs font-data block mb-1">Air Date</label>
              <Input
                type="date"
                value={airDate}
                onChange={(e) => setAirDate(e.target.value)}
                className="bg-wood border-edge text-cream"
              />
            </div>
          </div>

          <div>
            <label className="text-sleeve text-xs font-data block mb-1">
              Paste tracklist (auto-detects format)
            </label>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={"Fela Kuti - Zombie\nTony Allen - Secret Agent\nKokoroko - Abusey Junction"}
              rows={10}
              className="bg-wood border-edge text-cream font-data text-sm"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={!rawText}
              className="text-vinyl-blue border-vinyl-blue hover:bg-vinyl-blue hover:text-walnut"
            >
              Preview Parse
            </Button>
            <Button
              onClick={handleIngest}
              disabled={!rawText || !episodeTitle || !airDate || isIngesting}
              className="bg-amber text-walnut hover:bg-amber/80"
            >
              {isIngesting ? "Ingesting..." : "Ingest Episode"}
            </Button>
          </div>

          {/* Results */}
          {result && (
            <div className="bg-wood rounded-lg p-4 mt-4">
              <pre className="text-cream text-xs font-data whitespace-pre-wrap overflow-auto max-h-60">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 3: Verify**

Run `npm run dev` and navigate to `http://localhost:3000/admin`:
- Enrichment stats card shows (all zeros initially)
- Paste tool has episode title, air date, and textarea
- Preview Parse shows parsed tracks as JSON
- Ingest Episode creates the episode in Convex (verify in Convex dashboard)

**Step 4: Commit**

```bash
git add src/app/admin/
git commit -m "feat: add admin dashboard with playlist ingest tool and enrichment stats"
```

---

## Task 12: Wire All Components Together in Main Page

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Create the fully wired main page**

Replace `src/app/page.tsx` with the complete version connecting all components:

```tsx
"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { MainLayout } from "@/components/layout/main-layout";
import { VoiceBar } from "@/components/voice/voice-bar";
import { EpisodeSidebar } from "@/components/layout/episode-sidebar";
import { InfluenceMap } from "@/components/graph/influence-map";
import { StoryStream } from "@/components/stream/story-stream";
import { PlaylistBar } from "@/components/playlist/playlist-bar";
import { Id } from "../../convex/_generated/dataModel";

export default function Home() {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<Id<"episodes"> | undefined>();
  const [selectedArtistId, setSelectedArtistId] = useState<string | undefined>();

  const handleNodeClick = (artistId: string) => {
    setSelectedArtistId(artistId);
  };

  const handleTrackSelect = (trackId: Id<"tracks">, artistId: Id<"artists">) => {
    setSelectedArtistId(artistId);
  };

  return (
    <AppShell>
      <VoiceBar />
      <MainLayout
        sidebar={
          <EpisodeSidebar
            episodeId={selectedEpisodeId}
            onTrackSelect={handleTrackSelect}
          />
        }
        graph={<InfluenceMap onNodeClick={handleNodeClick} />}
        stream={<StoryStream />}
      />
      <PlaylistBar
        title="My Crate"
        tracks={[]}
      />
    </AppShell>
  );
}
```

**Step 2: Verify full integration**

Run `npm run dev` with `npx convex dev` running:
- All panels render: voice bar, sidebar, graph, stream, playlist bar
- Responsive: collapse sidebar on tablet, single column on phone
- D3 graph interactive with demo data
- Story stream shows demo cards
- No console errors from Convex

**Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire all components together in main page with state management"
```

---

## Task 13: Seed Data & End-to-End Test

**Files:**
- No new files — use the admin dashboard

**Step 1: Ingest a test episode via admin dashboard**

Navigate to `http://localhost:3000/admin` and paste a real Rhythm Lab Radio tracklist:

- **Episode Title**: "Rhythm Lab Radio — Test Episode"
- **Air Date**: 2026-02-26
- **Tracklist** (paste this):
```
Fela Kuti - Zombie
Tony Allen - Secret Agent
Kokoroko - Abusey Junction
Ezra Collective - Space Is the Place
Shabaka Hutchings - Black Meditation
Sons of Kemet - My Queen Is Nanny of the Maroons
Antibalas - Dirty Money
Budos Band - Burnt Offering
```

Click "Ingest Episode". Verify in the Convex dashboard:
- Episode created in `episodes` table
- 8 tracks in `tracks` table
- 8 artist stubs in `artists` table
- 7 playlist-adjacent connections in `artistConnections` table
- 8 enrichment jobs queued in `enrichmentJobs` table

**Step 2: Verify frontend reacts to data**

Navigate back to `http://localhost:3000`:
- Episode sidebar should show the test episode
- If enrichment cron is running, watch artist data populate in real time

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: verify end-to-end data flow from admin ingest to frontend display"
```

---

## Summary

| Task | Component | Estimated Steps |
|------|-----------|----------------|
| 1 | Project scaffold | 8 |
| 2 | Convex schema + backend | 5 |
| 3 | Design system | 6 |
| 4 | Convex provider | 5 |
| 5 | App shell + layout | 5 |
| 6 | Voice bar | 4 |
| 7 | Episode sidebar | 4 |
| 8 | Story stream + cards | 5 |
| 9 | Playlist bar | 4 |
| 10 | D3 influence map | 5 |
| 11 | Admin dashboard | 4 |
| 12 | Wire everything together | 3 |
| 13 | Seed data + E2E test | 3 |
| **Total** | | **61 steps** |

Each task builds on the previous. After Task 13, you'll have a fully functional frontend with:
- Tokyo record bar design system
- Responsive 3-column layout
- D3 force-directed influence map (with demo + real data)
- Story stream with narration, artist, and album art cards
- Voice bar (UI ready, WebSocket stubbed for Phase 2)
- Playlist bar with export dropdown
- Admin dashboard for ingesting playlists
- All components wired to live Convex data
