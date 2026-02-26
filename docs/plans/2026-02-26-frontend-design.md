# Crate Dig — Frontend + Convex Design

**Date**: 2026-02-26
**Scope**: Next.js frontend with Convex data layer, Tokyo record bar design system

---

## Stack

- Next.js 15 (App Router)
- Convex (reactive database)
- shadcn/ui + Tailwind CSS (custom Tokyo record bar theme)
- D3.js (force-directed influence map)
- Recharts (sonic radar charts)
- Web Audio API + Essentia.js (waveform viz, later)

## Project Structure

```
crate-dig/
├── convex/
│   ├── schema.ts
│   ├── ingest.ts
│   ├── enrichment.ts
│   ├── queries.ts
│   ├── playlists.ts
│   ├── admin.ts
│   ├── reviewSearch.ts
│   ├── crons.ts
│   └── _generated/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── admin/
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/            # shadcn/ui base (customized)
│   │   ├── graph/         # D3 influence map
│   │   ├── stream/        # Story stream panel
│   │   ├── voice/         # Voice bar
│   │   ├── playlist/      # Playlist builder bar
│   │   └── layout/        # Shell, sidebar, responsive wrappers
│   └── lib/
│       ├── theme.ts
│       ├── utils.ts
│       └── convex.ts
├── public/
│   ├── fonts/
│   └── textures/
├── components.json
├── tailwind.config.ts
├── next.config.ts
├── convex.json
├── package.json
└── tsconfig.json
```

## Design System: Tokyo Record Bar

### Colors (Tailwind theme)

| Token       | Hex       | Usage                          |
|-------------|-----------|--------------------------------|
| walnut      | #1a1612   | Background                     |
| wood        | #2a2420   | Surface                        |
| shelf       | #352f29   | Elevated surface / cards       |
| amber       | #d4a054   | Primary accent                 |
| vinyl-blue  | #7ca5b8   | Secondary accent               |
| cream       | #e8ddd0   | Primary text                   |
| sleeve      | #9a8e82   | Secondary text                 |
| shadow      | #6b6058   | Muted text                     |
| led-green   | #7ab87c   | Success                        |
| skip-red    | #c45c5c   | Error / destructive            |
| edge        | #4a4038   | Graph edges, borders           |

### shadcn/ui CSS Variable Mapping

- `--background` → walnut
- `--card` → shelf
- `--primary` → amber
- `--secondary` → vinyl-blue
- `--foreground` → cream
- `--muted-foreground` → sleeve
- `--destructive` → skip-red
- `--border` → edge
- `--ring` → amber

### Typography

- `.font-editorial` → Playfair Display (headings, episode titles)
- `.font-body` → Inter (default body)
- `.font-data` → JetBrains Mono (metadata, timestamps, stats)

### Custom Utilities

- `.bg-wood-grain` → subtle SVG texture overlay
- `.shadow-vinyl` → warm shadow for album art cards
- `.ring-tube-glow` → amber ring with soft glow for graph nodes
- `.animate-vu-pulse` → VU meter bounce for voice indicator

## Layout Architecture

### Desktop (>1024px)

```
┌──────────────────────────────────────────────────┐
│  Voice Bar (full width, sticky top)               │
├────────┬──────────────────┬───────────────────────┤
│ Episode│  Influence Map   │  Story Stream          │
│ Sidebar│  (D3 Force)      │  + Visualizations      │
│ ~250px │  flex-1           │  ~400px                │
├────────┴──────────────────┴───────────────────────┤
│  Playlist Builder Bar (sticky bottom)             │
└──────────────────────────────────────────────────┘
```

### Tablet (768-1024px)

- Voice bar full width (sticky top)
- Two columns: Influence Map + Story Stream
- Episode sidebar → dropdown/sheet
- Playlist bar at bottom

### Phone (<768px)

- Voice bar sticky top (compact, push-to-talk)
- Single column: Story Stream
- Influence map → expandable mini-map
- Sticky bottom: Now Playing + playlist count
- Episode list in hamburger menu

### Component Hierarchy

```
<AppShell>
  <VoiceBar />
  <MainLayout>
    <EpisodeSidebar />
    <InfluenceMap />
    <StoryStream />
  </MainLayout>
  <PlaylistBar />
</AppShell>
```

## Key Components

### Voice Bar
- Mic toggle with `animate-vu-pulse` when recording
- Transcription display (user + agent)
- Episode selector dropdown
- WebSocket to Gemini Live (stubbed initially)

### Influence Map
- D3 force-directed graph in SVG/canvas
- Nodes: circular artist photos with amber ring, initials fallback
- Edges: subtle color, amber glow on narration
- Click node → artist card in Story Stream
- Pinch/scroll zoom
- Data: `useQuery(api.queries.getActiveGraph)`

### Story Stream
- Scrollable feed of rich content cards on shelf background:
  - Narration card (agent markdown text)
  - Album art card (shadow-vinyl, slide-up animation)
  - Artist card (photo, bio, genres, connections)
  - Sonic radar chart (Recharts, amber lines)
  - YouTube embed card
  - Review excerpt card

### Episode Sidebar
- Wood-grain textured panel
- Track list with position numbers + album art thumbnails
- Click track → highlights artist on graph
- Enrichment status indicators

### Playlist Bar
- Sticky bottom, amber accent strip
- Horizontal album art thumbnails (drag to reorder)
- Track count + title
- Export dropdown: Spotify, Apple Music, YouTube Music, .m3u

### Admin Dashboard (/admin)
- Paste-to-ingest textarea with format auto-detection
- Parse preview before committing
- Enrichment stats (artist/track/job counts)
- Failed job retry controls

## Data Flow

All data through Convex reactive queries. No REST polling.

```
Graph:     useQuery(api.queries.getActiveGraph) → D3 render
Artist:    useQuery(api.queries.getArtistCard) → Story Stream
Episodes:  useQuery(api.queries.listEpisodes) → sidebar
Subgraph:  useQuery(api.queries.getArtistSubgraph) → focused view
Search:    useQuery(api.queries.searchArtists) → search results
Playlists: useMutation(api.playlists.create/addTrack/removeTrack)
Admin:     useMutation(api.admin.parseAndIngestPlaylist)
Stats:     useQuery(api.queries.getEnrichmentStats)
```

Real-time enrichment updates arrive automatically through Convex subscriptions. As the cron processes enrichment jobs, artist photos, album art, and metadata populate across the UI without polling.
