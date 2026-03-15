# The Director's Cut v2 — Cinematic Episode Walkthrough

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan.

**Goal:** Transform Extended Play into a cinematic, auto-advancing episode walkthrough that showcases every Gemini capability — interleaved image generation, TTS narration, Google Search grounding, and creative narrative curation.

**Hackathon:** Gemini Live Agent Challenge. Categories: Creative Storyteller (primary). Deadline: March 16, 2026 5pm PDT.

**Reference:** Sonic Sommelier (Mistral hackathon) — `/Users/tarikmoody/Documents/Projects/mistral-hackathon/sonic-sommelier/`

---

## 1. User Journey (The Flow)

**Entry:** Judge lands on Extended Play. Welcome overlay: "Rhythm Lab Radio presents Extended Play." Click to enter.

**Episode Selection:** Most recent episode auto-loads. Sidebar shows all episodes.

**Act 1 — Full-Screen Intro (6-8 seconds):**
- Gemini-generated episode cover as background (Ken Burns zoom, scale 1.0 → 1.05 over 8s)
- Dark vignette overlay (`bg-gradient-radial from-transparent to-walnut/90`)
- Staggered text: "RHYTHM LAB RADIO" (data font, amber/60) → Episode title (editorial) → Date + number (data font)
- After 2s: narrative premise fades in (editorial italic, cream/80)
- TTS speaks the premise

**Act 2 — Transition to App (800ms cross-fade):**
- Full-screen dissolves out (opacity 1 → 0, 800ms)
- 3-column layout fades in beneath (200ms offset)
- Graph scales from 0.95 → 1.0
- First track card begins entrance at 600ms

**Act 3 — Track-by-Track Walkthrough (3-5 tracks, ~42s each):**
Per track:
1. Track card slides in (staggered: image 0s → name 0.2s → track 0.35s → tags 0.5s)
2. Gemini image appears with Ken Burns zoom
3. TTS narration plays; YouTube audio ducks to 15%
4. TTS ends; YouTube goes to 100%
5. Graph node illuminates, edges to previous artists draw in
6. After ~15s of music, YouTube fades out, next track begins

**Act 4 — Closing:**
- Final narration: "That's the thread tonight — want to pull on it?"
- App becomes fully interactive (voice, click, graph exploration)

**Interrupt anytime:** Voice (STT), click (graph/card), or pause button.

---

## 2. Curation Pipeline (5 Parallel Calls)

All calls happen during a loading screen ("Curating your episode..." with gold spinner). Target: ~10-15 seconds.

### Call 1 — Narrative Curation
- **Model:** `gemini-2.5-flash` + Google Search grounding
- **Input:** Full tracklist from Convex (artist name, track title, genres, community, bridge score), artist connection data from knowledge graph, episode metadata
- **Prompt:** "Find the most compelling narrative thread connecting 3-5 tracks through genre evolution, geographic migration, mutual influence, or cultural moment. Use Google Search for artists you don't know well."
- **Output:** JSON: { premise, tracks: [{ artistName, trackTitle, paragraph }], closing }

### Call 2 — Episode Cover Art
- **Model:** `gemini-3.1-flash-image-preview`
- **Prompt:** "Generate cover image for episode about: {premise}. Vintage concert poster, warm gold/walnut palette, textured paper. NO text."

### Call 3 — Track Illustrations (1 per track, parallel)
- **Model:** `gemini-3.1-flash-image-preview`
- **Prompt per track:** "Illustrate: {paragraph}. Same vintage poster aesthetic."

### Call 4 — TTS Segments (parallel)
- **Model:** `gemini-2.5-flash-preview-tts` (Kore voice)
- **Segments:** Intro premise, each track paragraph, closing. 6-7 calls.

### Call 5 — YouTube ID Resolution
- Check Convex for `youtubeVideoId` on each track
- Fallback: YouTube Data API search `"{artistName}" "{trackTitle}"` → first result
- Skip if no result found

---

## 3. Story Card Visual Design (4 Tiers)

### Hero Card — Episode Intro
- Full-width, episode artwork background with Ken Burns zoom
- Dark gradient overlay, text centered
- Title in `font-editorial`, date in `font-data` (amber/60)
- Gold rule (1px, gold/30) beneath

### Track Card — The Main Event
- Left: thin gold accent bar (2px, gold/40)
- Top: Gemini image with Ken Burns zoom
- Below: artist name (editorial), track title (body), genre tags (data font, pill-shaped, shelf bg)
- Staggered reveal: image (0s) → name (0.2s) → track (0.35s) → tags (0.5s)
- Subtle equalizer animation (3 amber bars) when YouTube is playing

### Narration Card — The Story
- Clean text, `font-editorial italic`
- Subtle left border in gold/20
- Paragraph fade-in as a block (0.4s)
- Small speaker icon (animated) when TTS is playing

### Connection Card — Graph Reveal
- Horizontal: Artist A thumbnail → gold arrow → Artist B thumbnail
- Connection type label between
- Triggers graph edge highlight simultaneously

