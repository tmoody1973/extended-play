# Director's Cut v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cinematic, auto-advancing episode walkthrough that showcases Gemini's interleaved image generation, TTS narration, Google Search grounding, and creative curation — all layered on top of 20 years of Rhythm Lab Radio knowledge graph data.

**Architecture:** The backend adds a `curate_episode()` function that uses Gemini 2.5 Flash with Google Search grounding + Convex knowledge graph context to pick 3-5 tracks and build a narrative arc. A separate pipeline generates cover art, track illustrations (Gemini 3.1 Flash Image), TTS audio (Gemini 2.5 Flash TTS), and resolves YouTube IDs. The frontend adds an `EpisodeCinematic` full-screen intro, a `DirectorWalkthrough` auto-advance orchestrator, upgraded story cards with Ken Burns + staggered animations, and a `useYouTubeAudio` hook for background music with volume ducking during narration.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Framer Motion (`motion` package), Python FastAPI, Gemini 3.1 Flash Image, Gemini 2.5 Flash + Google Search grounding, Gemini 2.5 Flash TTS, YouTube Data API v3, Convex.

---

## Task 1: Backend — `curate_episode()` with Gemini Grounding + Graph Context

**Files:**
- Modify: `agent/extended_play/tools/storyteller.py`
- Modify: `agent/main.py`

**Step 1: Add `curate_episode()` to storyteller.py**

Add this function after the existing `tell_story()` function in `agent/extended_play/tools/storyteller.py`:

