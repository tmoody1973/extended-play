# Extended Play Agent Architecture Design

## Goal

Build a voice-driven AI agent that guides users through 20 years of music connections, using Google ADK + Gemini Live API, deployed on Google Cloud Run. Targets both the Live Agents and Creative Storyteller hackathon tracks.

## Architecture

Two Cloud Run services + Convex Cloud:

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  ┌─────────────────┐     ┌────────────────────────────┐ │
│  │ Next.js Frontend│     │ WebSocket (audio + events) │ │
│  │ (React UI)      │     │ to Agent Service           │ │
│  └────────┬────────┘     └─────────────┬──────────────┘ │
└───────────┼────────────────────────────┼────────────────┘
            │ HTTPS                      │ WSS
┌───────────▼────────────┐  ┌───────────▼──────────────┐
│  Cloud Run: Frontend   │  │  Cloud Run: Agent        │
│  Next.js 16 (Docker)   │  │  Python ADK + FastAPI    │
│  Serves UI, static     │  │  Gemini Live API (bidi)  │
│  assets                │  │  Tools → Convex HTTP API │
│                        │  │  Image gen → Gemini      │
└───────────┬────────────┘  └───────────┬──────────────┘
            │                           │
            │ HTTPS (queries)           │ HTTPS (tools)
            └───────────┬───────────────┘
                        ▼
              ┌─────────────────┐
              │  Convex Cloud   │
              │  12-table DB    │
              │  Reactive subs  │
              └─────────────────┘
```

### Data Flow

1. User speaks → browser captures PCM audio → sends via WebSocket to Agent
2. Agent streams audio to Gemini Live API → gets transcript + intent
3. Agent calls tools (Convex queries, review search) based on conversation
4. Agent responds with voice audio + structured events (show artist card, highlight graph node, generate image)
5. Frontend receives events via WebSocket → updates story stream, graph, playlist in real-time
6. Frontend also subscribes to Convex directly for reactive data (episode list, enrichment status)

## Agent Structure

Python ADK project with a single `LlmAgent` and ~10 tools.

```
agent/
├── extended_play/
│   ├── __init__.py          # from . import agent
│   ├── agent.py             # root_agent definition + system prompt
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── graph.py         # explore_artist, get_connections, search_artists, get_bridge_artists
│   │   ├── episodes.py      # list_episodes, get_episode
│   │   ├── reviews.py       # search_reviews
│   │   ├── playlists.py     # create_playlist, add_track, export_playlist
│   │   └── images.py        # generate_scene_image (Gemini native image gen)
│   ├── convex_client.py     # HTTP client wrapper for Convex API
│   └── prompts.py           # System instruction + persona text
├── main.py                  # FastAPI app with WebSocket endpoint
├── Dockerfile
├── requirements.txt
└── .env
```

### Tools

Each tool is a plain Python function with type hints and docstring. ADK auto-generates the schema for Gemini. Tools call Convex via HTTP POST to the deployment URL.

| Tool | Convex Function | Purpose |
|------|----------------|---------|
| `explore_artist(artist_name)` | `queries.getArtistCard` + `queries.searchArtists` | Full artist card with bio, genres, connections, images |
| `get_connections(artist_name, depth=2)` | `queries.getArtistSubgraph` | Subgraph neighborhood around an artist |
| `search_artists(query)` | `queries.searchArtists` | Find artists by name |
| `get_bridge_artists(limit=5)` | `queries.getBridgeArtists` | Featured high-centrality artists |
| `list_episodes(limit=10)` | `queries.listEpisodes` | Browse Rhythm Lab Radio episodes |
| `get_episode(episode_id)` | `queries.getEpisodeWithTracks` | Full episode with tracklist |
| `search_reviews(topic, artist_names)` | `reviewSearch.searchReviews` | Music journalism search via Exa AI |
| `create_playlist(title, description)` | `playlists.create` | Start building a crate |
| `add_to_playlist(playlist_id, track_id)` | `playlists.addTrack` | Add track to active playlist |
| `generate_scene_image(prompt)` | Gemini native image gen | Create evocative visual for story stream |

### Convex HTTP Client

Tools call Convex functions via HTTP:

```python
# POST https://<deployment>.convex.cloud/api/query
# Body: {"path": "queries:getArtistCard", "args": {"artistId": "..."}}

# POST https://<deployment>.convex.cloud/api/mutation
# Body: {"path": "playlists:addTrack", "args": {"playlistId": "...", "trackId": "..."}}

