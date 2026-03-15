# Director's Cut Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Extended Play from functional prototype into a cinematic music discovery experience that maximizes hackathon judging scores (40% Multimodal UX + 30% Demo).

**Architecture:** Four sequential changes — agent prompt upgrade, story stream card redesign, Framer Motion entrance animations, and guided welcome flow. All changes are frontend + agent prompt only. No new Convex mutations, no new tools, no graph rewrite.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, Framer Motion (`motion` package — already in deps), Python FastAPI agent, Gemini Live API via Google ADK.

---

### Task 1: Agent Prompt — Director Sequencing + Surprise Me

**Files:**
- Modify: `agent/extended_play/prompts.py`

**Step 1: Replace the system prompt with director-sequenced version**

Replace the entire contents of `agent/extended_play/prompts.py` with:

```python
SYSTEM_INSTRUCTION = """You are the curator of Extended Play — a Tokyo record bar built on 20 years of Rhythm Lab Radio playlists curated by Tarik Moody out of Milwaukee. You guide visitors through music connections, telling the story of how artists influence each other across genres, decades, and continents.

## Your Personality

You speak warmly but with authority. You have strong opinions about music. When you find a surprising connection, show genuine excitement. When an artist is underappreciated, advocate for them passionately. You're a storyteller, not a search engine.

## Director's Playbook — Choreograph Every Response

For every topic, follow this narrative sequence. Never dump everything at once. Let each moment land before the next:

1. **NARRATE** — Open with 1-2 vivid sentences that set the scene. Paint a picture with words before showing anything.
2. **SHOW** — Call explore_artist to pull up the artist card with images and bio. Or call generate_scene_image for an evocative illustration that captures the mood.
3. **EVIDENCE** — Call search_reviews to ground your narrative in real music journalism. Quote the source.
4. **CONNECT** — Call get_connections to trace the path on the graph, revealing how artists link together.
5. **PAUSE** — End with a question or invitation that lets the listener steer: "Want to follow that thread?" or "Should I dig into their connections?"

## Special Flows

### "Surprise Me" Flow
When the user says "surprise me" or asks you to show them something unexpected:
1. Call get_bridge_artists to find artists who connect different musical worlds
2. Pick the most surprising bridge — an artist that connects two genres/eras nobody would expect
3. Narrate the discovery with genuine wonder: "Okay, this one is wild..."
4. Call generate_scene_image to create a visual of the connection
5. Call get_connections to show the path on the graph
6. Call search_reviews for journalistic evidence
7. Offer to build a playlist that traces the connection

### Episode Walkthrough Flow
When the user picks an episode or says "walk me through a show":
1. Call get_episode to load the tracklist
2. Narrate the opening: "This episode from [date] opens with..."
3. Walk through 3-4 standout tracks, calling explore_artist for each
4. Highlight any surprising connections between artists in the episode
5. Offer to export the tracklist as a playlist

### Artist Deep Dive Flow
When the user names an artist:
1. Open with a personal take — what makes this artist special
2. Call explore_artist to show their card
3. Call generate_scene_image for an evocative visual
4. Call get_connections to show who they're connected to
5. Call search_reviews for critical context
6. Suggest a surprising connection to follow: "You know who connects to them in a way you wouldn't expect?"

## Rules
- Keep narration to 2-3 sentences per beat. Don't monologue.
- Always use tools to SHOW, don't just describe. The visual stream is half the experience.
- Call generate_scene_image at least once per major topic — judges are evaluating multimodal output.
- Ground every claim in evidence. If you cite a connection, show the review or the graph path.
- Build playlists naturally as the conversation flows. If you mention 3+ tracks, offer to create a crate.
- When greeting a new user, introduce yourself warmly and offer three paths: episode walkthrough, artist deep dive, or surprise me."""
```

**Step 2: Verify the agent still loads**

Run: `cd agent && python -c "from extended_play.agent import root_agent; print(root_agent.name)"`
Expected: `extended_play_curator`

**Step 3: Commit**

```bash
git add agent/extended_play/prompts.py
git commit -m "feat: director-sequenced agent prompt with surprise me + walkthrough flows"
```

---

### Task 2: Story Stream Card Redesign — Hero Artist Card

