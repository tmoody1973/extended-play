# Extended Play

> Explore 20 years of music connections through conversation, powered by Gemini and Google Cloud.

Extended Play is a multimodal AI music discovery platform built on [Rhythm Lab Radio](https://rhythmlab.fm)'s 20-year playlist archive. Navigate artist connections through a force-directed knowledge graph, voice-driven conversation, and an AI-curated story stream — all wrapped in a Tokyo record bar aesthetic.

Built for the [Google Cloud Gemini Live Agent Challenge](https://googlecloudgenaiagents.devpost.com/) hackathon.

![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Influence Map** — D3 force-directed graph visualizing artist connections across genres, labels, and sonic similarity
- **Voice Conversation** — Gemini Live API powers real-time bidirectional audio with barge-in support
- **Story Stream** — AI-narrated feed of artist cards, album art, and music journalism as you explore
- **Episode Sidebar** — Browse 20 years of Rhythm Lab Radio episodes and tracklists
- **Playlist Builder** — Curate tracks as you explore, export to Spotify, Apple Music, YouTube Music, or .m3u
- **Enrichment Pipeline** — Automatic metadata from MusicBrainz, Discogs, Fanart.tv, Cover Art Archive, and ReccoBeats
- **Multi-Source Connection Pipeline** — Builds influence edges from 5 sources: MusicBrainz relationships, Discogs member/group data, Wikipedia associated acts, Gemini Grounding corpus seeding, and Exa/Tavily review search with NER co-mention extraction (Stell-R methodology)
- **Admin Dashboard** — Paste-to-ingest playlist parser with enrichment status monitoring
- **Reactive Data** — All UI updates in real-time via Convex subscriptions, zero polling

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, React Compiler) |
| Backend/DB | Convex (reactive queries, mutations, actions, crons) |
| UI Components | shadcn/ui + Radix UI |
| Styling | Tailwind CSS v4 |
| Graph | D3.js v7 (force simulation) |
| Voice | Gemini Live API (bidirectional audio) |
| Fonts | Playfair Display, Inter, JetBrains Mono |
| Language | TypeScript 5 |

## Quick Start

### Prerequisites

- Node.js 20+
- A [Convex](https://convex.dev) account (free tier works)

### Installation

```bash
git clone https://github.com/tmoody1973/extended-play.git
cd extended-play
npm install
```

### Set up Convex

```bash
npx convex dev
```

This will prompt you to log in and create a project. It generates `.env.local` with your deployment URL and starts the Convex dev server.

### Run the app

In a separate terminal:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Seed data (optional)

Navigate to [http://localhost:3000/admin](http://localhost:3000/admin) to paste episode tracklists and trigger the enrichment pipeline.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CONVEX_DEPLOYMENT` | Convex deployment identifier (auto-generated) | Yes |
| `NEXT_PUBLIC_CONVEX_URL` | Convex cloud URL for client (auto-generated) | Yes |
| `DISCOGS_KEY` / `DISCOGS_SECRET` | Discogs API credentials | For enrichment |
| `FANART_TV_API_KEY` | Fanart.tv API key | For enrichment |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key | For enrichment |
| `RECCOBEATS_API_KEY` | ReccoBeats API key (sonic features) | For enrichment |
| `EXA_API_KEY` | Exa AI API key (semantic review search) | For corpus seeding |
| `TAVILY_API_KEY` | Tavily API key (fallback review search) | For corpus seeding |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID for Vertex AI | For Gemini grounding |

Convex vars are auto-created by `npx convex dev`. Set enrichment API keys in the Convex dashboard under Environment Variables.

## Project Structure

```
extended-play/
├── convex/                    # Backend (runs on Convex)
│   ├── schema.ts              # 12-table data model
│   ├── queries.ts             # Graph, artist, episode queries
│   ├── enrichment.ts          # Enrichment pipeline + NER + connection utilities
│   ├── ingest.ts              # Episode + tracklist ingestion
│   ├── admin.ts               # Admin dashboard functions
│   ├── playlists.ts           # Playlist CRUD + export
│   ├── reviewSearch.ts        # Music journalism search (Exa/Tavily) + corpus seeding
│   ├── geminiGrounding.ts     # Gemini Grounding metadata + corpus seeding
│   └── crons.ts               # Scheduled enrichment processing
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout, fonts, metadata
│   │   ├── page.tsx           # Main app (wires all components)
│   │   ├── globals.css        # Tailwind v4 theme + custom tokens
│   │   └── admin/             # Admin dashboard route
│   ├── components/
│   │   ├── graph/             # D3 influence map + force hook
│   │   ├── stream/            # Story stream + content cards
│   │   ├── voice/             # Voice bar (mic + transcript)
│   │   ├── layout/            # App shell, main layout, sidebar
│   │   ├── playlist/          # Playlist bar + export dropdown
│   │   └── ui/                # shadcn/ui primitives
│   └── lib/
│       ├── theme.ts           # Design tokens for D3/charts
│       └── utils.ts           # Utility functions
└── docs/plans/                # Design docs + implementation plan
```

## Data Model

The Convex schema models the full music knowledge graph:

- **episodes** — Rhythm Lab Radio shows with air dates and metadata
- **artists** — Graph nodes with MusicBrainz/Discogs IDs, images, sonic profiles, community assignments
- **tracks** — Songs linked to episodes and artists, with album art and audio features
- **artistConnections** — Weighted graph edges (playlist adjacency, review co-mentions, collaborations, samples, shared labels)
- **reviews** — Music journalism corpus from 26 publications with NER-extracted artist mentions
- **communities** — Leiden-detected genre clusters with aggregate sonic profiles
- **playlists** — User-curated collections with export tracking
- **conversations** / **messages** — Voice/text chat history with rich attachments
- **enrichmentJobs** — Pipeline task queue with priority, retry, and status tracking (16 job types: MB lookup/rels, Discogs, Genius, Fanart.tv, Wikimedia, Cover Art Archive, ReccoBeats, AcousticBrainz, YouTube, NER extraction, sonic profile, graph metrics, Gemini grounding/corpus, Wikipedia, review corpus)
- **graphSnapshots** — Serialized graph state for frontend rendering

## Enrichment Pipeline

After playlist ingestion, artists flow through a multi-layer enrichment pipeline powered by the Convex cron scheduler:

**Layer 0** — Ingest: episode + tracklist → artist stubs + playlist-adjacent edges
**Layer 1** — Identify: MusicBrainz lookup → MBID, country, genres
**Layer 1b** — MusicBrainz relationships → collaboration, shared_member edges
**Layer 2** — Metadata: Discogs (images, bio, members/groups/aliases), Fanart.tv, YouTube, Genius
**Layer 2b** — Corpus seeding: Wikipedia bio/influences, Exa/Tavily review search, Gemini Grounding (interviews/features)
**Layer 3** — Sonic: ReccoBeats/AcousticBrainz audio features → artist sonic profiles
**NER** — Co-mention extraction from review corpus → `review_comention` edges (Stell-R methodology)

Connection types and base weights:

| Type | Weight | Source |
|------|--------|--------|
| `collaboration` | 0.7 | MusicBrainz rels, Wikipedia |
| `shared_member` | 0.5 | MusicBrainz, Discogs members/groups |
| `review_comention` | 0.3–0.5 | NER from reviews (0.5 for influence-context) |
| `same_label` | 0.2 | Discogs |
| `playlist_adjacent` | 1.0 | Rhythm Lab Radio playlists |

## Design System

The "Tokyo Record Bar" theme evokes warm wood, amber lighting, and vinyl textures:

| Token | Color | Usage |
|-------|-------|-------|
| `walnut` | `#1a1612` | Page background |
| `wood` | `#2a2420` | Header/footer surfaces |
| `shelf` | `#352f29` | Cards, elevated surfaces |
| `amber` | `#d4a054` | Primary accent, links |
| `vinyl-blue` | `#7ca5b8` | Secondary accent |
| `cream` | `#e8ddd0` | Primary text |
| `edge` | `#4a4038` | Borders, dividers |

Custom CSS utilities: `.bg-wood-grain` (SVG texture), `.shadow-vinyl` (warm card shadow), `.ring-tube-glow` (amber node glow).

## Layout

```
┌─────────────────────────────────────────────┐
│  Voice Bar                                  │
├──────┬──────────────────┬───────────────────┤
│ Ep.  │  Influence Map   │  Story Stream     │
│ Side │  (D3 Force)      │  + Cards          │
│ bar  │                  │                   │
├──────┴──────────────────┴───────────────────┤
│  Playlist Bar                               │
└─────────────────────────────────────────────┘
```

Responsive: 3 columns on desktop, 2 on tablet, 1 on mobile.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npx convex dev` | Start Convex dev server (run alongside) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npx tsx scripts/test-ner.ts` | Run NER extraction unit tests |

## License

MIT