```python
async def curate_episode(episode_id: str) -> dict:
    """Curate a cinematic walkthrough for a Rhythm Lab Radio episode.

    Uses Gemini with Google Search grounding + knowledge graph context
    to pick the most compelling 3-5 tracks and build a narrative arc.

    Args:
        episode_id: Convex episode ID.

    Returns:
        dict with premise, selected tracks, paragraphs, cover image,
        track images, TTS audio segments, and YouTube IDs.
    """
    ws = active_websocket

    # Send loading state
    if ws:
        await ws.send_text(json.dumps({
            "type": "walkthrough_loading",
            "status": "curating",
            "message": "Curating your episode...",
        }))

    # ── Fetch episode + tracks from Convex ──
    episode = await query("queries:getEpisodeWithTracks", {"episodeId": episode_id})
    if not episode or not episode.get("tracks"):
        return {"status": "error", "message": "Episode not found or has no tracks"}

    tracks = episode.get("tracks", [])

    # ── Build knowledge graph context ──
    graph_context_parts = []
    for t in tracks[:30]:  # Cap at 30 to avoid prompt overflow
        artist_name = t.get("artistName", "Unknown")
        track_title = t.get("title", "Unknown")
        genres = ", ".join(t.get("genres", [])[:3]) if t.get("genres") else ""
        youtube_id = t.get("youtubeVideoId", "")
        line = f"- {artist_name} — \"{track_title}\""
        if genres:
            line += f" [{genres}]"
        if youtube_id:
            line += f" (YouTube: {youtube_id})"
        graph_context_parts.append(line)

    # Fetch bridge artists for extra context
    try:
        bridges = await query("queries:getBridgeArtists", {"limit": 5})
        bridge_nodes = bridges.get("nodes", []) if isinstance(bridges, dict) else []
        if bridge_nodes:
            bridge_names = [b.get("name", "") for b in bridge_nodes if b.get("name")]
            graph_context_parts.append(
                f"\nBridge artists in graph (connect communities): {', '.join(bridge_names)}"
            )
    except Exception:
        pass

    tracklist_str = "\n".join(graph_context_parts)

    # ── Call 1: Narrative curation (Gemini + grounding) ──
    if ws:
        await ws.send_text(json.dumps({
            "type": "walkthrough_loading",
            "status": "curating",
            "message": "Finding the narrative thread...",
        }))

    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if api_key:
        client = genai.Client(api_key=api_key, vertexai=False)
    else:
        client = genai.Client(
            vertexai=True,
            project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
        )

    curation_prompt = f"""You are the curator of Extended Play, built on 20 years of Rhythm Lab Radio playlists by Tarik Moody.

Given this episode tracklist and knowledge graph data, find the most compelling narrative thread — a story that connects 3-5 of these tracks through genre evolution, geographic migration, mutual influence, or cultural moment.

Use Google Search to fill in context for any artists you don't know well enough, especially newer or indie artists.

Episode: {episode.get("title", "Untitled")}
Air Date: {episode.get("airDate", "Unknown")}

Tracklist:
{tracklist_str}

Return valid JSON only (no markdown, no code fences):
{{
    "premise": "One compelling sentence describing the narrative thread",
    "tracks": [
        {{
            "artistName": "exact artist name from tracklist",
            "trackTitle": "exact track title from tracklist",
            "paragraph": "A rich, warm paragraph (3-4 sentences) about this artist and how they fit the thread. Write like a knowledgeable radio host — authoritative, opinionated, specific.",
            "imagePrompt": "A scene description for illustration. Capture the mood/era/place. No text or letters. Vintage concert poster aesthetic, warm gold and walnut tones."
        }}
    ],
    "closing": "A paragraph tying the thread together and inviting exploration"
}}"""

    try:
        curation_response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=curation_prompt,
            config=genai.types.GenerateContentConfig(
                response_modalities=["TEXT"],
                tools=[genai.types.Tool(google_search=genai.types.GoogleSearch())],
            ),
        )
        curation_text = curation_response.text.strip()
        # Strip markdown code fences if present
        if curation_text.startswith("```"):
            curation_text = curation_text.split("\n", 1)[1]
            if curation_text.endswith("```"):
                curation_text = curation_text[:-3]
        curation = json.loads(curation_text)
    except Exception as e:
        logger.error(f"[CURATE] Curation failed: {e}", exc_info=True)
        return {"status": "error", "message": f"Curation failed: {e}"}

    selected_tracks = curation.get("tracks", [])
    premise = curation.get("premise", "")
    closing = curation.get("closing", "")

    if ws:
        await ws.send_text(json.dumps({
            "type": "walkthrough_loading",
            "status": "generating",
            "message": "Generating visuals and audio...",
        }))

    # ── Resolve YouTube IDs for selected tracks ──
    youtube_api_key = os.environ.get("YOUTUBE_API_KEY")
    for st in selected_tracks:
        # Find matching track from episode data
        match = next(
            (t for t in tracks
             if t.get("artistName", "").lower() == st.get("artistName", "").lower()
             and t.get("title", "").lower() == st.get("trackTitle", "").lower()),
            None,
        )
        if match and match.get("youtubeVideoId"):
            st["youtubeVideoId"] = match["youtubeVideoId"]
            st["artistId"] = match.get("artistId")
        elif youtube_api_key:
            # YouTube search fallback
            try:
                search_query = f"{st.get('artistName', '')} {st.get('trackTitle', '')}"
                import httpx
                yt_resp = await httpx.AsyncClient().get(
                    "https://www.googleapis.com/youtube/v3/search",
                    params={
                        "part": "snippet",
                        "q": search_query,
                        "type": "video",
                        "maxResults": 1,
                        "key": youtube_api_key,
                    },
                    timeout=10,
                )
                yt_data = yt_resp.json()
                items = yt_data.get("items", [])
                if items:
                    st["youtubeVideoId"] = items[0]["id"]["videoId"]
            except Exception as e:
                logger.warning(f"[CURATE] YouTube search failed for {search_query}: {e}")

    # ── Calls 2-4: Images + TTS (parallel) ──
    async def generate_cover():
        try:
            resp = await client.aio.models.generate_content(
                model=STORYTELLER_MODEL,
                contents=f"Generate a cover image for a music episode about: {premise}. "
                         f"Vintage concert poster, warm gold and walnut palette, textured paper, "
                         f"screen-printed aesthetic. NO text, words, or letters.",
                config=genai.types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                ),
            )
            for part in resp.candidates[0].content.parts:
                if hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
                    return base64.b64encode(part.inline_data.data).decode()
        except Exception as e:
            logger.warning(f"[CURATE] Cover generation failed: {e}")
        return None

    async def generate_track_image(image_prompt: str):
        try:
            resp = await client.aio.models.generate_content(
                model=STORYTELLER_MODEL,
                contents=image_prompt,
                config=genai.types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                ),
            )
            for part in resp.candidates[0].content.parts:
                if hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
                    return base64.b64encode(part.inline_data.data).decode()
        except Exception as e:
            logger.warning(f"[CURATE] Track image failed: {e}")
        return None

    async def generate_tts_segment(text: str):
        return await _generate_tts(client, text)

    # Run all in parallel
    cover_task = asyncio.create_task(generate_cover())
    image_tasks = [
        asyncio.create_task(generate_track_image(st.get("imagePrompt", st.get("paragraph", ""))))
        for st in selected_tracks
    ]
    tts_tasks = [
        asyncio.create_task(generate_tts_segment(premise)),  # intro
        *[asyncio.create_task(generate_tts_segment(st.get("paragraph", ""))) for st in selected_tracks],
        asyncio.create_task(generate_tts_segment(closing)),  # closing
    ]

    cover_b64 = await cover_task
    track_images = await asyncio.gather(*image_tasks)
    tts_segments = await asyncio.gather(*tts_tasks)

    # ── Assemble walkthrough data ──
    walkthrough = {
        "status": "success",
        "episode": {
            "id": episode_id,
            "title": episode.get("title", ""),
            "airDate": episode.get("airDate", ""),
        },
        "premise": premise,
        "closing": closing,
        "coverImage": cover_b64,
        "tracks": [],
    }

    # Encode TTS to base64
    intro_tts_b64 = base64.b64encode(tts_segments[0]).decode() if tts_segments[0] else None
    closing_tts_b64 = base64.b64encode(tts_segments[-1]).decode() if tts_segments[-1] else None

    for i, st in enumerate(selected_tracks):
        tts_data = tts_segments[i + 1] if (i + 1) < len(tts_segments) else None
        walkthrough["tracks"].append({
            "artistName": st.get("artistName", ""),
            "trackTitle": st.get("trackTitle", ""),
            "paragraph": st.get("paragraph", ""),
            "youtubeVideoId": st.get("youtubeVideoId"),
            "artistId": st.get("artistId"),
            "image": track_images[i] if i < len(track_images) else None,
            "ttsAudio": base64.b64encode(tts_data).decode() if tts_data else None,
        })

    walkthrough["introTts"] = intro_tts_b64
    walkthrough["closingTts"] = closing_tts_b64

    # ── Send complete walkthrough to frontend ──
    if ws:
        await ws.send_text(json.dumps({
            "type": "walkthrough_ready",
            "data": walkthrough,
        }))

    return walkthrough
