# Extended Play — Hackathon Features Design

**Date:** 2026-03-11
**Deadline:** 2026-03-16 (5 days)
**Categories:** Live Agents + Creative Storyteller
**Approach:** Layered Delivery (demo-ready polish + feature completeness)

---

## Judging Criteria Alignment

| Criteria | Weight | Features Targeting It |
|----------|--------|-----------------------|
| Innovation & Multimodal UX | 40% | Interleaved output (voice + generated images + graph + text + music), vision input stretch goal |
| Technical Implementation | 30% | ADK Runner/Queue pattern, Gemini Live bidi-streaming, 6-source enrichment, Gemini 3.1 Flash Image |
| Demo & Presentation | 30% | Episode→connection→playlist demo flow, polished voice UX, text fallback |

---

## Section 1: Admin Dashboard

**Goal:** Functional tool for Tarik to load playlists and monitor enrichment, polished enough to show in demo.

**Location:** `/admin` (existing route)

**Three panels:**

### Panel 1 — Ingest
- Text area to paste tracklists (uses existing `parseAndIngestPlaylist` mutation)
- Fields: episode title, air date (date picker), source URL (optional)
- Format auto-detection with preview before commit (uses existing `previewParse`)
- Submit → result card (tracks parsed, artists created, enrichment jobs queued)
- Drag-and-drop zone for `.md` files (calls `bulkIngestEpisodes`)

### Panel 2 — Enrichment Monitor
- Real-time pipeline status (uses existing `getEnrichmentMonitor` query)
- Per-step progress bars (musicbrainz_lookup, discogs_fetch, etc.)
- Artist status breakdown: stubs → identified → metadata → images → sonic → complete
- Failed jobs list with retry button (uses existing `retryFailedJobs`)
- "Rebuild Graph Snapshot" button (calls `buildGraphSnapshot`)

### Panel 3 — Quick Stats
- Total episodes, artists, tracks, connections, reviews (from `getEnrichmentStats`)
- Track enrichment coverage: Spotify IDs, YouTube IDs, album art, sonic features
- Review corpus breakdown by source type

**Backend:** No new work. All mutations and queries already exist.

---

## Section 2: Agent Architecture Upgrade (ADK Pattern)

**Goal:** Replace raw `genai.Client` with ADK's official bidi-streaming pattern. Strengthens Live Agent score and unlocks text + vision input.

