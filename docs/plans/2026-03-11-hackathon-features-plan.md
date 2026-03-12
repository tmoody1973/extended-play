# Hackathon Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship all 6 hackathon feature areas (Admin Dashboard, ADK Upgrade, Creative Storyteller, Episode Walkthrough, Voice UX, Demo Flow) in 5 days to maximize Live Agents + Creative Storyteller scores.

**Architecture:** Next.js frontend (Convex reactive queries) + Python/FastAPI agent (ADK Runner + LiveRequestQueue bidi-streaming) + Gemini 2.5 Flash native audio + Gemini 3.1 Flash Image Preview. All backend mutations/queries already exist — work is frontend UI, agent server rewrite, and new image generation tool.

**Tech Stack:** Next.js 15, Convex, Tailwind CSS, D3.js, Recharts, Python 3.12, FastAPI, google-adk, google-genai, Gemini 2.5 Flash, Gemini 3.1 Flash Image Preview

**Design Doc:** `docs/plans/2026-03-11-hackathon-features-design.md`

---

## Day 1 (Mar 12): Admin Dashboard + Episode Walkthrough

### Task 1: Admin Dashboard — 3-Panel Tab Layout

**Files:**
- Modify: `src/app/admin/page.tsx`

**Step 1: Add tab state and 3-panel structure**