### Shared Polish
- Framer Motion: `initial={{ opacity: 0, y: 20 }}` → `animate={{ opacity: 1, y: 0 }}`
- Each card staggers 0.15s after previous
- Decorative gold rule divider between cards (thin line with center dot)
- Cards: `bg-wood` with `ring-tube-glow` on hover

---

## 4. Audio System (Two Layers)

### Layer 1 — Gemini TTS Narration
- Server-side: `gemini-2.5-flash-preview-tts` (Kore voice)
- Sent as `narration_audio` events (PCM L16, 24kHz)
- Frontend decodes via AudioContext, plays through queue

### Layer 2 — YouTube Audio Preview
- YouTube IFrame API, hidden player
- Starts at 30-second mark (skip intros)
- Plays ~30s per track, fades out before next advance
- Volume: 100% normally, 15% during TTS

### Ducking
- TTS starts → YouTube 100% → 15% (200ms ramp)
- TTS ends → YouTube 15% → 100% (500ms ramp)

### Edge Cases
- No YouTube ID → TTS plays over silence
- Judge interrupts (STT) → both TTS and YouTube pause
- Resume → auto-advance picks up where it stopped

---

## 5. Auto-Advance & Interrupt

### Timing Per Track (~42s)
```
[0.0s]  Track card slides in
[0.5s]  Gemini image appears
[1.0s]  TTS narration begins, YouTube ducks
[~15-25s] TTS ends, YouTube full volume
[~40s]  YouTube fades out
[42s]   Next track begins
```

Total: ~4 minutes for 4 tracks + intro + closing.

### Progress Indicator
- Gold dots at top of story stream (● ● ○ ○ ○)
- Active dot shows fill animation for time remaining

### Interrupt Triggers
1. **Voice** — STT activates → pause all, agent responds, offer to resume
2. **Click** — graph node or card → pause, open detail drawer, resume on close
3. **Pause button** — on progress indicator, tap to toggle

### Resume
- Never restart from beginning
- Pick up from exact segment
- If judge explored current artist deeply, skip to next track

---

## 6. Component Architecture

### New Components
| Component | Purpose |
|-----------|---------|
| `EpisodeCinematic` | Full-screen intro overlay |
| `DirectorWalkthrough` | Auto-advance orchestrator |
| `TrackCard` | Featured track card (image + info + staggered animation) |
| `NarrationCard` | Upgraded text card with speaker indicator |
| `ConnectionCard` | A → B connection display |
| `GoldRule` | Decorative divider |
| `ProgressDots` | Segment indicator |
| `useYouTubeAudio` | Hidden YouTube player + ducking |
| `useCurationPipeline` | Runs all 5 curation calls |

### Modified Components
| Component | Change |
|-----------|--------|
| `story-stream.tsx` | New card types, Ken Burns, staggered animations |
| `page.tsx` | Gemini TTS playback, cinematic trigger on episode select |
| `influence-map.tsx` | `highlightSequence` prop for sequential node reveals |
| `voice-bar.tsx` | Pause/resume button during walkthrough |

### Backend Changes
| File | Change |
|------|--------|
| `storyteller.py` | New `curate_episode()` with grounding + graph context |
| `main.py` | New `_handle_walkthrough` flow, YouTube search fallback |

### Data Flow
```
Episode selected
  → useCurationPipeline fires (loading screen)
    → Call 1: Narrative curation (Gemini + grounding + graph)
    → Call 2-3: Cover + track images (parallel)
    → Call 4: TTS segments (parallel)
    → Call 5: YouTube IDs (parallel)
  → EpisodeCinematic renders (full-screen, 6-8s)
  → Cross-fade to app layout
  → DirectorWalkthrough auto-advances through tracks
  → Walkthrough ends → app becomes interactive
```

---

## 7. Gemini Capabilities Showcased

| Capability | Model | Where |
|------------|-------|-------|
| Creative narrative curation | `gemini-2.5-flash` | Call 1: picks tracks, writes story arc |
| Google Search grounding | `gemini-2.5-flash` + grounding | Call 1: enriches newer/lesser-known artists |
| Interleaved image generation | `gemini-3.1-flash-image-preview` | Calls 2-3: cover + track illustrations |
| Text-to-Speech | `gemini-2.5-flash-preview-tts` | Call 4: natural voice narration |
| Knowledge graph integration | Convex queries | Context for curation: connections, communities, bridge scores |

---

## 8. Constraints & Priorities

**Time budget:** ~8-10 hours implementation. Deadline March 16 5pm PDT.

**Priority order (if time runs short, cut from bottom):**
1. Curation pipeline + basic walkthrough flow (MUST HAVE)
2. Gemini TTS + YouTube audio with ducking (MUST HAVE)
3. Ken Burns + staggered card animations (HIGH)
4. Full-screen cinematic intro + transition (HIGH)
5. Progress dots + interrupt system (MEDIUM)
6. Connection cards + graph highlight sequence (NICE TO HAVE)
7. Pause button + resume logic (NICE TO HAVE)
