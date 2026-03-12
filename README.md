# Extended Play

> 20 years of music connections, explored through conversation.

**Extended Play** is a multimodal AI music discovery platform built on [Rhythm Lab Radio](https://rhythmlab.fm)'s 20-year playlist archive. A voice-AI curator guides you through a force-directed knowledge graph of 4,000+ artists, grounding every connection in real music journalism — not algorithmic guessing.

Built by **Tarik Moody** (host of Rhythm Lab Radio, Milwaukee WI) for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) hackathon ($80K prize pool, deadline March 16, 2026).

**Categories:** Live Agents + Creative Storyteller

![License](https://img.shields.io/badge/license-MIT-blue)

**Live:** [extended-play-278027424812.us-central1.run.app](https://extended-play-278027424812.us-central1.run.app)

---

## Why Extended Play

Most music discovery tools are passive — you scroll, tap, and consume what an algorithm serves. Extended Play flips that: you **talk** to a curator who has opinions, cites sources, generates illustrations, previews music, and builds playlists while the knowledge graph evolves in real time.

| Typical Hackathon Entry | Extended Play |
|------------------------|---------------|
| Chatbot that generates one image per prompt | Curator weaving voice + images + graph + evidence in continuous narrative |
| Static image generation | Consistent visual style across a whole conversation |
| Hallucinated claims | Every connection grounded in NER-extracted evidence from 26 publications |
| Text-to-image wrapper | Five modalities in one flow: voice, generated images, graph, sourced text, playable music |

---

## Demo

> *"Tell me about the connection between Fela Kuti and Sons of Kemet"*

The curator responds in conversational voice, zooms the graph to highlight the path from Lagos to London, surfaces a Pitchfork review documenting the link, generates a vintage-style illustration of the influence trail, and queues key tracks into your playlist — all in one fluid exchange.

### Who It's For

- **Curious listeners** — "I like Khruangbin but I don't know what to listen to next"
- **Music journalists** — "Show me how West African music shaped the London jazz revival"
- **Radio hosts** — "Find me artists who bridge two different worlds for next week's show"
- **Discovery seekers** — "Surprise me — take me somewhere I've never been musically"

---

## Features

- **Influence Map** — D3 force-directed graph visualizing 4,000+ artist connections across genres, labels, and sonic similarity, with community clustering and progressive reveal
- **Voice Conversation** — Gemini Live API powers real-time bidirectional audio with barge-in support
- **Story Stream** — AI-narrated feed of artist cards, album art, generated illustrations, and music journalism citations
- **Episode Browser** — Browse 20 years of Rhythm Lab Radio episodes and tracklists with on-demand audio preview
- **Playlist Builder** — Curate tracks through conversation, export to Spotify, Apple Music, YouTube Music, or .m3u
- **Enrichment Pipeline** — Automatic metadata from MusicBrainz, Discogs, Fanart.tv, Cover Art Archive, Spotify, and ReccoBeats
- **Multi-Source Connection Pipeline** — Influence edges from 6 sources: playlist co-play, MusicBrainz relationships, Discogs member/group data, Wikipedia associated acts, Gemini Grounding, and Exa/Tavily review search with NER co-mention extraction (Stell-R methodology)
- **Admin Dashboard** — Paste-to-ingest playlist parser, enrichment status monitoring, artist edit/override with MusicBrainz re-identification
- **Reactive Data** — All UI updates in real-time via Convex subscriptions, zero polling

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Next.js Frontend                          │
│                                                              │
│  ┌──────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │ Episode   │  │  Influence Map  │  │   Story Stream     │  │
│  │ Browser   │  │  (D3 Force)     │  │   + Agent Cards    │  │
│  └──────────┘  └────────┬────────┘  └──────────┬─────────┘  │
│                         │                       │            │
│  ┌──────────────────────┴───────────────────────┘            │
│  │  Voice Bar (mic + transcript + connection status)         │
│  └──────────────────────────────────────────────────────┐    │
│  │  Playlist Bar (crate + mini-player + export)          │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────┬───────────────────────────────┬───────────────┘
               │ WebSocket                     │ Convex Subscriptions
               ▼                               ▼
┌──────────────────────┐          ┌──────────────────────────┐
│  Cloud Run Agent     │          │  Convex Backend          │
│                      │          │                          │
│  Gemini Live API     │  HTTP    │  12-table data model     │
│  (bidi voice)        │◄────────►│  Enrichment pipeline     │
│                      │          │  Graph snapshots         │
│  Google ADK Tools:   │          │  Cron scheduler          │
│  - graph.py          │          │  Reactive queries        │
│  - episodes.py       │          │                          │
│  - playlists.py      │          │  External APIs:          │
│  - reviews.py        │          │  MusicBrainz, Discogs,   │
│  - corpus.py         │          │  Fanart.tv, Spotify,     │
│  - images.py         │          │  Exa AI, Tavily, YouTube │
└──────────────────────┘          └──────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router, React Compiler) |
| Backend / DB | Convex (reactive queries, mutations, actions, crons) |
| Agent | Google Cloud Run + Gemini Live API (bidirectional audio) |
| Agent SDK | Google ADK (Runner + LiveRequestQueue pattern) |
| AI Models | Gemini Live 2.5 Flash Native Audio (voice), Gemini 3.1 Flash Image Preview (visuals) |
| Graph | D3.js v7 (force simulation, Canvas rendering) |
| UI Components | shadcn/ui + Radix UI |
| Styling | Tailwind CSS v4 |
| Charts | Recharts (sonic radar) |
| Fonts | Playfair Display, Inter, JetBrains Mono |
| Language | TypeScript 5 (frontend), Python 3.12 (agent) |

---

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.12+
- A [Convex](https://convex.dev) account (free tier works)
- A Google Cloud project with Vertex AI enabled

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

This prompts you to log in, creates a project, generates `.env.local` with your deployment URL, and starts the Convex dev server.

### Set up the Agent

```bash
cd agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Google Cloud project ID and Convex URL
```

### Run the app

In separate terminals:

```bash
# Terminal 1: Convex backend
npx convex dev

# Terminal 2: Next.js frontend
npm run dev

# Terminal 3: Agent server
cd agent && uvicorn main:app --reload --port 8000
```

Open [http://localhost:3000](http://localhost:3000).

### Seed data

Navigate to [http://localhost:3000/admin](http://localhost:3000/admin) to paste episode tracklists and trigger the enrichment pipeline.

---

## Environment Variables

### Convex (set in Convex dashboard → Environment Variables)

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCOGS_KEY` / `DISCOGS_SECRET` | Discogs API credentials | For enrichment |
| `FANART_TV_API_KEY` | Fanart.tv API key | For artist images |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key | For track preview (fallback) |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify API credentials | For track matching |
| `RECCOBEATS_API_KEY` | ReccoBeats API key | For sonic features |
| `EXA_API_KEY` | Exa AI API key | For review corpus seeding |
| `TAVILY_API_KEY` | Tavily API key | For review corpus seeding (fallback) |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | For Gemini Grounding |

### Agent (`.env` in `agent/`)

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | Yes |
| `GOOGLE_CLOUD_LOCATION` | GCP region (default: `us-central1`) | Yes |
| `GOOGLE_GENAI_USE_VERTEXAI` | Use Vertex AI (set `True`) | Yes |
| `CONVEX_URL` | Convex deployment URL | Yes |

### Frontend (auto-generated by `npx convex dev`)

| Variable | Description | Required |
|----------|-------------|----------|
| `CONVEX_DEPLOYMENT` | Convex deployment identifier | Yes |
| `NEXT_PUBLIC_CONVEX_URL` | Convex cloud URL for client | Yes |
| `NEXT_PUBLIC_AGENT_WS_URL` | Agent WebSocket URL | For voice |

---

## Project Structure

```
extended-play/
├── agent/                         # Voice agent (Python, Cloud Run)
│   ├── main.py                    # FastAPI server + WebSocket endpoint
│   ├── extended_play/
│   │   ├── agent.py               # ADK Agent definition (11 tools, Gemini Live model)
│   │   ├── convex_client.py       # Convex HTTP client
│   │   ├── prompts.py             # System prompts + persona
│   │   └── tools/                 # ADK tool definitions
│   │       ├── graph.py           # search_artists, get_connections, navigate_graph
│   │       ├── episodes.py        # search_episodes, get_tracklist
│   │       ├── playlists.py       # create_playlist, add_track, export
│   │       ├── reviews.py         # search_reviews, get_evidence
│   │       ├── corpus.py          # seed_corpus, search_journalism
│   │       └── images.py          # generate_visual, generate_playlist_cover
│   ├── Dockerfile                 # Cloud Run container
│   └── requirements.txt           # google-adk, google-genai, fastapi, uvicorn
├── convex/                        # Backend (runs on Convex)
│   ├── schema.ts                  # 12-table data model
│   ├── queries.ts                 # Graph, artist, episode, enrichment queries
│   ├── enrichment.ts              # 5-layer enrichment pipeline + NER + connections
│   ├── ingest.ts                  # Episode + tracklist ingestion
│   ├── admin.ts                   # Admin dashboard, graph snapshot, artist edit/re-identify
│   ├── playlists.ts               # Playlist CRUD + export
│   ├── reviewSearch.ts            # Exa AI + Tavily review search + corpus seeding
│   ├── geminiGrounding.ts         # Vertex AI Grounding + corpus seeding
│   └── crons.ts                   # Scheduled enrichment processing
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout, fonts, metadata
│   │   ├── page.tsx               # Main app (graph + stream + voice wiring)
│   │   ├── globals.css            # Tailwind v4 theme + design tokens
│   │   └── admin/                 # Admin dashboard route
│   ├── components/
│   │   ├── graph/                 # D3 influence map, force hook, welcome overlay
│   │   ├── stream/                # Story stream + content cards
│   │   ├── voice/                 # Voice bar (mic + transcript)
│   │   ├── sidebar/               # Episode browser
│   │   ├── layout/                # App shell, main layout
│   │   ├── playlist/              # Playlist bar + export dropdown
│   │   └── ui/                    # shadcn/ui primitives
│   └── lib/
│       ├── theme.ts               # Design tokens for D3/charts
│       └── utils.ts               # Utility functions
├── scripts/                       # Dev tools
│   ├── ingest-archive.js          # Bulk playlist ingestion
│   ├── enrichment-monitor.sh      # Enrichment queue monitor
│   └── test-ner.ts                # NER extraction tests
├── deploy.sh                      # Cloud Run deployment (agent + frontend)
└── background-docs/               # Design docs + strategy
```

---

## Data Model

The Convex schema models the full music knowledge graph:

- **episodes** — Rhythm Lab Radio shows with air dates and metadata
- **artists** — Graph nodes with MusicBrainz/Discogs IDs, images, sonic profiles, community assignments
- **tracks** — Songs linked to episodes and artists, with Spotify matching, YouTube IDs, album art, and audio features
- **artistConnections** — Weighted graph edges with evidence arrays (playlist adjacency, review co-mentions, collaborations, samples, shared labels)
- **reviews** — Music journalism corpus from 26 publications with NER-extracted artist mentions
- **communities** — Leiden-detected genre clusters with aggregate sonic profiles
- **playlists** — User-curated collections with export tracking
- **conversations** / **messages** — Voice/text chat history with rich attachments
- **enrichmentJobs** — Pipeline task queue with priority, retry, and status tracking (16 job types)
- **graphSnapshots** — Serialized graph state for frontend rendering (chunked for large graphs)

---

## Enrichment Pipeline

After playlist ingestion, artists flow through a multi-layer enrichment pipeline powered by the Convex cron scheduler:

| Layer | Name | What It Does |
|-------|------|-------------|
| 0 | Ingest | Episode + tracklist → artist stubs + playlist-adjacent edges |
| 1 | Identify | MusicBrainz lookup → MBID, country, genres |
| 1b | Relationships | MusicBrainz rels → collaboration, shared_member edges |
| 2 | Metadata | Discogs (images, bio, members), Fanart.tv, YouTube, Spotify, Genius |
| 2b | Corpus | Wikipedia bio, Exa/Tavily review search, Gemini Grounding (interviews) |
| 3 | Sonic | ReccoBeats audio features → artist sonic profiles |
| NER | Co-mentions | NER extraction from review corpus → `review_comention` edges |

### Connection Sources

| Type | Weight | Source |
|------|--------|--------|
| `playlist_adjacent` | 1.0 | Rhythm Lab Radio playlists |
| `collaboration` | 0.7 | MusicBrainz rels, Wikipedia |
| `shared_member` | 0.5 | MusicBrainz, Discogs members/groups |
| `review_comention` | 0.3–0.5 | NER from reviews (0.5 for influence-context) |
| `same_label` | 0.2 | Discogs |

---

## Design System

The "Tokyo Record Bar" theme evokes warm wood, amber lighting, and vinyl textures:

| Token | Color | Usage |
|-------|-------|-------|
| `walnut` | `#1a1612` | Page background |
| `wood` | `#2a2420` | Header/footer surfaces |
| `shelf` | `#352f29` | Cards, elevated surfaces |
| `amber` / `gold` | `#d4a054` | Primary accent, links, active states |
| `vinyl-blue` | `#7ca5b8` | Secondary accent |
| `cream` | `#e8ddd0` | Primary text |
| `edge` | `#4a4038` | Borders, dividers |

**Typography:** Playfair Display (editorial headings), Inter (body), JetBrains Mono (data/stats)

**Custom CSS:** `.bg-wood-grain` (SVG texture), `.shadow-vinyl` (warm card shadow), `.ring-tube-glow` (amber node glow)

---

## Layout

```
┌──────────────────────────────────────────────────────┐
│  Voice Bar (mic, transcript, status)                 │
├──────────┬───────────────────┬───────────────────────┤
│ Episode  │   Influence Map   │   Story Stream        │
│ Browser  │   (D3 Force)      │   + Agent Cards       │
│          │                   │   + Generated Images   │
│ Years →  │   ⬤───⬤          │   + Review Evidence   │
│ Months → │  ⬤──⬤──⬤        │   + Track Previews    │
│ Tracks → │   ⬤───⬤          │                       │
├──────────┴───────────────────┴───────────────────────┤
│  Playlist Bar (crate + mini-player + export)         │
└──────────────────────────────────────────────────────┘
```

Responsive: 3 columns on desktop, 2 on tablet, 1 on mobile (story stream only).

Fresh visitors see the **welcome state**: ~8 bridge artists floating gently with a welcome overlay. The graph reveals progressively as you explore through conversation.

---

## Deployment (Google Cloud Run)

```bash
# Set required env vars
export GOOGLE_CLOUD_PROJECT=your-project-id
export CONVEX_URL=https://your-deployment.convex.cloud

# Deploy agent + frontend
./deploy.sh
```

This deploys two Cloud Run services:
- `extended-play-agent` — Python/FastAPI WebSocket server for Gemini Live (`wss://extended-play-agent-278027424812.us-central1.run.app/ws`)
- `extended-play` — Next.js frontend (`https://extended-play-278027424812.us-central1.run.app`)

---

## Hackathon Context

### [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/)

**Prize pool:** $80,000 | **Deadline:** March 16, 2026 @ 5:00pm PDT

### Categories We're Competing In

**Live Agents** — Real-time bidirectional voice conversation via Gemini Live API. The agent uses ADK tools to drive a reactive visual interface: navigating the graph, surfacing artist cards, building playlists, and seeding the review corpus — all through natural conversation with barge-in support.

**Creative Storyteller** — Multimodal storytelling with interleaved output. The curator doesn't just talk about music — it **shows** the story through generated illustrations (Gemini 3.1 Flash Image Preview), animated graph paths, sourced review citations, sonic radar visualizations, and inline audio previews, all woven into a single conversational stream.

### Judging Criteria

| Criteria | Weight | Our Approach |
|----------|--------|-------------|
| Innovation & Multimodal UX | 40% | 5 modalities (voice, images, graph, text, audio) in one conversation |
| Technical Implementation | 30% | Gemini Live + Gemini Image Gen + Vertex AI Grounding + Convex + 6-source enrichment |
| Demo & Presentation | 30% | The demo IS the experience — voice conversation with live visual storytelling |

### Submission Requirements

- [x] Public code repository with setup instructions
- [x] Google Cloud deployment (Cloud Run)
- [x] Architecture diagram
- [ ] Demo video (under 4 minutes)
- [x] Text description of features and technologies

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npx convex dev` | Start Convex dev server (run alongside) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `./deploy.sh` | Deploy agent + frontend to Cloud Run |
| `node scripts/ingest-archive.js` | Bulk ingest playlist archive |
| `bash scripts/enrichment-monitor.sh` | Monitor enrichment queue progress |

---

## License

MIT