Replace the current single-view admin page with a tabbed layout (Ingest, Monitor, Stats).

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AdminTab = "ingest" | "monitor" | "stats";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("ingest");

  return (
    <div className="min-h-screen bg-walnut p-6">
      <h1 className="font-editorial text-2xl text-cream mb-6">Admin Dashboard</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-edge">
        {(["ingest", "monitor", "stats"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-data uppercase transition-colors",
              activeTab === tab
                ? "text-amber border-b-2 border-amber"
                : "text-sleeve hover:text-cream"
            )}
          >
            {tab === "ingest" ? "Ingest" : tab === "monitor" ? "Enrichment" : "Stats"}
          </button>
        ))}
      </div>

      {activeTab === "ingest" && <IngestPanel />}
      {activeTab === "monitor" && <MonitorPanel />}
      {activeTab === "stats" && <StatsPanel />}
    </div>
  );
}
```

**Step 2: Extract IngestPanel from existing code**

Move the existing ingest form into its own component within the same file. Add source URL field and drag-and-drop zone for `.md` files.

```tsx
function IngestPanel() {
  const [rawText, setRawText] = useState("");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [airDate, setAirDate] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [result, setResult] = useState<any>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const parseAndIngest = useMutation((api as any).admin.parseAndIngestPlaylist);
  const previewParse = useMutation((api as any).admin.previewParse);
  const bulkIngest = useMutation((api as any).ingest.bulkIngestEpisodes);

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
        sourceUrl: sourceUrl || undefined,
        sourceType: "manual" as const,
      });
      setResult({ type: "ingest", data: res });
      if (res.status === "success") {
        setRawText("");
        setEpisodeTitle("");
        setAirDate("");
        setSourceUrl("");
      }
    } finally {
      setIsIngesting(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith(".md")) return;
    const text = await file.text();
    setRawText(text);
  };

  return (
    <div className="space-y-6">
      {/* Drag-and-drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
          isDragging ? "border-amber bg-amber/10" : "border-edge"
        )}
      >
        <p className="text-sleeve text-sm">
          Drop a <code>.md</code> tracklist file here, or paste below
        </p>
      </div>

      {/* Existing form fields — episode title, air date, source URL, textarea */}
      <Card className="bg-wood border-edge">
        <CardHeader>
          <CardTitle className="font-editorial text-cream">Ingest Playlist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sleeve text-xs font-data block mb-1">Episode Title</label>
              <Input
                value={episodeTitle}
                onChange={(e) => setEpisodeTitle(e.target.value)}
                placeholder="Rhythm Lab Radio — Episode 412"
                className="bg-shelf border-edge text-cream"
              />
            </div>
            <div>
              <label className="text-sleeve text-xs font-data block mb-1">Air Date</label>
              <Input
                type="date"
                value={airDate}
                onChange={(e) => setAirDate(e.target.value)}
                className="bg-shelf border-edge text-cream"
              />
            </div>
            <div>
              <label className="text-sleeve text-xs font-data block mb-1">Source URL (optional)</label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://mixcloud.com/..."
                className="bg-shelf border-edge text-cream"
              />
            </div>
          </div>

          <div>
            <label className="text-sleeve text-xs font-data block mb-1">Paste tracklist</label>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={"Fela Kuti - Zombie\nTony Allen - Secret Agent"}
              rows={10}
              className="bg-shelf border-edge text-cream font-data text-sm"
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

          {result && (
            <div className="bg-shelf rounded-lg p-4 mt-4">
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

**Step 3: Build MonitorPanel with real-time pipeline status**

```tsx
function MonitorPanel() {
  const monitor = useQuery((api as any).queries.getEnrichmentMonitor);
  const retryFailed = useMutation((api as any).admin.retryFailedJobs);
  const buildSnapshot = useMutation((api as any).admin.buildGraphSnapshot);

  return (
    <div className="space-y-6">
      {/* Per-step progress bars */}
      <Card className="bg-wood border-edge">
        <CardHeader>
          <CardTitle className="font-editorial text-cream">Pipeline Status</CardTitle>
        </CardHeader>
        <CardContent>
          {monitor?.steps ? (
            <div className="space-y-4">
              {monitor.steps.map((step: any) => {
                const total = step.queued + step.running + step.completed + step.failed;
                const pct = total > 0 ? Math.round((step.completed / total) * 100) : 0;
                return (
                  <div key={step.name}>
                    <div className="flex justify-between text-xs font-data mb-1">
                      <span className="text-cream">{step.name}</span>
                      <span className="text-sleeve">{pct}% ({step.completed}/{total})</span>
                    </div>
                    <div className="h-2 bg-shelf rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex gap-3 text-[10px] font-data mt-1 text-sleeve">
                      <span>Queued: {step.queued}</span>
                      <span>Running: {step.running}</span>
                      <span className="text-led-green">Done: {step.completed}</span>
                      {step.failed > 0 && <span className="text-skip-red">Failed: {step.failed}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sleeve text-sm">Loading pipeline status...</p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => retryFailed({})}
          className="text-amber border-amber hover:bg-amber hover:text-walnut"
        >
          Retry Failed Jobs
        </Button>
        <Button
          variant="outline"
          onClick={() => buildSnapshot({})}
          className="text-vinyl-blue border-vinyl-blue hover:bg-vinyl-blue hover:text-walnut"
        >
          Rebuild Graph Snapshot
        </Button>
      </div>
    </div>
  );
}
```

**Step 4: Build StatsPanel with enrichment coverage**

```tsx
function StatsPanel() {
  const stats = useQuery((api as any).queries.getEnrichmentStats);

  if (!stats) return <p className="text-sleeve text-sm">Loading stats...</p>;

  const statBlocks = [
    {
      label: "Artists",
      items: [
        { k: "Total", v: stats.artistStats.total, highlight: true },
        { k: "Stubs", v: stats.artistStats.stub },
        { k: "Identified", v: stats.artistStats.identified },
        { k: "Complete", v: stats.artistStats.complete },
        { k: "With images", v: stats.artistStats.withImages },
      ],
    },
    {
      label: "Tracks",
      items: [
        { k: "Total", v: stats.trackStats.total, highlight: true },
        { k: "With Spotify ID", v: stats.trackStats.withSpotifyId ?? 0 },
        { k: "With YouTube ID", v: stats.trackStats.withYoutubeId ?? 0 },
        { k: "With album art", v: stats.trackStats.withAlbumArt },
        { k: "Complete", v: stats.trackStats.complete },
      ],
    },
    {
      label: "Knowledge Graph",
      items: [
        { k: "Episodes", v: stats.episodeCount ?? 0, highlight: true },
        { k: "Connections", v: stats.connectionCount ?? 0 },
        { k: "Reviews", v: stats.reviewCount ?? 0 },
        { k: "Communities", v: stats.communityCount ?? 0 },
      ],
    },
    {
      label: "Jobs",
      items: [
        { k: "Queued", v: stats.jobStats.queued, highlight: true },
        { k: "Running", v: stats.jobStats.running },
        { k: "Completed", v: stats.jobStats.completed },
        { k: "Failed", v: stats.jobStats.failed },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statBlocks.map((block) => (
        <Card key={block.label} className="bg-wood border-edge">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-data uppercase text-sleeve">{block.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {block.items.map(({ k, v, highlight }) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-sleeve">{k}</span>
                <span className={highlight ? "text-amber font-data" : "text-cream font-data"}>{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Step 5: Verify admin page renders**

Run: `npx next dev` and navigate to `/admin`
Expected: Three tabs (Ingest, Enrichment, Stats) all rendering with real Convex data.

**Step 6: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: admin dashboard with 3-panel tab layout (ingest, monitor, stats)"
```

---

### Task 2: Episode Walkthrough Mode

**Files:**
- Create: `src/components/stream/episode-walkthrough.tsx`
- Modify: `src/components/stream/story-stream.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create EpisodeWalkthrough component**

This component renders when an episode is selected from the sidebar — shows episode header, playable tracklist, "Tell me about this" button, and export dropdown. It replaces the story stream content.

```tsx
// src/components/stream/episode-walkthrough.tsx
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Id } from "../../../convex/_generated/dataModel";
import { useAudioPlayer } from "@/components/audio/audio-player-context";

interface EpisodeWalkthroughProps {
  episode: {
    _id: Id<"episodes">;
    title: string;
    airDate?: string;
    description?: string;
    coverImageUrl?: string;
    trackCount?: number;
  };
  tracks: Array<{
    _id: Id<"tracks">;
    title: string;
    artistName: string;
    albumArtUrl?: string;
    youtubeVideoId?: string;
    spotifyTrackId?: string;
    position?: number;
  }>;
  onClose: () => void;
  onTellMeAbout: () => void;
}

export function EpisodeWalkthrough({
  episode,
  tracks,
  onClose,
  onTellMeAbout,
}: EpisodeWalkthroughProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const createPlaylist = useMutation(api.playlists.create);
  const audioPlayer = useAudioPlayer();

  const handleExport = async (platform: "spotify" | "apple" | "youtube" | "m3u") => {
    setIsExporting(true);
    try {
      const playlistId = await createPlaylist({
        title: episode.title,
        trackIds: tracks.map((t) => t._id),
        generatedFrom: { type: "episode_export", episodeId: episode._id },
      });
      setExportResult(`Playlist created! ${tracks.length} tracks ready for ${platform}.`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Episode header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-editorial text-lg text-cream">{episode.title}</h2>
            {episode.airDate && (
              <p className="text-sleeve text-xs font-data mt-1">{episode.airDate}</p>
            )}
            {episode.description && (
              <p className="text-sleeve text-sm mt-2 leading-relaxed">{episode.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-sleeve hover:text-cream transition-colors p-1"
            aria-label="Close walkthrough"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
            </svg>
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            onClick={onTellMeAbout}
            className="bg-amber text-walnut hover:bg-amber/80 text-sm"
          >
            Tell me about this episode
          </Button>
          <div className="relative group">
            <Button
              variant="outline"
              className="text-vinyl-blue border-vinyl-blue hover:bg-vinyl-blue hover:text-walnut text-sm"
              disabled={isExporting}
            >
              {isExporting ? "Exporting..." : "Export Playlist"}
            </Button>
            <div className="absolute top-full left-0 mt-1 bg-wood border border-edge rounded-md shadow-lg hidden group-hover:block z-10 min-w-[160px]">
              {(["spotify", "apple", "youtube", "m3u"] as const).map((platform) => (
                <button
                  key={platform}
                  onClick={() => handleExport(platform)}
                  className="block w-full text-left px-3 py-2 text-sm text-cream hover:bg-shelf transition-colors"
                >
                  {platform === "m3u" ? "Download .m3u" : `Export to ${platform.charAt(0).toUpperCase() + platform.slice(1)}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {exportResult && (
          <p className="text-led-green text-xs font-data">{exportResult}</p>
        )}

        {/* Tracklist */}
        <div className="space-y-1">
          <h3 className="label-uppercase text-[11px] text-sleeve mb-2">
            Tracklist ({tracks.length} tracks)
          </h3>
          {tracks.map((track, i) => (
            <div
              key={track._id}
              className="flex items-center gap-3 p-2 rounded hover:bg-shelf transition-colors group"
            >
              <span className="text-shadow text-xs font-data w-5 text-right">{i + 1}</span>
              {track.albumArtUrl ? (
                <img
                  src={track.albumArtUrl}
                  alt=""
                  className="w-8 h-8 rounded object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-shelf" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-cream text-sm truncate">{track.title}</p>
                <p className="text-sleeve text-xs truncate">{track.artistName}</p>
              </div>
              {track.youtubeVideoId && (
                <button
                  onClick={() => audioPlayer?.play(track.youtubeVideoId!)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-amber hover:text-amber/80"
                  aria-label={`Play ${track.title}`}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 2l10 6-10 6V2z" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
```

**Step 2: Wire walkthrough mode into page.tsx**

Add state for walkthrough mode in `src/app/page.tsx`. When `selectedEpisodeId` is set and `episodeWithTracks` loads, show `EpisodeWalkthrough` instead of `StoryStream`.

In `src/app/page.tsx`, add:
- Import `EpisodeWalkthrough`
- Add `walkthroughMode` state: `true` when user selects episode from sidebar
- Pass `onTellMeAbout` that starts recording + sends text context to agent
- Pass `onClose` that clears `selectedEpisodeId` and `walkthroughMode`

```tsx
// In page.tsx, add to imports:
import { EpisodeWalkthrough } from "@/components/stream/episode-walkthrough";

// Add state:
const [walkthroughMode, setWalkthroughMode] = useState(false);

// When episode selected from sidebar:
const handleEpisodeSelect = useCallback((id: Id<"episodes">) => {
  setSelectedEpisodeId(id);
  setWalkthroughMode(true);
}, []);

// Close walkthrough:
const handleCloseWalkthrough = useCallback(() => {
  setSelectedEpisodeId(undefined);
  setWalkthroughMode(false);
}, []);

// Tell me about handler — starts agent with episode context:
const handleTellMeAbout = useCallback(() => {
  setWalkthroughMode(false); // Switch back to stream
  agent.startRecording(); // Open mic
  // Episode context is already loaded via selectedEpisodeId
}, [agent]);

// In JSX, replace stream prop:
stream={
  walkthroughMode && episodeWithTracks ? (
    <EpisodeWalkthrough
      episode={episodeWithTracks}
      tracks={episodeWithTracks.tracks || []}
      onClose={handleCloseWalkthrough}
      onTellMeAbout={handleTellMeAbout}
    />
  ) : (
    <StoryStream items={storyItems} />
  )
}
```

**Step 3: Update EpisodeSidebar callback**

Pass `handleEpisodeSelect` instead of raw `setSelectedEpisodeId`:
```tsx
<EpisodeSidebar
  onEpisodeSelect={handleEpisodeSelect}
  ...
/>
```

**Step 4: Verify walkthrough mode**

Run: `npx next dev`
Expected: Click episode in sidebar → walkthrough replaces story stream. Click X → returns to stream. Tracklist shows with play buttons.

**Step 5: Commit**

```bash
git add src/components/stream/episode-walkthrough.tsx src/components/stream/story-stream.tsx src/app/page.tsx
git commit -m "feat: episode walkthrough mode with playable tracklist and playlist export"
```

---

## Day 2 (Mar 13): Creative Storyteller

### Task 3: Scene Image Generation Tool (Agent Backend)

**Files:**
- Create: `agent/extended_play/tools/images.py`
- Modify: `agent/extended_play/agent.py`

**Step 1: Create the generate_scene_image tool**

```python
# agent/extended_play/tools/images.py
"""Scene illustration generator using Gemini 3.1 Flash Image Preview."""

import base64
import os
from google import genai


async def generate_scene_image(
    artists: str,
    era: str = "",
    genre: str = "",
    mood: str = "",
    context: str = "",
) -> dict:
    """Generate a stylized illustration for a music story scene.

    Args:
        artists: Artist names relevant to the scene.
        era: Time period (e.g., "1970s Lagos", "2020s London").
        genre: Musical genre context.
        mood: Visual mood (e.g., "warm", "electric", "contemplative").
        context: Narrative context for the illustration.

    Returns:
        dict with status, imageData (base64), and caption.
    """
    prompt = (
        f"Create a stylized editorial illustration in a vintage concert poster aesthetic. "
        f"Warm tones, muted gold and walnut palette, textured paper feel. "
        f"Scene: {context or f'{artists} in the {era} {genre} scene'}. "
        f"Mood: {mood or 'warm and evocative'}. "
        f"Style: Screen-printed gig poster, no text, no words, no letters. "
        f"Artists referenced (for visual inspiration only): {artists}."
    )

    try:
        use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "False").lower() == "true"
        if use_vertex:
            client = genai.Client(
                vertexai=True,
                project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
                location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
            )
        else:
            client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))

        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash-preview-image-generation",
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )

        # Extract image from response
        for part in response.candidates[0].content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                image_b64 = base64.b64encode(part.inline_data.data).decode()
                caption = context or f"{artists} — {era} {genre}"
                return {
                    "status": "success",
                    "imageData": image_b64,
                    "mimeType": part.inline_data.mime_type,
                    "caption": caption,
                }

        return {"status": "error", "message": "No image generated"}

    except Exception as e:
        return {"status": "error", "message": str(e)}
```

**Step 2: Register tool in agent.py**

```python
# In agent/extended_play/agent.py, add:
from .tools.images import generate_scene_image

# Add to tools list:
tools=[
    explore_artist,
    get_connections,
    search_artists,
    get_bridge_artists,
    list_episodes,
    get_episode,
    search_reviews,
    seed_artist_corpus,
    create_playlist,
    add_to_playlist,
    generate_scene_image,  # NEW
],
```

**Step 3: Commit**

```bash
git add agent/extended_play/tools/images.py agent/extended_play/agent.py
git commit -m "feat: generate_scene_image tool using Gemini 3.1 Flash Image Preview"
```

---

### Task 4: SceneImageCard + Story Stream Integration

**Files:**
- Create: `src/components/stream/scene-image-card.tsx`
- Modify: `src/components/stream/story-stream.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create SceneImageCard component**

```tsx
// src/components/stream/scene-image-card.tsx
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
    <div className="rounded-lg overflow-hidden bg-wood border border-edge">
      <img
        src={`data:${mimeType};base64,${imageData}`}
        alt={caption || "Scene illustration"}
        className={`w-full transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
      />
      {caption && (
        <p className="px-3 py-2 text-sleeve text-xs font-data italic">{caption}</p>
      )}
    </div>
  );
}
```

**Step 2: Add show_image handler to story stream**

In `src/components/stream/story-stream.tsx`, add the new card type:

```tsx
// Add import:
import { SceneImageCard } from "./scene-image-card";

// Add case in the switch:
case "show_image": {
  const imgData = item as Record<string, unknown>;
  return (
    <SceneImageCard
      key={i}
      imageData={imgData.imageData as string}
      mimeType={imgData.mimeType as string | undefined}
      caption={imgData.caption as string | undefined}
    />
  );
}
```

**Step 3: Add show_image event handler in page.tsx**

In `src/app/page.tsx`, inside `handleAgentEvent`:

```tsx
case "show_image":
  setStoryItems((prev) => [...prev, event]);
  break;
```

**Step 4: Commit**

```bash
git add src/components/stream/scene-image-card.tsx src/components/stream/story-stream.tsx src/app/page.tsx
git commit -m "feat: SceneImageCard component for inline AI-generated illustrations"
```

---

### Task 5: Rich Visual Cards Upgrade

**Files:**
- Modify: `src/components/stream/artist-card.tsx`
- Create: `src/components/stream/connection-evidence-card.tsx`
- Create: `src/components/stream/sonic-comparison-card.tsx`
- Modify: `src/components/stream/story-stream.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create ConnectionEvidenceCard**

```tsx
// src/components/stream/connection-evidence-card.tsx
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
    <div className="bg-wood border border-edge rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded bg-vinyl-blue/20 flex items-center justify-center">
          <span className="text-vinyl-blue text-[10px] font-data">
            {publication.charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="text-sleeve text-xs font-data uppercase">{publication}</span>
      </div>
      <blockquote className="text-cream text-sm italic leading-relaxed border-l-2 border-amber pl-3">
        "{excerpt}"
      </blockquote>
      {artistNames && artistNames.length > 0 && (
        <div className="flex gap-1 mt-2">
          {artistNames.map((name) => (
            <span key={name} className="text-[10px] font-data px-1.5 py-0.5 bg-shelf rounded text-sleeve">
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
          className="text-vinyl-blue text-xs font-data mt-2 inline-block hover:underline"
        >
          Read full article →
        </a>
      )}
    </div>
  );
}
```

**Step 2: Create SonicComparisonCard using Recharts**

```tsx
// src/components/stream/sonic-comparison-card.tsx
"use client";

import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Legend } from "recharts";

interface SonicProfile {
  name: string;
  energy?: number;
  danceability?: number;
  valence?: number;
  acousticness?: number;
  instrumentalness?: number;
  tempo?: number;
}

interface SonicComparisonCardProps {
  artist1: SonicProfile;
  artist2: SonicProfile;
}

const DIMENSIONS = ["energy", "danceability", "valence", "acousticness", "instrumentalness"] as const;

export function SonicComparisonCard({ artist1, artist2 }: SonicComparisonCardProps) {
  const data = DIMENSIONS.map((dim) => ({
    dimension: dim.charAt(0).toUpperCase() + dim.slice(1),
    [artist1.name]: (artist1[dim] ?? 0.5) * 100,
    [artist2.name]: (artist2[dim] ?? 0.5) * 100,
  }));

  return (
    <div className="bg-wood border border-edge rounded-lg p-3">
      <h4 className="text-sleeve text-xs font-data uppercase mb-2">Sonic Comparison</h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid stroke="#3a332d" />
            <PolarAngleAxis dataKey="dimension" tick={{ fill: "#8a7e6e", fontSize: 10 }} />
            <Radar
              name={artist1.name}
              dataKey={artist1.name}
              stroke="#DCA54A"
              fill="#DCA54A"
              fillOpacity={0.2}
            />
            <Radar
              name={artist2.name}
              dataKey={artist2.name}
              stroke="#7ca5b8"
              fill="#7ca5b8"
              fillOpacity={0.2}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: "#8a7e6e" }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

**Step 3: Register new card types in story-stream.tsx**

Add imports for `ConnectionEvidenceCard` and `SonicComparisonCard`, then add switch cases:

```tsx
case "show_evidence": {
  const evData = item.data as Record<string, unknown> | undefined;
  return (
    <ConnectionEvidenceCard
      key={i}
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
      key={i}
      artist1={cmpData?.artist1 as any}
      artist2={cmpData?.artist2 as any}
    />
  );
}
```

**Step 4: Add event handlers in page.tsx**

```tsx
case "show_evidence":
case "show_sonic_comparison":
  setStoryItems((prev) => [...prev, event]);
  break;
```

**Step 5: Commit**

```bash
git add src/components/stream/connection-evidence-card.tsx src/components/stream/sonic-comparison-card.tsx src/components/stream/story-stream.tsx src/app/page.tsx
git commit -m "feat: connection evidence cards and sonic radar comparison"
```

---

## Day 3 (Mar 14): ADK Runner + Voice UX + Text Chat

### Task 6: ADK Runner/Queue Backend Rewrite

**Files:**
- Rewrite: `agent/main.py`
- Delete: `agent/extended_play/live_session.py`

**Step 1: Rewrite agent/main.py with ADK Runner pattern**

This replaces the raw `genai.Client` approach with the official ADK `Runner` + `LiveRequestQueue` pattern from the bidi-demo reference.

```python
"""FastAPI server with ADK Runner/LiveRequestQueue for bidi-streaming."""

import asyncio
import json
import os
import base64
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.genai.types import (
    AudioTranscriptionConfig,
    LiveConnectConfig,
    Modality,
)
from google.adk.agents.live_request_queue import LiveRequestQueue

from extended_play.agent import root_agent

APP_NAME = "extended_play"
session_service = InMemorySessionService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Extended Play Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "extended-play-agent"}


@app.websocket("/ws/{user_id}/{session_id}")
async def websocket_endpoint(ws: WebSocket, user_id: str, session_id: str):
    await ws.accept()

    # Create or resume session
    session = await session_service.get_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id,
    )
    if session is None:
        session = await session_service.create_session(
            app_name=APP_NAME, user_id=user_id, session_id=session_id,
        )

    live_request_queue = LiveRequestQueue()

    runner = Runner(
        agent=root_agent,
        app_name=APP_NAME,
        session_service=session_service,
    )

    run_config = RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=[Modality.AUDIO],
        input_audio_transcription=AudioTranscriptionConfig(),
        output_audio_transcription=AudioTranscriptionConfig(),
    )

    async def upstream_task():
        """Receive from WebSocket, push to LiveRequestQueue."""
        try:
            while True:
                try:
                    # Try binary first (raw audio)
                    data = await ws.receive()
                except WebSocketDisconnect:
                    break

                if "bytes" in data and data["bytes"]:
                    # Raw PCM audio bytes
                    live_request_queue.send_realtime(data["bytes"])
                elif "text" in data and data["text"]:
                    msg = json.loads(data["text"])

                    if msg.get("type") == "text":
                        # Text input
                        from google.genai.types import Content, Part
                        content = Content(
                            role="user",
                            parts=[Part(text=msg["text"])],
                        )
                        live_request_queue.send_content(content)

                    elif msg.get("type") == "audio":
                        # Base64-encoded audio (fallback)
                        audio_bytes = base64.b64decode(msg["data"])
                        live_request_queue.send_realtime(audio_bytes)

                    elif msg.get("type") == "image":
                        # Image input (vision stretch goal)
                        from google.genai.types import Content, Part, Blob
                        image_bytes = base64.b64decode(msg["data"])
                        content = Content(
                            role="user",
                            parts=[Part(inline_data=Blob(
                                data=image_bytes,
                                mime_type=msg.get("mimeType", "image/jpeg"),
                            ))],
                        )
                        live_request_queue.send_content(content)

                    elif msg.get("type") == "stop":
                        break
        finally:
            live_request_queue.close()

    async def downstream_task():
        """run_live yields Events; serialize and send to WebSocket."""
        try:
            async for event in runner.run_live(
                session=session,
                live_request_queue=live_request_queue,
                run_config=run_config,
            ):
                await _process_event(ws, event)
        except Exception as e:
            try:
                await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
            except Exception:
                pass

    # Run both tasks concurrently
    upstream = asyncio.create_task(upstream_task())
    downstream = asyncio.create_task(downstream_task())

    try:
        await asyncio.gather(upstream, downstream)
    except WebSocketDisconnect:
        pass
    finally:
        upstream.cancel()
        downstream.cancel()


async def _process_event(ws: WebSocket, event):
    """Extract audio, transcripts, tool results from ADK Events and emit to frontend."""
    try:
        # Check for audio parts
        if hasattr(event, "content") and event.content:
            for part in (event.content.parts or []):
                if hasattr(part, "inline_data") and part.inline_data:
                    audio_b64 = base64.b64encode(part.inline_data.data).decode()
                    await ws.send_text(json.dumps({
                        "type": "audio",
                        "data": audio_b64,
                        "mimeType": getattr(part.inline_data, "mime_type", "audio/pcm"),
                    }))
                elif hasattr(part, "text") and part.text:
                    await ws.send_text(json.dumps({
                        "type": "transcript",
                        "role": "agent",
                        "text": part.text,
                    }))

        # Check for input transcription (user speech-to-text)
        if hasattr(event, "input_transcription") and event.input_transcription:
            await ws.send_text(json.dumps({
                "type": "transcript",
                "role": "user",
                "text": event.input_transcription,
            }))

        # Check for output transcription (agent speech-to-text)
        if hasattr(event, "output_transcription") and event.output_transcription:
            await ws.send_text(json.dumps({
                "type": "transcript",
                "role": "agent",
                "text": event.output_transcription,
            }))

        # Check for interruption
        if hasattr(event, "interrupted") and event.interrupted:
            await ws.send_text(json.dumps({"type": "interrupted"}))

        # Check for tool calls — emit UI events
        if hasattr(event, "tool_calls") and event.tool_calls:
            for tc in event.tool_calls:
                # Emit activity indicator
                await ws.send_text(json.dumps({
                    "type": "agent_activity",
                    "tool": tc.name,
                    "status": "running",
                }))

        # Check for tool results — emit UI events
        if hasattr(event, "actions") and event.actions:
            if hasattr(event.actions, "tool_results"):
                for tr in (event.actions.tool_results or []):
                    await _emit_ui_event(ws, tr)

    except Exception:
        pass


async def _emit_ui_event(ws: WebSocket, tool_result):
    """Translate tool results into frontend UI events."""
    try:
        name = getattr(tool_result, "name", "")
        result = getattr(tool_result, "result", {})
        if isinstance(result, str):
            result = json.loads(result)

        if result.get("status") != "success":
            return

        if name == "explore_artist":
            artist = result.get("artist", {})
            await ws.send_text(json.dumps({
                "type": "show_artist",
                "artistId": artist.get("_id"),
                "data": artist,
            }))
            if artist.get("_id"):
                await ws.send_text(json.dumps({
                    "type": "highlight_node",
                    "artistId": artist["_id"],
                }))

        elif name == "get_connections":
            subgraph = result.get("subgraph", {})
            nodes = subgraph.get("nodes", [])
            if nodes:
                await ws.send_text(json.dumps({
                    "type": "navigate_graph",
                    "centerId": nodes[0].get("id"),
                    "nodes": nodes,
                    "edges": subgraph.get("edges", []),
                }))

        elif name == "get_episode":
            episode = result.get("episode", {})
            await ws.send_text(json.dumps({
                "type": "show_episode",
                "episodeId": episode.get("_id"),
                "data": episode,
            }))

        elif name == "search_reviews":
            reviews = result.get("reviews", [])
            for review in (reviews[:3] if isinstance(reviews, list) else []):
                await ws.send_text(json.dumps({
                    "type": "show_evidence",
                    "data": {
                        "publication": review.get("publication", ""),
                        "excerpt": review.get("excerpt", ""),
                        "url": review.get("url"),
                        "artistNames": review.get("artistNames", []),
                    },
                }))

        elif name == "generate_scene_image":
            await ws.send_text(json.dumps({
                "type": "show_image",
                "imageData": result.get("imageData"),
                "mimeType": result.get("mimeType"),
                "caption": result.get("caption"),
            }))

        elif name == "create_playlist":
            await ws.send_text(json.dumps({
                "type": "create_playlist",
                "playlistId": result.get("playlist_id") or result.get("playlistId"),
                "title": result.get("title", "My Crate"),
            }))

        elif name == "add_to_playlist":
            await ws.send_text(json.dumps({
                "type": "add_to_playlist",
                "trackId": result.get("track_id"),
                "playlistId": result.get("playlist_id"),
            }))

    except Exception:
        pass


# Backward-compatible /ws endpoint (redirects to default user/session)
@app.websocket("/ws")
async def websocket_endpoint_compat(ws: WebSocket):
    await websocket_endpoint(ws, user_id="default", session_id="default")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

**Step 2: Delete live_session.py**

```bash
rm agent/extended_play/live_session.py
```

**Step 3: Verify agent starts**

```bash
cd agent && python -m uvicorn main:app --reload --port 8000
```
Expected: Server starts, `/health` returns OK.

**Step 4: Commit**

```bash
git add agent/main.py
git rm agent/extended_play/live_session.py
git commit -m "feat: replace raw genai.Client with ADK Runner/LiveRequestQueue pattern"
```

---

### Task 7: Frontend WebSocket Upgrade for ADK

**Files:**
- Modify: `src/hooks/use-agent-connection.ts`
- Modify: `src/app/page.tsx`

**Step 1: Rewrite use-agent-connection.ts**

Upgrade to support: raw binary audio frames, text input, image input, ADK event parsing, session IDs.

```tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

type AgentState = "idle" | "listening" | "agent_thinking" | "agent_speaking";

interface UseAgentConnectionOptions {
  agentUrl: string;
  onEvent: (event: AgentEvent) => void;
  userId?: string;
  sessionId?: string;
}

export function useAgentConnection({
  agentUrl,
  onEvent,
  userId = "default",
  sessionId,
}: UseAgentConnectionOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [transcript, setTranscript] = useState<{ role: string; text: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const sessionIdRef = useRef(sessionId || crypto.randomUUID());

  // Build WS URL with user/session path
  const getWsUrl = useCallback(() => {
    const base = agentUrl.replace(/\/ws\/?$/, "");
    return `${base}/ws/${userId}/${sessionIdRef.current}`;
  }, [agentUrl, userId]);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.binaryType = "arraybuffer";

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      setIsRecording(false);
      setAgentState("idle");
    };

    ws.onmessage = async (event) => {
      // Binary data = audio response
      if (event.data instanceof ArrayBuffer) {
        setAgentState("agent_speaking");
        await playAudioBytes(new Uint8Array(event.data));
        return;
      }

      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case "audio":
          setAgentState("agent_speaking");
          await playAudioBase64(msg.data);
          break;
        case "transcript":
          setTranscript({ role: msg.role, text: msg.text });
          if (msg.role === "agent") setAgentState("agent_speaking");
          onEvent(msg);
          break;
        case "interrupted":
          stopPlayback();
          setAgentState("listening");
          onEvent(msg);
          break;
        case "agent_activity":
          setAgentState("agent_thinking");
          onEvent(msg);
          break;
        default:
          onEvent(msg);
          break;
      }
    };
  }, [getWsUrl, onEvent]);

  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    mediaStreamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);

    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Send as raw binary (preferred) or base64 fallback
      try {
        wsRef.current.send(pcm16.buffer);
      } catch {
        // Fallback to base64 JSON
        const bytes = new Uint8Array(pcm16.buffer);
        const b64 = btoa(String.fromCharCode(...bytes));
        wsRef.current.send(JSON.stringify({ type: "audio", data: b64 }));
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    setIsRecording(true);
    setAgentState("listening");
  }, [connect]);

  const stopRecording = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setIsRecording(false);
    setAgentState("idle");
  }, []);

  // Send text message
  const sendText = useCallback(async (text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }
    wsRef.current?.send(JSON.stringify({ type: "text", text }));
    setTranscript({ role: "user", text });
    setAgentState("agent_thinking");
    onEvent({ type: "transcript", role: "user", text });
  }, [connect, onEvent]);

  // Play base64-encoded PCM audio
  const playAudioBase64 = async (b64Data: string) => {
    const binaryStr = atob(b64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    await playAudioBytes(bytes);
  };

  const playAudioBytes = async (bytes: Uint8Array) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = playbackContextRef.current;

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x8000;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  };

  const stopPlayback = () => {
    playbackContextRef.current?.close();
    playbackContextRef.current = null;
  };

  const disconnect = useCallback(() => {
    stopRecording();
    stopPlayback();
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "stop" }));
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [stopRecording]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    isConnected,
    isRecording,
    agentState,
    transcript,
    connect,
    startRecording,
    stopRecording,
    sendText,
    disconnect,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-agent-connection.ts
git commit -m "feat: upgrade WebSocket hook for ADK events, binary audio, text/image input"
```

---

### Task 8: Voice Bar Upgrade + Text Chat Input

**Files:**
- Modify: `src/components/voice/voice-bar.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Rewrite VoiceBar with state machine and text input**

```tsx
// src/components/voice/voice-bar.tsx
"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

type AgentState = "idle" | "listening" | "agent_thinking" | "agent_speaking";

interface VoiceBarProps {
  isConnected: boolean;
  isRecording: boolean;
  agentState: AgentState;
  transcript: { role: string; text: string } | null;
  onToggleRecording: () => void;
  onSendText: (text: string) => void;
}

export function VoiceBar({
  isConnected,
  isRecording,
  agentState,
  transcript,
  onToggleRecording,
  onSendText,
}: VoiceBarProps) {
  const [textInput, setTextInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && textInput.trim()) {
      onSendText(textInput.trim());
      setTextInput("");
    }
  };

  return (
    <header className="h-14 flex items-center px-4 border-b border-edge bg-wood flex-shrink-0 gap-3">
      {/* Connection indicator */}
      <div
        className={cn(
          "w-2 h-2 rounded-full flex-shrink-0",
          isConnected ? "bg-led-green" : "bg-skip-red"
        )}
        title={isConnected ? "Connected" : "Disconnected"}
      />

      {/* Mic button with state-dependent ring */}
      <button
        onClick={onToggleRecording}
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 relative",
          isRecording
            ? "bg-gold text-walnut"
            : "bg-shelf text-sleeve hover:text-cream hover:bg-edge"
        )}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {/* Pulsing ring when listening */}
        {agentState === "listening" && (
          <span className="absolute inset-0 rounded-full border-2 border-gold animate-ping opacity-40" />
        )}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          {isRecording ? (
            <rect x="4" y="4" width="8" height="8" rx="1" />
          ) : (
            <path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V3a2 2 0 0 1 2-2zm-3 6a3 3 0 1 0 6 0h1a4 4 0 0 1-3.5 3.97V13H10v1H6v-1h1.5v-2.03A4 4 0 0 1 4 7h1z" />
          )}
        </svg>
      </button>

      {/* Agent state indicator */}
      {agentState === "agent_thinking" && (
        <div className="flex gap-1 items-center flex-shrink-0">
          <span className="w-1.5 h-1.5 bg-amber rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 bg-amber rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 bg-amber rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      )}

      {/* Transcript / Text input area */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {transcript && !textInput ? (
          <p className="text-cream text-sm truncate flex-1">
            <span className="label-uppercase text-[10px] text-sleeve mr-1.5">
              {transcript.role === "user" ? "You" : "Curator"}
            </span>
            {transcript.text}
          </p>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "Listening..." : "Type a message..."}
            className="flex-1 bg-transparent text-cream text-sm placeholder:text-shadow outline-none"
          />
        )}
      </div>

      {/* Send text button (visible when there's text) */}
      {textInput.trim() && (
        <button
          onClick={() => {
            onSendText(textInput.trim());
            setTextInput("");
          }}
          className="text-amber hover:text-amber/80 flex-shrink-0"
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 1l14 7-14 7V9l10-1-10-1V1z" />
          </svg>
        </button>
      )}

      {/* Brand mark */}
      <span className="label-uppercase text-[10px] text-sleeve hidden md:block flex-shrink-0">
        Extended Play
      </span>
    </header>
  );
}
```

**Step 2: Wire up in page.tsx**

Update VoiceBar props in `src/app/page.tsx`:

```tsx
<VoiceBar
  isConnected={agent.isConnected}
  isRecording={agent.isRecording}
  agentState={agent.agentState}
  transcript={agent.transcript}
  onToggleRecording={handleToggleRecording}
  onSendText={agent.sendText}
/>
```

**Step 3: Commit**

```bash
git add src/components/voice/voice-bar.tsx src/app/page.tsx
git commit -m "feat: voice bar state machine + text chat input alongside mic"
```

---

### Task 9: Agent Activity Indicators in Story Stream

**Files:**
- Create: `src/components/stream/activity-indicator.tsx`
- Modify: `src/components/stream/story-stream.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create ActivityIndicator component**

```tsx
// src/components/stream/activity-indicator.tsx
"use client";

const TOOL_LABELS: Record<string, string> = {
  explore_artist: "Looking up artist...",
  get_connections: "Tracing connections...",
  search_artists: "Searching artists...",
  get_bridge_artists: "Finding bridge artists...",
  search_reviews: "Searching reviews...",
  generate_scene_image: "Generating illustration...",
  get_episode: "Loading episode...",
  create_playlist: "Creating playlist...",
  add_to_playlist: "Adding to playlist...",
  seed_artist_corpus: "Building knowledge...",
};

interface ActivityIndicatorProps {
  tool: string;
}

export function ActivityIndicator({ tool }: ActivityIndicatorProps) {
  const label = TOOL_LABELS[tool] || `Working on ${tool}...`;

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 animate-pulse">
      <div className="w-1.5 h-1.5 bg-amber rounded-full animate-ping" />
      <span className="text-sleeve text-xs font-data">{label}</span>
    </div>
  );
}
```

**Step 2: Add activity items to story stream**

In `story-stream.tsx`, add:
```tsx
import { ActivityIndicator } from "./activity-indicator";

// In the switch:
case "agent_activity":
  return <ActivityIndicator key={i} tool={item.tool as string} />;
```

In `page.tsx` `handleAgentEvent`:
```tsx
case "agent_activity":
  // Add transient indicator — remove when next result arrives
  setStoryItems((prev) => {
    // Remove previous activity indicators
    const filtered = prev.filter((item) => item.type !== "agent_activity");
    return [...filtered, event];
  });
  break;
```

Also, when any result card arrives (show_artist, show_episode, etc.), clear activity indicators:
```tsx
// At the top of the relevant cases, add:
setStoryItems((prev) => prev.filter((item) => item.type !== "agent_activity"));
```

**Step 3: Commit**

```bash
git add src/components/stream/activity-indicator.tsx src/components/stream/story-stream.tsx src/app/page.tsx
git commit -m "feat: agent activity indicators in story stream"
```

---

## Day 4 (Mar 15): Demo Flow + Stretch Goals

### Task 10: Demo Polish — Remove Test Seeds + Welcome State

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Remove test seed data**

In `page.tsx`, change the `storyItems` initial state from the test array to empty:

```tsx
const [storyItems, setStoryItems] = useState<AgentEvent[]>([]);
```

**Step 2: Add welcome overlay state**

```tsx
const [showWelcome, setShowWelcome] = useState(true);

// In the JSX, add overlay:
{showWelcome && (
  <div
    className="absolute inset-0 z-50 flex items-center justify-center bg-walnut/90 backdrop-blur-sm cursor-pointer"
    onClick={() => setShowWelcome(false)}
  >
    <div className="text-center">
      <h1 className="font-editorial text-4xl text-cream mb-2">Extended Play</h1>
      <p className="text-sleeve text-sm">20 years of music connections.</p>
      <p className="text-shadow text-xs mt-4">Click anywhere to explore</p>
    </div>
  </div>
)}
```

**Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: welcome overlay and remove test seed data"
```

---

### Task 11: Vision Camera Button (Stretch Goal)

**Files:**
- Modify: `src/components/voice/voice-bar.tsx`
- Modify: `src/hooks/use-agent-connection.ts`

**Step 1: Add camera capture to VoiceBar**

Add a camera button next to the mic that captures a photo from the device camera:

```tsx
// Add to VoiceBar props:
onSendImage?: (base64: string, mimeType: string) => void;

// Add camera button in JSX (next to mic):
{onSendImage && (
  <button
    onClick={async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);

        stream.getTracks().forEach((t) => t.stop());

        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        const base64 = dataUrl.split(",")[1];
        onSendImage(base64, "image/jpeg");
      } catch {
        // Camera not available — fail silently
      }
    }}
    className="w-9 h-9 rounded-full flex items-center justify-center bg-shelf text-sleeve hover:text-cream hover:bg-edge flex-shrink-0"
    aria-label="Take photo"
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.5 1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V2h3A1.5 1.5 0 0 1 14 3.5v8a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-8A1.5 1.5 0 0 1 3.5 2h3V1.5zM8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    </svg>
  </button>
)}
```

**Step 2: Add sendImage to use-agent-connection.ts**

```tsx
const sendImage = useCallback(async (base64: string, mimeType: string) => {
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
    await connect();
  }
  wsRef.current?.send(JSON.stringify({ type: "image", data: base64, mimeType }));
  setAgentState("agent_thinking");
}, [connect]);

// Add to return:
return { ..., sendImage };
```

**Step 3: Wire in page.tsx**

```tsx
<VoiceBar
  ...
  onSendImage={agent.sendImage}
/>
```

**Step 4: Commit**

```bash
git add src/components/voice/voice-bar.tsx src/hooks/use-agent-connection.ts src/app/page.tsx
git commit -m "feat: vision camera button for image input (stretch goal)"
```

---

### Task 12: End-to-End Integration Test

**Step 1: Start all services**

Terminal 1: `npx convex dev`
Terminal 2: `cd agent && python -m uvicorn main:app --reload --port 8000`
Terminal 3: `npx next dev`

**Step 2: Manual test checklist**

- [ ] `/admin` — All 3 tabs render, ingest a test playlist, verify enrichment monitor updates
- [ ] Home — Welcome overlay appears, click dismisses
- [ ] Click episode in sidebar → walkthrough mode with tracklist
- [ ] Click "Tell me about" → mic activates, agent responds
- [ ] Type text in voice bar → agent responds via stream
- [ ] Agent calls `explore_artist` → artist card appears, graph highlights
- [ ] Agent calls `get_connections` → graph navigates
- [ ] Agent calls `generate_scene_image` → illustration fades in (if model available)
- [ ] Activity indicators appear during tool calls
- [ ] Barge-in works (interrupt agent mid-speech)
- [ ] Export playlist button creates playlist

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes"
```

---

## Day 5 (Mar 16): Video + Deploy + Submit

### Task 13: Cloud Run Deploy

**Step 1: Build and push agent container**

```bash
cd agent
gcloud builds submit --tag gcr.io/PROJECT_ID/extended-play-agent
gcloud run deploy extended-play-agent \
  --image gcr.io/PROJECT_ID/extended-play-agent \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=true"
```

**Step 2: Update frontend env**

Set `NEXT_PUBLIC_AGENT_WS_URL` to the Cloud Run WebSocket URL.

**Step 3: Deploy frontend**

```bash
npx vercel --prod
```

**Step 4: Commit deploy config**

```bash
git add .
git commit -m "chore: deploy configuration for Cloud Run + Vercel"
```

---

### Task 14: Record Demo Video (4 minutes)

Follow the demo script from the design doc:

| Time | Beat | Action |
|------|------|--------|
| 0:00-0:15 | Open | Full graph floating, welcome overlay |
| 0:15-1:00 | Episode | Click episode, walkthrough, play preview, export |
| 1:00-2:30 | Conversation | Mic on, ask about artist → cards + graph + illustration |
| 2:30-3:30 | Follow thread | Ask connection question, graph traces path |
| 3:30-3:50 | Build crate | "Build me a playlist" |
| 3:50-4:00 | Close | Pull back to full graph |

---

### Task 15: Devpost Submission

- Upload demo video
- Write project description highlighting:
  - ADK Runner/Queue pattern (Live Agent compliance)
  - 5-modality interleaved output (Creative Storyteller)
  - 6-source enrichment pipeline
  - 20 years of Rhythm Lab Radio data
- Tag technologies: Gemini 2.5 Flash, Gemini 3.1 Flash Image, ADK, Cloud Run, Convex

---

## Summary

| Day | Tasks | Key Deliverables |
|-----|-------|-----------------|
| 1 | 1-2 | Admin 3-panel dashboard, Episode walkthrough with export |
| 2 | 3-5 | Scene image generation, SceneImageCard, evidence cards, sonic radar |
| 3 | 6-9 | ADK Runner rewrite, WebSocket upgrade, voice bar state machine, text chat, activity indicators |
| 4 | 10-12 | Welcome overlay, vision camera, end-to-end testing |
| 5 | 13-15 | Cloud Run deploy, demo video, Devpost submission |