**Files:**
- Modify: `src/components/stream/artist-card.tsx`

**Step 1: Redesign the artist card with hero treatment**

Replace the entire contents of `src/components/stream/artist-card.tsx` with:

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
    <div className="rounded-lg overflow-hidden shadow-vinyl">
      {/* Hero image section */}
      <div className="relative h-40 bg-walnut overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover opacity-60"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-amber/20 via-walnut to-vinyl-blue/10" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-shelf via-shelf/40 to-transparent" />

        {/* Name overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-end gap-3">
            {/* Circular avatar */}
            <div
              className="w-14 h-14 rounded-full flex-shrink-0 ring-2 ring-gold/60 bg-wood bg-cover bg-center flex items-center justify-center"
              style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
            >
              {!imageUrl && (
                <span className="text-gold font-editorial text-xl font-bold">
                  {name.charAt(0)}
                </span>
              )}
            </div>
            <div>
              <h4 className="text-cream font-editorial text-xl font-bold tracking-tight leading-tight">
                {name}
              </h4>
              <div className="flex items-center gap-2 mt-0.5">
                {country && (
                  <span className="text-cream/60 text-[10px] font-data uppercase">{country}</span>
                )}
                {communityLabel && (
                  <span className="text-[10px] font-data text-gold/80 bg-gold/10 px-1.5 py-0.5 rounded">
                    {communityLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="bg-shelf p-4">
        {genres && genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {genres.slice(0, 5).map((g) => (
              <span
                key={g}
                className="text-[10px] font-data uppercase tracking-wider px-2 py-0.5 rounded-full border border-edge text-sleeve"
              >
                {g}
              </span>
            ))}
          </div>
        )}
        {bio && (
          <p className="text-cream/70 text-sm leading-relaxed line-clamp-3">{bio}</p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/stream/artist-card.tsx
git commit -m "feat: hero-tier artist card with full-bleed image and overlay"
```

---

### Task 3: Story Stream Card Redesign — Narration Card with Typing Effect

**Files:**
- Modify: `src/components/stream/narration-card.tsx`

**Step 1: Add typing reveal effect to narration cards**

Replace the entire contents of `src/components/stream/narration-card.tsx` with:

```tsx
"use client";

import { useState, useEffect } from "react";

interface NarrationCardProps {
  content: string;
  timestamp?: string;
  style?: string;
}

export function NarrationCard({ content, timestamp, style }: NarrationCardProps) {
  const [displayedLength, setDisplayedLength] = useState(0);
  const isQuote = style === "quote";

  // Typing reveal — shows ~40 chars per frame at 30ms intervals
  useEffect(() => {
    if (displayedLength >= content.length) return;
    const timer = setTimeout(() => {
      setDisplayedLength((prev) => Math.min(prev + 3, content.length));
    }, 16);
    return () => clearTimeout(timer);
  }, [displayedLength, content.length]);

  const visibleText = content.slice(0, displayedLength);
  const isComplete = displayedLength >= content.length;

  if (isQuote) {
    return (
      <div className="border-l-2 border-amber pl-4 py-2">
        <p className="text-cream text-base font-editorial italic leading-relaxed">
          &ldquo;{visibleText}&rdquo;
          {!isComplete && <span className="inline-block w-0.5 h-4 bg-amber ml-0.5 animate-pulse" />}
        </p>
        {timestamp && (
          <p className="text-shadow text-xs font-data mt-2">{timestamp}</p>
        )}
      </div>
    );
  }

  return (
    <div className="py-2">
      <p className="text-cream/90 text-[15px] leading-relaxed whitespace-pre-wrap">
        {visibleText}
        {!isComplete && <span className="inline-block w-0.5 h-4 bg-amber/60 ml-0.5 animate-pulse" />}
      </p>
      {isComplete && timestamp && (
        <p className="text-shadow text-[10px] font-data mt-2">{timestamp}</p>
      )}
    </div>
  );
}
```

**Step 2: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/stream/narration-card.tsx
git commit -m "feat: narration card with typing reveal effect and quote style"
```

---

### Task 4: Story Stream Card Redesign — Scene Image + Evidence Cards

**Files:**
- Modify: `src/components/stream/scene-image-card.tsx`
- Modify: `src/components/stream/connection-evidence-card.tsx`

**Step 1: Upgrade scene image card to hero-tier with full bleed**

Replace the entire contents of `src/components/stream/scene-image-card.tsx` with:

```tsx
"use client";

import { useState } from "react";

interface SceneImageCardProps {
  imageData: string;
  mimeType?: string;
  caption?: string;
}

export function SceneImageCard({ imageData, mimeType = "image/png", caption }: SceneImageCardProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="rounded-lg overflow-hidden bg-walnut -mx-1">
      <div className="relative">
        <img
          src={`data:${mimeType};base64,${imageData}`}
          alt={caption || "Scene illustration"}
          className={`w-full transition-all duration-1000 ${
            loaded ? "opacity-100 scale-100" : "opacity-0 scale-105"
          }`}
          onLoad={() => setLoaded(true)}
        />
        {/* Gradient overlay for caption readability */}
        {caption && loaded && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-walnut/90 via-walnut/40 to-transparent p-4 pt-12">
            <p className="text-cream/80 text-sm font-editorial italic leading-relaxed">
              {caption}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Upgrade connection evidence card**

Replace the entire contents of `src/components/stream/connection-evidence-card.tsx` with:

```tsx
"use client";

interface ConnectionEvidenceCardProps {
  publication: string;
  excerpt: string;
  url?: string;
  artistNames?: string[];
}

export function ConnectionEvidenceCard({
  publication,
  excerpt,
  url,
  artistNames,
}: ConnectionEvidenceCardProps) {
  return (
    <div className="rounded-lg bg-shelf/50 p-4 border-l-2 border-vinyl-blue">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-vinyl-blue/20 flex items-center justify-center">
          <span className="text-vinyl-blue text-[11px] font-editorial font-bold">
            {publication.charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="text-vinyl-blue text-xs font-data uppercase tracking-wider">{publication}</span>
      </div>
      <blockquote className="text-cream text-[15px] italic leading-relaxed font-editorial">
        &ldquo;{excerpt}&rdquo;
      </blockquote>
      {artistNames && artistNames.length > 0 && (
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {artistNames.map((name) => (
            <span key={name} className="text-[10px] font-data px-2 py-0.5 rounded-full bg-vinyl-blue/10 text-vinyl-blue/80 border border-vinyl-blue/20">
              {name}
            </span>
          ))}
        </div>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-vinyl-blue/70 text-xs font-data mt-3 inline-block hover:text-vinyl-blue transition-colors"
        >
          Read full article &rarr;
        </a>
      )}
    </div>
  );
}
```

**Step 3: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -5`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/stream/scene-image-card.tsx src/components/stream/connection-evidence-card.tsx
git commit -m "feat: hero scene image card + upgraded evidence card with editorial typography"
```

---

### Task 5: Framer Motion Entrance Animations on Story Stream

**Files:**
- Modify: `src/components/stream/story-stream.tsx`
- Modify: `src/components/stream/activity-indicator.tsx`

**Step 1: Wrap story stream cards with Framer Motion AnimatePresence**

Replace the entire contents of `src/components/stream/story-stream.tsx` with:

```tsx
"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { NarrationCard } from "./narration-card";
import { ArtistCard } from "./artist-card";
import { AlbumArtCard } from "./album-art-card";
import { EpisodeCard } from "./episode-card";
import { SceneImageCard } from "./scene-image-card";
import { ConnectionEvidenceCard } from "./connection-evidence-card";
import { SonicComparisonCard } from "./sonic-comparison-card";
import { ActivityIndicator } from "./activity-indicator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentEvent } from "@/hooks/use-agent-connection";

interface StoryStreamProps {
  items?: AgentEvent[];
  onSendText?: (text: string) => void;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const heroVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export function StoryStream({ items = [], onSendText }: StoryStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  const showPrompts = items.length === 0;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {showPrompts && (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="text-center space-y-2">
              <h3 className="font-editorial text-cream text-lg">What would you like to explore?</h3>
              <p className="text-sleeve text-sm">Start with your voice or pick a path below</p>
            </div>
            <div className="space-y-2 w-full max-w-xs">
              {[
                { label: "Walk me through an episode", icon: "📻" },
                { label: "Surprise me with a connection", icon: "✨" },
                { label: "Tell me about an artist", icon: "🎵" },
              ].map((prompt) => (
                <button
                  key={prompt.label}
                  onClick={() => onSendText?.(prompt.label)}
                  className="w-full text-left px-4 py-3 rounded-lg bg-shelf/60 hover:bg-shelf border border-edge/50 hover:border-amber/30 transition-all group"
                >
                  <span className="text-cream text-sm group-hover:text-amber transition-colors">
                    {prompt.icon} {prompt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {items.map((item, i) => {
            const isHero = item.type === "show_artist" || item.type === "show_image";
            const variants = isHero ? heroVariants : cardVariants;

            return (
              <motion.div
                key={`${item.type}-${i}`}
                variants={variants}
                initial="hidden"
                animate="visible"
                layout
              >
                {renderCard(item)}
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

function renderCard(item: AgentEvent) {
  switch (item.type) {
    case "show_narration":
      return (
        <NarrationCard
          content={item.text as string}
          timestamp="Just now"
          style={item.style as string | undefined}
        />
      );
    case "show_artist": {
      const data = item.data as Record<string, unknown> | undefined;
      return (
        <ArtistCard
          name={(data?.name as string) || "Unknown"}
          genres={(data?.genres as string[]) || []}
          country={(data?.country as string) || ""}
          communityLabel={(data?.communityLabel as string) || ""}
          imageUrl={(data?.images as any)?.thumbnail?.url}
          bio={(data?.bio as string) || ""}
        />
      );
    }
    case "show_episode": {
      const epData = item.data as Record<string, unknown> | undefined;
      const epTracks = (epData?.tracks as any[]) || [];
      return (
        <EpisodeCard
          title={(epData?.title as string) || "Episode"}
          airDate={epData?.airDate as string | undefined}
          description={epData?.description as string | undefined}
          coverImageUrl={epData?.coverImageUrl as string | undefined}
          tracks={epTracks.map((t: any) => ({
            id: t._id || t.id || String(Math.random()),
            title: t.title || "Unknown Track",
            artistName: t.artistName,
            albumArtUrl: t.albumArtUrl || t.albumArt?.primaryUrl,
            youtubeVideoId: t.youtubeVideoId,
            position: t.position,
          }))}
        />
      );
    }
    case "show_image": {
      const imgData = item as Record<string, unknown>;
      return (
        <SceneImageCard
          imageData={imgData.imageData as string}
          mimeType={imgData.mimeType as string | undefined}
          caption={imgData.caption as string | undefined}
        />
      );
    }
    case "show_evidence": {
      const evData = item.data as Record<string, unknown> | undefined;
      return (
        <ConnectionEvidenceCard
          publication={(evData?.publication as string) || "Unknown"}
          excerpt={(evData?.excerpt as string) || ""}
          url={evData?.url as string | undefined}
          artistNames={evData?.artistNames as string[] | undefined}
        />
      );
    }
    case "show_sonic_comparison": {
      const cmpData = item.data as Record<string, unknown> | undefined;
      return (
        <SonicComparisonCard
          artist1={cmpData?.artist1 as any}
          artist2={cmpData?.artist2 as any}
        />
      );
    }
    case "agent_activity":
      return <ActivityIndicator tool={item.tool as string} />;
    case "transcript":
      if (item.role === "agent") {
        return (
          <NarrationCard
            content={item.text as string}
            timestamp="Just now"
          />
        );
      }
      return null;
    default:
      return null;
  }
}
```

**Step 2: Upgrade the activity indicator to be more subtle**

Replace the entire contents of `src/components/stream/activity-indicator.tsx` with:

```tsx
"use client";

const TOOL_LABELS: Record<string, string> = {
  explore_artist: "Looking up artist",
  get_connections: "Tracing connections",
  search_artists: "Searching artists",
  get_bridge_artists: "Finding bridge artists",
  search_reviews: "Searching reviews",
  generate_scene_image: "Generating illustration",
  get_episode: "Loading episode",
  create_playlist: "Creating playlist",
  add_to_playlist: "Adding to playlist",
  seed_artist_corpus: "Building knowledge",
};

interface ActivityIndicatorProps {
  tool: string;
}

export function ActivityIndicator({ tool }: ActivityIndicatorProps) {
  const label = TOOL_LABELS[tool] || tool;

  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <div className="flex gap-1">
        <span className="w-1 h-1 bg-amber/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1 h-1 bg-amber/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1 h-1 bg-amber/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <span className="text-sleeve/60 text-xs font-data italic">{label}</span>
    </div>
  );
}
```

**Step 3: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -5`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/stream/story-stream.tsx src/components/stream/activity-indicator.tsx
git commit -m "feat: Framer Motion entrance animations + prompt suggestion cards in stream"
```

---

### Task 6: Guided Welcome Flow — Auto-Connect + Cinematic Overlay

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Update the welcome overlay and wire onSendText to StoryStream**

In `src/app/page.tsx`, make these changes:

1. Pass `onSendText` to `StoryStream` so prompt cards work.

Find:
```tsx
            <StoryStream items={storyItems} />
```
Replace with:
```tsx
            <StoryStream items={storyItems} onSendText={(text) => {
              setShowWelcome(false);
              setIsExploring(true);
              agent.sendText(text);
            }} />
```

2. Upgrade the welcome overlay to be cinematic with fade-in animation and subtitle.

Find the entire welcome overlay block (from `{showWelcome && (` through its closing `)}`) and replace with:

```tsx
      {showWelcome && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-walnut/95 backdrop-blur-md cursor-pointer"
          onClick={() => {
            setShowWelcome(false);
          }}
        >
          <div className="text-center space-y-4 animate-[fade-in_1.5s_ease-out]">
            <p className="text-amber/60 text-xs font-data uppercase tracking-[0.3em] animate-[fade-in_2s_ease-out]">
              Rhythm Lab Radio presents
            </p>
            <h1 className="font-editorial text-6xl md:text-7xl text-cream tracking-tight">
              Extended Play
            </h1>
            <p className="text-sleeve text-base font-editorial italic">
              20 years of music connections, explored through conversation.
            </p>
            <div className="pt-6">
              <p className="text-shadow/60 text-xs animate-pulse">
                Click to enter
              </p>
            </div>
          </div>
        </div>
      )}
```

**Step 2: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: cinematic welcome overlay + prompt suggestion cards in stream"
```

---

### Task 7: Deploy + Test Full Flows

**Step 1: Deploy agent to Cloud Run (if prompt changed)**

```bash
cd agent
gcloud run deploy extended-play-agent --source . --region us-central1 --allow-unauthenticated
```

Wait for deployment to complete.

**Step 2: Deploy Convex functions**

```bash
npx convex deploy --cmd 'npm run build' --yes
```

**Step 3: Deploy frontend to Cloud Run**

```bash
gcloud run deploy extended-play --source . --region us-central1 --allow-unauthenticated
```

**Step 4: Test all three flows on deployed URL**

Open `https://extended-play-278027424812.us-central1.run.app` in incognito:

1. **Welcome overlay** — Should show "Rhythm Lab Radio presents / Extended Play" with fade-in animation
2. **Click to enter** — Overlay fades, prompt cards visible in stream
3. **Click "Surprise me"** — Agent should narrate a bridge artist discovery with images, evidence, graph
4. **Type an artist name** — Agent should do a director-sequenced deep dive
5. **Voice test** — Click mic, ask about an artist, verify voice + visual cards appear together

**Step 5: Final commit with deploy confirmation**

```bash
git add -A
git commit -m "chore: deploy Director's Cut to production"
```

---

## Execution Notes

- Tasks 1-6 are independent enough to implement sequentially in ~7 hours
- Task 7 (deploy) should be done after all code changes
- The agent prompt (Task 1) has the highest impact-per-hour — do it first even if nothing else gets done
- Framer Motion import is `from "motion/react"` (the package is named `motion` in package.json)
- All card components currently use `animate-slide-up` CSS class — the Framer Motion variants replace this
- The `onSendText` prop on StoryStream enables the prompt suggestion cards to work without the mic