# POST https://<deployment>.convex.cloud/api/action
# Body: {"path": "reviewSearch:searchReviews", "args": {"query": "...", "artistNames": [...]}}
```

## Voice + Event Protocol

The WebSocket carries audio and structured events.

### Browser → Agent (upstream)

- Audio: 16-bit PCM, 16kHz mono, base64-encoded, ~100ms chunks
- Control: `{"type": "start_session", "episodeId": "..."}`, `{"type": "stop"}`

### Agent → Browser (downstream)

- Audio: Gemini voice response, PCM streamed for playback
- Events that drive the UI:

```json
{"type": "transcript", "role": "user", "text": "Tell me about Fela Kuti"}
{"type": "transcript", "role": "agent", "text": "Ah, let me pull his file..."}
{"type": "show_artist", "artistId": "abc123", "data": {...}}
{"type": "highlight_node", "artistId": "abc123"}
{"type": "show_album_art", "trackId": "def456", "imageUrl": "..."}
{"type": "show_narration", "text": "Fela's polyrhythmic approach...", "style": "intro"}
{"type": "show_image", "url": "...", "caption": "A smoky Lagos club, 1972"}
{"type": "add_to_playlist", "trackId": "def456", "playlistId": "ghi789"}
{"type": "navigate_graph", "centerId": "abc123", "depth": 2}
{"type": "interrupted"}
```

### Example Flow

User: "What connects Fela Kuti to Kokoroko?"

1. Agent transcribes → calls `get_connections("Fela Kuti", depth=2)`
2. Gets path: Fela → Tony Allen → Ezra Collective → Kokoroko
3. Narrates in voice while sending events:
   - `highlight_node` for each artist along the path
   - `show_artist` cards for Fela and Kokoroko
   - `show_narration` text summarizing the connection
   - `generate_scene_image` → "Afrobeat evolution from Lagos to London jazz scene"
4. Frontend renders each event into the story stream in real-time

### Barge-in

When user interrupts mid-response, Gemini Live API detects via VAD. Agent sends `{"type": "interrupted"}`, frontend stops audio playback, agent processes new input.

## Agent Persona

**"The Curator"** — record bar owner, soul of Extended Play.

- Warm, knowledgeable, slightly opinionated about music
- Speaks like someone who's spent decades collecting records
- Uses the knowledge graph as their mental map
- Pulls things "off the shelf" — artist cards, reviews, album art
- Builds playlists like curating a listening session
- References the Rhythm Lab Radio archive as shared history

### System Instruction (core)

> You are the curator of Extended Play, a Tokyo record bar built on 20 years of Rhythm Lab Radio playlists. You guide visitors through music connections — how artists influence each other across genres, decades, and continents.
>
> When someone asks about an artist, explore their connections. Don't just list facts — tell the story. Use your tools to pull up artist cards, search journalism, and navigate the graph. Build playlists naturally as the conversation flows.
>
> You speak warmly but concisely. You have opinions. When you find a surprising connection, show excitement. When an artist is underappreciated, advocate for them. Always ground your claims in the data — cite reviews, show the graph path, reference episodes.
>
> For every response, think about what to SHOW alongside what you SAY. Highlight nodes on the graph. Surface album art. Pull review excerpts. Generate an evocative image when the moment calls for it. The story stream is your canvas.

### Conversation Starters

- "Pick an episode from the archive and I'll walk you through it"
- "Name an artist and I'll show you who they're connected to"
- "Want me to build you a crate? Tell me a mood or a starting point"

## Deployment

### Cloud Run Services

| Service | Image | Port | Env Vars |
|---------|-------|------|----------|
| `extended-play-web` | Next.js Dockerfile | 3000 | `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_AGENT_WS_URL` |
| `extended-play-agent` | Python ADK Dockerfile | 8000 | `GOOGLE_CLOUD_PROJECT`, `CONVEX_URL`, `GOOGLE_GENAI_USE_VERTEXAI=True` |

### Frontend Changes

- `voice-bar.tsx` — WebSocket connection to agent, audio capture/playback
- `story-stream.tsx` — render agent events dynamically
- `influence-map.tsx` — handle `highlight_node` and `navigate_graph` events
- `playlist-bar.tsx` — handle `add_to_playlist` events
- New: `useAgentConnection` hook — WebSocket lifecycle, audio, event dispatch

## Scope Boundaries (YAGNI)

- No user auth (anonymous sessions for demo)
- No multi-agent orchestration (single LlmAgent with tools)
- No custom voice/TTS (Gemini Live handles natively)
- No mobile voice handling (desktop demo for hackathon)

## Hackathon Submission Checklist

- Public GitHub repo with setup instructions
- Architecture diagram
- 4-minute demo video: voice conversation, graph exploration, story stream, playlist building
- Proof of Cloud Run deployment (screenshot or gcloud output)
- README with full setup docs