```

**Step 2: Add `_handle_walkthrough` to main.py**

Add this import at the top of `agent/main.py`:

```python
from extended_play.tools.storyteller import tell_story, curate_episode
```

Update the import line that currently reads:
```python
from extended_play.tools.storyteller import tell_story
```

Add this handler function after `_handle_episode()`:

```python
async def _handle_walkthrough(ws: WebSocket, episode_id: str):
    """Director's Cut: cinematic episode walkthrough."""
    logger.info(f"[FLOW] Walkthrough: {episode_id}")
    await ws.send_text(json.dumps({
        "type": "agent_activity",
        "tool": "curate_episode",
        "status": "running",
    }))
    result = await curate_episode(episode_id=episode_id)
    logger.info(f"[CURATE] {result.get('status')} tracks={len(result.get('tracks', []))}")
```

Update the `_handle_message` function to detect walkthrough requests. Add this case before the episode check:

```python
        elif msg_type == "walkthrough":
            episode_id = msg.get("episodeId")
            if episode_id:
                asyncio.create_task(_handle_walkthrough(ws, episode_id))
```

In the WebSocket handler's message parsing section, update to handle the new message type. Change:

```python
            if msg.get("type") == "text":
```

to:

```python
            if msg.get("type") == "walkthrough":
                episode_id = msg.get("episodeId")
                if episode_id:
                    asyncio.create_task(_handle_walkthrough(ws, episode_id))

            elif msg.get("type") == "text":
```

**Step 3: Add YouTube API key to requirements and env**

The `httpx` package is already in `requirements.txt`. Add the `YOUTUBE_API_KEY` env var to Cloud Run:

```bash
# Get current env vars and add YOUTUBE_API_KEY
YOUTUBE_KEY=$(grep YOUTUBE_API_KEY /Users/tarikmoody/Documents/Projects/extended-play/.env.local | cut -d= -f2)
GEMINI_KEY=$(grep GEMINI_API_KEY /Users/tarikmoody/Documents/Projects/extended-play/.env.local | cut -d= -f2)

gcloud run services update extended-play-agent \
  --project extended-play-488702 \
  --region us-central1 \
  --set-env-vars="GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=extended-play-488702,GOOGLE_CLOUD_LOCATION=us-central1,CONVEX_URL=https://keen-pika-956.convex.cloud,GEMINI_API_KEY=$GEMINI_KEY,YOUTUBE_API_KEY=$YOUTUBE_KEY"
```

**Step 4: Test locally**

```bash
cd agent
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