**Reference:** [google/adk-samples/bidi-demo](https://github.com/google/adk-samples/tree/main/python/agents/bidi-demo)

### Backend Changes (`agent/`)

**Replace `live_session.py` with ADK Runner/Queue pattern:**

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│  WebSocket  │────────▶│ LiveRequestQueue │────────▶│  Gemini     │
│   Client    │         │                  │         │  Live API   │
│             │◀────────│   run_live()     │◀────────│             │
└─────────────┘         └──────────────────┘         └─────────────┘
  Upstream Task              Queue              Downstream Task
```

**`agent/main.py` rewrite:**
- `Runner(agent=agent, session_service=InMemorySessionService())`
- WebSocket endpoint: `/ws/{user_id}/{session_id}`
- `upstream_task`: receives WebSocket messages → `LiveRequestQueue.send_content()` (text/image) or `.send_realtime()` (audio)
- `downstream_task`: `runner.run_live()` yields Events → serialize to JSON → send to WebSocket
- UI event middleware: inspects tool call results in Events, emits frontend-specific messages (show_artist, highlight_node, etc.) alongside raw ADK events

**`agent/extended_play/agent.py` stays similar:**
```python
agent = Agent(
    name="extended_play_curator",
    model="gemini-2.5-flash-native-audio-preview",
    tools=[explore_artist, get_connections, search_artists, ...],
    instruction=SYSTEM_INSTRUCTION,
)
```

**`agent/extended_play/live_session.py` deleted** — replaced by Runner pattern.

**RunConfig:**
```python
RunConfig(
    streaming_mode=StreamingMode.BIDI,
    response_modalities=["AUDIO"],
    input_audio_transcription=AudioTranscriptionConfig(),
    output_audio_transcription=AudioTranscriptionConfig(),
    session_resumption=SessionResumptionConfig(),
)
```

### Frontend Changes (`src/hooks/use-agent-connection.ts`)

- Send audio as raw binary WebSocket frames (not base64 JSON)
- Send text as `{type: "text", text: "..."}`
- Send images as `{type: "image", data: "base64...", mimeType: "image/jpeg"}`
- Parse incoming ADK Event JSON — extract audio parts, transcripts, tool results

### What This Unlocks
- ADK compliance (mandatory for hackathon)
- Session resumption (reconnect without losing context)
- Text input (same queue as audio)
- Vision input (same queue as audio — stretch goal)
- Barge-in handled natively
- Proactivity + affective dialog options

---

## Section 3: Creative Storyteller — Interleaved Multimodal Output

**Goal:** The agent weaves voice, generated images, graph animations, sourced text, and playable music into one continuous narrative stream. This is the 40% Innovation score.

### Scene Illustrations (Gemini 3.1 Flash Image Preview)

When the curator tells a story about an influence connection, a stylized illustration generates and appears inline in the story stream while the curator keeps speaking.

**New tool: `generate_scene_image`**
- Takes: narrative context (artists, era, genre, mood)
- Calls: Gemini 3.1 Flash Image Preview
- Returns: generated image (base64 or URL)
- Agent emits: `{type: "show_image", imageUrl: "...", caption: "...", style: "scene"}`

**Image prompts styled for consistency:** Vintage concert poster aesthetic, warm tones matching the Brownswood palette, editorial illustration feel. The system prompt guides the image style.

### Rich Visual Cards

Upgrade existing story stream cards:
- **Artist cards**: Photo (from enrichment), genre tags, country flag, community label, bio excerpt
- **Episode cards**: Album art grid from tracklist, playable previews, export button
- **Connection evidence cards**: Publication logo, excerpt quote, link
- **Sonic comparison cards**: Recharts radar chart overlaying two artists' sonic profiles

### New Story Stream Component: `SceneImageCard`
- Full-width image with fade-in animation
- Caption text below (the narrative context)
- Matches the Brownswood × NTS visual style

### Flow Example (One Conversation Turn)
1. Voice: Curator speaks (audio + transcript narration card)
2. Tool call: `explore_artist` → Rich artist card with photo slides in
3. Tool call: `get_connections` → Graph animates, evidence cards appear
4. Tool call: `generate_scene_image` → Illustration fades in inline
5. Tool call: `search_reviews` → Review citation card appears
6. Voice continues: Curator suggests tracks → Episode card with previews

Five modalities in one turn: voice, generated image, graph, sourced text, playable music.

---

## Section 4: Episode Walkthrough Mode

**Goal:** When a user selects an episode, the stream transforms into a guided walkthrough. Stay in the main layout, no separate page.

### Stream Content (Walkthrough Mode)
1. **Episode header** — Title, air date, track count, cover art. Close button to exit walkthrough.
2. **Tracklist with playable previews** — Each track: artist name, title, album art thumbnail. Play button triggers YouTube iframe or Spotify audio preview via AudioPlayerContext.
3. **"Tell me about this episode" button** — Starts voice agent with episode context preloaded. Curator narrates the journey.
4. **Export dropdown** — "Export this show" → Spotify, Apple Music, YouTube Music, .m3u. Creates a playlist from episode tracks using existing `playlists.create` mutation, matches against Spotify/Apple/YouTube IDs from enrichment.

### Graph (During Walkthrough)
- Filters to episode's artists only (already works)
- Playlist-adjacent edges highlighted (the play order)
- Nodes still clickable → artist detail drawer

### Exiting Walkthrough
- Click X on episode header
- Or select a different episode
- Stream returns to agent conversation mode, graph returns to full view

### Backend
No new work. `getEpisodeWithTracks` returns everything needed. Playlist export uses existing mutations.

---

## Section 5: Voice UX Polish + Text Chat Fallback

**Goal:** Voice interaction feels professional. Text input available as fallback. Agent activity visible.

### Voice Bar Upgrades
- **State machine:** idle → listening → agent_thinking → agent_speaking
- **Visual states:**
  - Idle: static mic icon, muted colors
  - Listening: pulsing gold ring around mic, waveform visualization
  - Agent thinking: subtle loading dots or spinner
  - Agent speaking: waveform playback animation, gold accent
- **Transcript scroll:** Both user and curator lines with role labels, scrolling within bar

### Text Chat Input
- Text input field alongside mic button in voice bar
- Type → Enter → sends `{type: "text", text: "..."}` through LiveRequestQueue
- Agent responds via story stream (narration cards) — no audio response for text input
- Voice and text coexist in same session. Talk, type, talk again.

### Agent Activity Indicators
- When agent calls a tool, a transient indicator appears in the story stream:
  - "Searching reviews..." / "Generating illustration..." / "Looking up artist..."
- Disappears when the result card arrives
- Makes multimodal flow feel intentional, not laggy

---

## Section 6: Demo Flow + Vision Stretch Goal

### Demo Video Script (4 minutes)

| Time | Beat | What Happens |
|------|------|-------------|
| 0:00-0:15 | Open | Full graph floating, welcome overlay. "20 years of music connections." |
| 0:15-1:00 | Episode | Click Rhythm Lab episode. Graph filters, tracklist appears. Play a preview. Export to Spotify. |
| 1:00-2:30 | Conversation | Mic on. Ask about Nubya Garcia → London jazz scene. Artist card, graph zoom, scene illustration, review citations — all flowing together. |
| 2:30-3:30 | Follow thread | "How does she connect to Fela Kuti?" Graph traces the path. More illustrations, evidence cards. |
| 3:30-3:50 | Build crate | "Build me a playlist." Tracks added to playlist bar. Export to Spotify. |
| 3:50-4:00 | Close | Pull back to full graph. "Extended Play." |

### Vision Stretch Goal (Day 4 if time)
- Camera button in voice bar
- Capture photo → `{type: "image", data: base64, mimeType: "image/jpeg"}` → LiveRequestQueue
- Curator responds to what it sees: album covers, vinyl records, concert posters
- Already supported by ADK pattern — only new code is the camera capture UI button

---

## Schedule

| Day | Focus | Ships |
|-----|-------|-------|
| 1 (Mar 12) | Admin + Episode Walkthrough | Polished admin dashboard, episode walkthrough mode with playable previews + playlist export |
| 2 (Mar 13) | Creative Storyteller | Gemini 3.1 Flash Image generation in story stream, rich visual cards, scene illustrations |
| 3 (Mar 14) | Live Agent | ADK Runner/Queue rewrite, voice UX polish, text chat input, agent activity indicators |
| 4 (Mar 15) | Demo Flow + Stretch | Wire demo D-flow, vision camera button if time, end-to-end testing |
| 5 (Mar 16) | Video + Deploy | Record 4-min demo, final Cloud Run deploy, Devpost submission |

---

## Technical Constraints

- **No new Convex tables.** All backend queries/mutations already exist.
- **Gemini 3.1 Flash Image Preview** for scene illustrations (latest model).
- **ADK bidi-demo pattern** for agent server (Runner + LiveRequestQueue + InMemorySessionService).
- **Same Brownswood × NTS design system** — no visual redesign.
- **Enrichment pipeline unchanged** — admin just triggers what already works.