Then in another terminal, test with wscat or a Python script:
```python
import asyncio, websockets, json
async def test():
    async with websockets.connect("ws://localhost:8000/ws/test/test") as ws:
        await ws.send(json.dumps({"type": "walkthrough", "episodeId": "PASTE_REAL_EPISODE_ID"}))
        async for msg in ws:
            data = json.loads(msg)
            print(data.get("type"), data.get("status", ""))
            if data.get("type") == "walkthrough_ready":
                wd = data["data"]
                print(f"Premise: {wd['premise']}")
                print(f"Tracks: {len(wd['tracks'])}")
                for t in wd["tracks"]:
                    print(f"  - {t['artistName']} — {t['trackTitle']} (YT: {t.get('youtubeVideoId', 'none')})")
                break
asyncio.run(test())
```

**Step 5: Commit**

```bash
git add agent/extended_play/tools/storyteller.py agent/main.py
git commit -m "feat: add curate_episode with Gemini grounding + graph context + YouTube fallback"
```

---

## Task 2: Frontend — `useYouTubeAudio` Hook with Volume Ducking

**Files:**
- Create: `src/hooks/use-youtube-audio.ts`

**Step 1: Create the hook**

```typescript
"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseYouTubeAudioOptions {
  onEnded?: () => void;
}

export function useYouTubeAudio({ onEnded }: UseYouTubeAudioOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const playerRef = useRef<YT.Player | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onEndedRef = useRef(onEnded);
  const duckTargetRef = useRef(100);
  const duckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  onEndedRef.current = onEnded;

  // Load YouTube IFrame API
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).YT) {
      setIsReady(true);
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    (window as any).onYouTubeIframeAPIReady = () => {
      setIsReady(true);
    };
  }, []);

  const play = useCallback(
    (videoId: string, startSeconds = 30) => {
      if (!isReady) return;

      // Create hidden container if needed
      if (!containerRef.current) {
        const div = document.createElement("div");
        div.id = "yt-audio-player";
        div.style.position = "fixed";
        div.style.top = "-9999px";
        div.style.left = "-9999px";
        div.style.width = "1px";
        div.style.height = "1px";
        document.body.appendChild(div);
        containerRef.current = div;
      }

      // Destroy previous player
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      playerRef.current = new (window as any).YT.Player(
        containerRef.current,
        {
          height: "1",
          width: "1",
          videoId,
          playerVars: {
            autoplay: 1,
            start: startSeconds,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
          },
          events: {
            onReady: (event: any) => {
              event.target.setVolume(100);
              event.target.playVideo();
              setIsPlaying(true);
            },
            onStateChange: (event: any) => {
              if (event.data === 0) {
                // Video ended
                setIsPlaying(false);
                onEndedRef.current?.();
              }
            },
          },
        }
      );
    },
    [isReady]
  );

  // Smooth volume ramping
  const rampVolume = useCallback((target: number, durationMs: number) => {
    if (!playerRef.current) return;
    if (duckIntervalRef.current) clearInterval(duckIntervalRef.current);

    const current = playerRef.current.getVolume?.() ?? 100;
    const steps = 10;
    const stepMs = durationMs / steps;
    const stepSize = (target - current) / steps;
    let step = 0;

    duckIntervalRef.current = setInterval(() => {
      step++;
      const vol = Math.round(current + stepSize * step);
      try { playerRef.current?.setVolume?.(vol); } catch {}
      if (step >= steps) {
        if (duckIntervalRef.current) clearInterval(duckIntervalRef.current);
        duckIntervalRef.current = null;
      }
    }, stepMs);
  }, []);

  const duck = useCallback(() => {
    rampVolume(15, 200);
  }, [rampVolume]);

  const unduck = useCallback(() => {
    rampVolume(100, 500);
  }, [rampVolume]);

  const stop = useCallback(() => {
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
      playerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const fadeOut = useCallback(
    (durationMs = 2000) => {
      rampVolume(0, durationMs);
      setTimeout(() => {
        stop();
      }, durationMs + 100);
    },
    [rampVolume, stop]
  );

  const pause = useCallback(() => {
    try { playerRef.current?.pauseVideo?.(); } catch {}
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    try { playerRef.current?.playVideo?.(); } catch {}
    setIsPlaying(true);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (duckIntervalRef.current) clearInterval(duckIntervalRef.current);
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
      }
    };
  }, []);

  return { isPlaying, isReady, play, stop, fadeOut, duck, unduck, pause, resume };
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-youtube-audio.ts
git commit -m "feat: add useYouTubeAudio hook with volume ducking"
```

---

## Task 3: Frontend — `GoldRule` and `ProgressDots` Components

**Files:**
- Create: `src/components/stream/gold-rule.tsx`
- Create: `src/components/stream/progress-dots.tsx`

**Step 1: Create GoldRule**

```typescript
export function GoldRule() {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-gold/20" />
      <div className="w-1.5 h-1.5 rounded-full bg-gold/30" />
      <div className="flex-1 h-px bg-gold/20" />
    </div>
  );
}
```

**Step 2: Create ProgressDots**

```typescript
"use client";

import { motion } from "motion/react";

interface ProgressDotsProps {
  total: number;
  current: number;
  isPaused?: boolean;
  onPauseToggle?: () => void;
}

export function ProgressDots({
  total,
  current,
  isPaused = false,
  onPauseToggle,
}: ProgressDotsProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors duration-300 ${
              i < current
                ? "bg-gold"
                : i === current
                ? "bg-gold/60"
                : "bg-shelf"
            }`}
          >
            {i === current && !isPaused && (
              <motion.div
                className="w-full h-full rounded-full bg-gold"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>
        ))}
      </div>

      {onPauseToggle && (
        <button
          onClick={onPauseToggle}
          className="ml-2 text-sleeve hover:text-cream text-xs font-data transition-colors"
        >
          {isPaused ? "▶" : "❚❚"}
        </button>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/stream/gold-rule.tsx src/components/stream/progress-dots.tsx
git commit -m "feat: add GoldRule divider and ProgressDots components"
```

---

## Task 4: Frontend — Upgraded Story Cards (TrackCard, NarrationCard)

**Files:**
- Create: `src/components/stream/track-card.tsx`
- Modify: `src/components/stream/narration-card.tsx`

**Step 1: Create TrackCard**

```typescript
"use client";

import { motion } from "motion/react";

interface TrackCardProps {
  artistName: string;
  trackTitle: string;
  genres?: string[];
  imageData?: string | null;
  isPlayingAudio?: boolean;
}

export function TrackCard({
  artistName,
  trackTitle,
  genres = [],
  imageData,
  isPlayingAudio = false,
}: TrackCardProps) {
  return (
    <div className="relative rounded-lg overflow-hidden bg-wood border border-edge/50">
      {/* Left gold accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gold/40" />

      {/* Gemini-generated image with Ken Burns */}
      {imageData && (
        <div className="relative h-48 overflow-hidden">
          <motion.img
            src={`data:image/png;base64,${imageData}`}
            alt={`${artistName} illustration`}
            className="w-full h-full object-cover"
            animate={{ scale: [1, 1.05] }}
            transition={{ duration: 8, ease: "linear", repeat: Infinity, repeatType: "reverse" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-wood via-transparent to-transparent" />
        </div>
      )}

      {/* Track info with staggered animation */}
      <div className="p-4 pl-5 space-y-2">
        <motion.h3
          className="font-editorial text-cream text-lg font-bold"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          {artistName}
        </motion.h3>

        <motion.p
          className="text-sleeve text-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          {trackTitle}
        </motion.p>

        {genres.length > 0 && (
          <motion.div
            className="flex flex-wrap gap-1.5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            {genres.map((g) => (
              <span
                key={g}
                className="px-2 py-0.5 rounded-full bg-shelf text-sleeve text-[10px] font-data"
              >
                {g}
              </span>
            ))}
          </motion.div>
        )}

        {/* Equalizer animation when playing */}
        {isPlayingAudio && (
          <motion.div
            className="flex items-end gap-0.5 h-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-0.5 bg-gold/60 rounded-full"
                animate={{ height: ["4px", "12px", "6px", "10px", "4px"] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Upgrade NarrationCard**

Read the existing `src/components/stream/narration-card.tsx` first, then update it to add the gold left border and speaker indicator. The key changes:

- Add a gold left border (`border-l-2 border-gold/20`)
- Add a speaker icon that animates when TTS is playing
- Use `font-editorial italic` for the narration body

**Step 3: Commit**

```bash
git add src/components/stream/track-card.tsx src/components/stream/narration-card.tsx
git commit -m "feat: add TrackCard with Ken Burns + upgrade NarrationCard"
```

---

## Task 5: Frontend — `EpisodeCinematic` Full-Screen Intro

**Files:**
- Create: `src/components/stream/episode-cinematic.tsx`

**Step 1: Create the component**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

interface EpisodeCinematicProps {
  title: string;
  airDate?: string;
  premise: string;
  coverImage?: string | null;
  onComplete: () => void;
}

export function EpisodeCinematic({
  title,
  airDate,
  premise,
  coverImage,
  onComplete,
}: EpisodeCinematicProps) {
  const [phase, setPhase] = useState<"intro" | "premise" | "fadeout">("intro");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("premise"), 2000);
    const t2 = setTimeout(() => setPhase("fadeout"), 6000);
    const t3 = setTimeout(() => onComplete(), 7000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  const handleClick = useCallback(() => {
    // Allow skip
    onComplete();
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== "fadeout" ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
          onClick={handleClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* Background image with Ken Burns */}
          {coverImage && (
            <motion.div
              className="absolute inset-0"
              animate={{ scale: [1, 1.05] }}
              transition={{ duration: 8, ease: "linear" }}
            >
              <img
                src={`data:image/png;base64,${coverImage}`}
                alt=""
                className="w-full h-full object-cover blur-sm"
              />
            </motion.div>
          )}

          {/* Dark vignette overlay */}
          <div className="absolute inset-0 bg-gradient-radial from-transparent to-walnut/90" />
          <div className="absolute inset-0 bg-walnut/60" />

          {/* Content */}
          <div className="relative z-10 text-center space-y-4 px-8 max-w-2xl">
            <motion.p
              className="text-amber/60 text-xs font-data uppercase tracking-[0.3em]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              Rhythm Lab Radio
            </motion.p>

            <motion.h1
              className="font-editorial text-cream text-4xl md:text-5xl font-bold leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
            >
              {title}
            </motion.h1>

            {airDate && (
              <motion.p
                className="text-sleeve text-xs font-data"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.4 }}
              >
                {airDate}
              </motion.p>
            )}

            {phase === "premise" && (
              <motion.p
                className="font-editorial italic text-cream/80 text-base md:text-lg leading-relaxed mt-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
              >
                {premise}
              </motion.p>
            )}

            <motion.p
              className="text-shadow/40 text-xs mt-8 animate-pulse"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
            >
              Click to skip
            </motion.p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/stream/episode-cinematic.tsx
git commit -m "feat: add EpisodeCinematic full-screen intro with Ken Burns"
```

---

## Task 6: Frontend — `DirectorWalkthrough` Auto-Advance Orchestrator

**Files:**
- Create: `src/components/stream/director-walkthrough.tsx`

**Step 1: Create the orchestrator**

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { EpisodeCinematic } from "./episode-cinematic";
import { TrackCard } from "./track-card";
import { NarrationCard } from "./narration-card";
import { GoldRule } from "./gold-rule";
import { ProgressDots } from "./progress-dots";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useYouTubeAudio } from "@/hooks/use-youtube-audio";

interface WalkthroughTrack {
  artistName: string;
  trackTitle: string;
  paragraph: string;
  youtubeVideoId?: string;
  artistId?: string;
  image?: string | null;
  ttsAudio?: string | null;
}

interface WalkthroughData {
  episode: { id: string; title: string; airDate?: string };
  premise: string;
  closing: string;
  coverImage?: string | null;
  introTts?: string | null;
  closingTts?: string | null;
  tracks: WalkthroughTrack[];
}

interface DirectorWalkthroughProps {
  data: WalkthroughData;
  onComplete: () => void;
  onInterrupt?: () => void;
  playPcmAudio: (base64Data: string) => void;
  onArtistReveal?: (artistId: string) => void;
}

type Phase = "cinematic" | "playing" | "closing" | "done";

export function DirectorWalkthrough({
  data,
  onComplete,
  onInterrupt,
  playPcmAudio,
  onArtistReveal,
}: DirectorWalkthroughProps) {
  const [phase, setPhase] = useState<Phase>("cinematic");
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1);
  const [isPaused, setIsPaused] = useState(false);
  const [visibleItems, setVisibleItems] = useState<Array<{
    type: "track" | "narration" | "closing";
    data: any;
  }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNarratingRef = useRef(false);

  const youtube = useYouTubeAudio({
    onEnded: () => {
      // YouTube clip finished, advance if not paused
    },
  });

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleItems.length]);

  // Cinematic complete → start walkthrough
  const handleCinematicComplete = useCallback(() => {
    // Play intro TTS
    if (data.introTts) {
      playPcmAudio(data.introTts);
    }
    setPhase("playing");
    setCurrentTrackIndex(0);
  }, [data.introTts, playPcmAudio]);

  // Advance to a track
  useEffect(() => {
    if (phase !== "playing" || currentTrackIndex < 0 || isPaused) return;

    const track = data.tracks[currentTrackIndex];
    if (!track) {
      // All tracks done → closing
      setPhase("closing");
      return;
    }

    // Add track card
    setVisibleItems((prev) => [
      ...prev,
      { type: "track", data: track },
    ]);

    // Reveal artist on graph
    if (track.artistId && onArtistReveal) {
      onArtistReveal(track.artistId);
    }

    // After 0.5s, add narration card
    const narrationTimer = setTimeout(() => {
      setVisibleItems((prev) => [
        ...prev,
        { type: "narration", data: { text: track.paragraph } },
      ]);

      // Play TTS
      if (track.ttsAudio) {
        isNarratingRef.current = true;
        // Duck YouTube
        youtube.duck();
        playPcmAudio(track.ttsAudio);

        // Estimate TTS duration (rough: 150 words/min, ~24000 samples/sec)
        // For PCM L16 24kHz: bytes = seconds * 24000 * 2
        const audioBytes = track.ttsAudio ? atob(track.ttsAudio).length : 0;
        const ttsDurationMs = (audioBytes / (24000 * 2)) * 1000;

        setTimeout(() => {
          isNarratingRef.current = false;
          youtube.unduck();
        }, ttsDurationMs);
      }

      // Start YouTube audio
      if (track.youtubeVideoId) {
        youtube.play(track.youtubeVideoId, 30);
        if (track.ttsAudio) {
          youtube.duck(); // Start ducked if TTS is playing
        }
      }
    }, 500);

    // Auto-advance to next track after ~42s
    advanceTimerRef.current = setTimeout(() => {
      youtube.fadeOut(2000);
      setTimeout(() => {
        setCurrentTrackIndex((prev) => prev + 1);
      }, 2200);
    }, 42000);

    return () => {
      clearTimeout(narrationTimer);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, [phase, currentTrackIndex, isPaused, data.tracks, youtube, playPcmAudio, onArtistReveal]);

  // Closing phase
  useEffect(() => {
    if (phase !== "closing") return;

    setVisibleItems((prev) => [
      ...prev,
      { type: "closing", data: { text: data.closing } },
    ]);

    if (data.closingTts) {
      playPcmAudio(data.closingTts);
    }

    const doneTimer = setTimeout(() => {
      setPhase("done");
      onComplete();
    }, 15000);

    return () => clearTimeout(doneTimer);
  }, [phase, data.closing, data.closingTts, playPcmAudio, onComplete]);

  // Pause/resume
  const handlePauseToggle = useCallback(() => {
    setIsPaused((prev) => {
      if (prev) {
        youtube.resume();
      } else {
        youtube.pause();
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      }
      return !prev;
    });
  }, [youtube]);

  return (
    <div className="flex flex-col h-full">
      {/* Cinematic intro */}
      {phase === "cinematic" && (
        <EpisodeCinematic
          title={data.episode.title}
          airDate={data.episode.airDate}
          premise={data.premise}
          coverImage={data.coverImage}
          onComplete={handleCinematicComplete}
        />
      )}

      {/* Progress dots */}
      {phase === "playing" && (
        <ProgressDots
          total={data.tracks.length}
          current={currentTrackIndex}
          isPaused={isPaused}
          onPauseToggle={handlePauseToggle}
        />
      )}

      {/* Story stream */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          <AnimatePresence mode="popLayout">
            {visibleItems.map((item, i) => (
              <motion.div
                key={`${item.type}-${i}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                {item.type === "track" && (
                  <>
                    {i > 0 && <GoldRule />}
                    <TrackCard
                      artistName={item.data.artistName}
                      trackTitle={item.data.trackTitle}
                      imageData={item.data.image}
                      isPlayingAudio={
                        youtube.isPlaying &&
                        currentTrackIndex === Math.floor(i / 2)
                      }
                    />
                  </>
                )}
                {item.type === "narration" && (
                  <NarrationCard
                    content={item.data.text}
                    timestamp=""
                  />
                )}
                {item.type === "closing" && (
                  <>
                    <GoldRule />
                    <NarrationCard
                      content={item.data.text}
                      timestamp=""
                      style="closing"
                    />
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/stream/director-walkthrough.tsx
git commit -m "feat: add DirectorWalkthrough auto-advance orchestrator"
```

---

## Task 7: Frontend — Wire Everything into page.tsx

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/hooks/use-agent-connection.ts`

**Step 1: Add walkthrough state and handler to page.tsx**

Add these imports at the top:
```typescript
import { DirectorWalkthrough } from "@/components/stream/director-walkthrough";
```

Add these state variables after the existing state declarations:
```typescript
const [walkthroughData, setWalkthroughData] = useState<any | null>(null);
const [isLoadingWalkthrough, setIsLoadingWalkthrough] = useState(false);
```

Add this case to `handleAgentEvent` switch statement:
```typescript
      case "walkthrough_loading":
        setIsLoadingWalkthrough(true);
        setStoryItems((prev) => {
          const filtered = prev.filter((item) => item.type !== "agent_activity");
          return [...filtered, { type: "agent_activity", tool: "curate_episode", status: event.message }];
        });
        break;
      case "walkthrough_ready":
        setIsLoadingWalkthrough(false);
        setWalkthroughData(event.data);
        setShowWelcome(false);
        setIsExploring(true);
        break;
```

Update `handleEpisodeSelect` to trigger the walkthrough via WebSocket:
```typescript
  const handleEpisodeSelect = useCallback((id: Id<"episodes"> | undefined) => {
    setSelectedEpisodeId(id);
    if (id) {
      // Trigger Director's Cut walkthrough
      setWalkthroughMode(true);
      setShowWelcome(false);
      agent.sendWalkthrough(id);
    } else {
      setWalkthroughMode(false);
    }
  }, [agent]);
```

Update the stream rendering in the JSX to use DirectorWalkthrough when data is ready:
```typescript
        stream={
          walkthroughData ? (
            <DirectorWalkthrough
              data={walkthroughData}
              onComplete={() => {
                setWalkthroughData(null);
                setWalkthroughMode(false);
              }}
              playPcmAudio={playPcmAudio}
              onArtistReveal={(artistId) => {
                revealArtists(artistId);
                setHighlightedNodeId(artistId);
              }}
            />
          ) : walkthroughMode && episodeWithTracks ? (
            <EpisodeWalkthrough
              episode={episodeWithTracks}
              tracks={episodeWithTracks.tracks || []}
              onClose={handleCloseWalkthrough}
              onTellMeAbout={handleTellMeAbout}
            />
          ) : (
            <StoryStream items={storyItems} onSendText={(text) => {
              setShowWelcome(false);
              setIsExploring(true);
              agent.sendText(text);
            }} />
          )
        }
```

**Step 2: Add `sendWalkthrough` to use-agent-connection.ts**

Add this function after `sendImage`:

```typescript
  const sendWalkthrough = useCallback(async (episodeId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }
    wsRef.current?.send(JSON.stringify({ type: "walkthrough", episodeId }));
    setAgentState("agent_thinking");
  }, [connect]);
```

Add `sendWalkthrough` to the return object:
```typescript
  return {
    // ...existing returns
    sendWalkthrough,
  };
```

**Step 3: Commit**

```bash
git add src/app/page.tsx src/hooks/use-agent-connection.ts
git commit -m "feat: wire DirectorWalkthrough into page with agent connection"
```

---

## Task 8: Deploy and Test

**Step 1: Deploy agent**

```bash
cd agent
GEMINI_KEY=$(grep GEMINI_API_KEY /Users/tarikmoody/Documents/Projects/extended-play/.env.local | cut -d= -f2)
YOUTUBE_KEY=$(grep YOUTUBE_API_KEY /Users/tarikmoody/Documents/Projects/extended-play/.env.local | cut -d= -f2)

gcloud run deploy extended-play-agent \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project extended-play-488702 \
  --set-env-vars="GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=extended-play-488702,GOOGLE_CLOUD_LOCATION=us-central1,CONVEX_URL=https://keen-pika-956.convex.cloud,GEMINI_API_KEY=$GEMINI_KEY,YOUTUBE_API_KEY=$YOUTUBE_KEY"
```

**Step 2: Deploy frontend**

```bash
cd /Users/tarikmoody/Documents/Projects/extended-play
gcloud run deploy extended-play \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project extended-play-488702
```

**Step 3: Test end-to-end**

1. Open https://extended-play-278027424812.us-central1.run.app
2. Click to enter
3. Click any episode in the sidebar
4. Expected: Loading indicator → Full-screen cinematic intro with Gemini-generated cover → Cross-fade to app → Track cards with images + TTS narration + YouTube audio auto-advance
5. Click during walkthrough → should pause

**Step 4: Commit final**

```bash
git add -A
git commit -m "feat: Director's Cut v2 — cinematic episode walkthrough with Gemini curation"
```

---

## Priority Order (if time runs short, cut from bottom)

1. **Task 1** — Backend curation pipeline (MUST HAVE)
2. **Task 7** — Wire into page.tsx (MUST HAVE — nothing works without this)
3. **Task 2** — YouTube audio hook (HIGH — audio previews are key)
4. **Task 4** — TrackCard + NarrationCard upgrades (HIGH — visual impact)
5. **Task 5** — EpisodeCinematic intro (HIGH — first impression)
6. **Task 6** — DirectorWalkthrough orchestrator (HIGH — ties it all together)
7. **Task 3** — GoldRule + ProgressDots (MEDIUM — polish)
8. **Task 8** — Deploy + test (MUST DO LAST)

**Estimated total: 8-10 hours.**
