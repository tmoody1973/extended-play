# Extended Play Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Python ADK agent with Gemini Live API voice + Convex-backed tools, connect it to the Next.js frontend via WebSocket, and deploy both to Google Cloud Run.

**Architecture:** Python ADK agent on Cloud Run exposes a WebSocket endpoint. Browser sends audio, agent routes through Gemini Live API for voice + tool calling, returns audio + structured UI events. Frontend renders events into story stream, graph highlights, and playlist updates.

**Tech Stack:** Python 3.13, Google ADK, Gemini Live API, FastAPI, httpx, Next.js 16, Cloud Run, Convex

---

### Task 1: Scaffold the Python Agent Project

**Files:**
- Create: `agent/extended_play/__init__.py`
- Create: `agent/extended_play/agent.py`
- Create: `agent/extended_play/prompts.py`
- Create: `agent/extended_play/convex_client.py`
- Create: `agent/requirements.txt`
- Create: `agent/.env.example`
- Create: `agent/README.md`

**Step 1: Create agent directory structure**

```bash
mkdir -p agent/extended_play/tools
```

**Step 2: Create `agent/requirements.txt`**

```txt
google-adk>=1.14.0
google-genai>=1.0.0
httpx>=0.27.0
python-dotenv>=1.0.0
```

**Step 3: Create `agent/.env.example`**

```bash
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_GENAI_USE_VERTEXAI=True
CONVEX_URL=https://your-deployment.convex.cloud
```

**Step 4: Create `agent/extended_play/__init__.py`**

```python
from . import agent
```

**Step 5: Create `agent/extended_play/prompts.py`**

```python
SYSTEM_INSTRUCTION = """You are the curator of Extended Play, a Tokyo record bar built on 20 years of Rhythm Lab Radio playlists. You guide visitors through music connections — how artists influence each other across genres, decades, and continents.

When someone asks about an artist, explore their connections. Don't just list facts — tell the story. Use your tools to pull up artist cards, search journalism, and navigate the graph. Build playlists naturally as the conversation flows.

You speak warmly but concisely. You have opinions. When you find a surprising connection, show excitement. When an artist is underappreciated, advocate for them. Always ground your claims in the data — cite reviews, show the graph path, reference episodes.

For every response, think about what to SHOW alongside what you SAY:
- Call explore_artist to pull up artist cards with images and bio
- Call get_connections to trace paths between artists on the graph
- Call search_reviews to ground your claims in music journalism
- Call generate_scene_image when the moment calls for an evocative visual

Conversation starters you can offer:
- "Pick an episode from the archive and I'll walk you through it"
- "Name an artist and I'll show you who they're connected to"
- "Want me to build you a crate? Tell me a mood or a starting point"

Keep responses conversational. 2-3 sentences of narration per turn, with tool calls to show supporting content. Don't monologue."""
```

**Step 6: Create `agent/extended_play/convex_client.py`**

```python
"""HTTP client for calling Convex query/mutation/action functions."""

import os
import httpx

CONVEX_URL = os.environ.get("CONVEX_URL", "")


async def query(path: str, args: dict | None = None) -> dict:
    """Call a Convex query function via HTTP.

    Args:
        path: Function path like "queries:getArtistCard"
        args: Arguments to pass to the function

    Returns:
        The query result as a dict.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{CONVEX_URL}/api/query",
            json={"path": path, "args": args or {}},
            timeout=15.0,
        )
        resp.raise_for_status()
        return resp.json()


async def mutation(path: str, args: dict | None = None) -> dict:
    """Call a Convex mutation function via HTTP."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{CONVEX_URL}/api/mutation",
            json={"path": path, "args": args or {}},
            timeout=15.0,
        )
        resp.raise_for_status()
        return resp.json()


async def action(path: str, args: dict | None = None) -> dict:
    """Call a Convex action function via HTTP."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{CONVEX_URL}/api/action",
            json={"path": path, "args": args or {}},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()
```

**Step 7: Create `agent/extended_play/agent.py` (minimal, no tools yet)**

```python
from google.adk.agents import Agent
from .prompts import SYSTEM_INSTRUCTION

root_agent = Agent(
    model="gemini-2.0-flash-live-001",
    name="extended_play_curator",
    description="A Tokyo record bar curator who guides music discovery through voice conversation.",
    instruction=SYSTEM_INSTRUCTION,
    tools=[],
)
```

**Step 8: Create empty tool files**

```bash
touch agent/extended_play/tools/__init__.py
touch agent/extended_play/tools/graph.py
touch agent/extended_play/tools/episodes.py
touch agent/extended_play/tools/reviews.py
touch agent/extended_play/tools/playlists.py
touch agent/extended_play/tools/images.py
```

**Step 9: Test the agent starts locally**

```bash
cd agent
pip install -r requirements.txt
adk run extended_play
```

Type "hello" — agent should respond with a greeting in the curator persona. Ctrl+C to exit.

**Step 10: Commit**

```bash
git add agent/
git commit -m "feat: scaffold Python ADK agent with curator persona"
```

---

### Task 2: Convex Client + Graph Tools

**Files:**
- Modify: `agent/extended_play/tools/graph.py`
- Modify: `agent/extended_play/agent.py`

**Step 1: Implement graph tools in `agent/extended_play/tools/graph.py`**

```python
"""Tools for exploring the artist knowledge graph."""

from ..convex_client import query


async def explore_artist(artist_name: str) -> dict:
    """Look up an artist by name and return their full profile including bio, genres, images, connections, and tracks.

    Args:
        artist_name: The name of the artist to explore.

    Returns:
        Artist profile with bio, genres, images, top connections, and tracks. Returns error if not found.
    """
    # First search for the artist by name
    results = await query("queries:searchArtists", {"query": artist_name})
    if not results:
        return {"status": "error", "message": f"No artist found matching '{artist_name}'"}

    artist_id = results[0]["id"]
    card = await query("queries:getArtistCard", {"artistId": artist_id})
    if not card:
        return {"status": "error", "message": f"Could not load artist card for '{artist_name}'"}

    return {"status": "success", "artist": card}


async def get_connections(artist_name: str, depth: int = 2) -> dict:
    """Get the subgraph of connections around an artist, showing how they relate to other artists.

    Args:
        artist_name: The name of the artist to center the graph on.
        depth: How many hops from the center artist to include (1-3). Default 2.

    Returns:
        Graph with nodes (artists) and edges (connections) around the specified artist.
    """
    results = await query("queries:searchArtists", {"query": artist_name})
    if not results:
        return {"status": "error", "message": f"No artist found matching '{artist_name}'"}

    artist_id = results[0]["id"]
    subgraph = await query("queries:getArtistSubgraph", {
        "artistId": artist_id,
        "depth": min(depth, 3),
    })

    return {"status": "success", "center": artist_name, "subgraph": subgraph}


async def search_artists(search_query: str) -> dict:
    """Search for artists by name. Use this when you need to find an artist before exploring them.

    Args:
        search_query: Search term (artist name or partial name, minimum 2 characters).

    Returns:
        List of matching artists with id, name, genres, and enrichment status.
    """
    results = await query("queries:searchArtists", {"query": search_query})
    return {"status": "success", "results": results}


async def get_bridge_artists(limit: int = 5) -> dict:
    """Get featured bridge artists — those who connect different musical communities.

    Args:
        limit: Number of bridge artists to return (1-10). Default 5.

    Returns:
        List of bridge artists with high betweenness centrality scores.
    """
    results = await query("queries:getBridgeArtists", {"limit": min(limit, 10)})
    return {"status": "success", "bridge_artists": results}
```

**Step 2: Register tools in `agent/extended_play/agent.py`**

```python
from google.adk.agents import Agent
from .prompts import SYSTEM_INSTRUCTION
from .tools.graph import explore_artist, get_connections, search_artists, get_bridge_artists

root_agent = Agent(
    model="gemini-2.0-flash-live-001",
    name="extended_play_curator",
    description="A Tokyo record bar curator who guides music discovery through voice conversation.",
    instruction=SYSTEM_INSTRUCTION,
    tools=[
        explore_artist,
        get_connections,
        search_artists,
        get_bridge_artists,
    ],
)
```

**Step 3: Test with `adk run`**

```bash
cd agent
adk run extended_play
```

Type: "Tell me about Fela Kuti" — agent should attempt to call `explore_artist`. May fail if Convex has no data, but verify the tool call is made.

**Step 4: Commit**

```bash
git add agent/
git commit -m "feat: add graph exploration tools (explore_artist, get_connections, search, bridges)"
```

---

### Task 3: Episode, Review, and Playlist Tools

**Files:**
- Modify: `agent/extended_play/tools/episodes.py`
- Modify: `agent/extended_play/tools/reviews.py`
- Modify: `agent/extended_play/tools/playlists.py`
- Modify: `agent/extended_play/agent.py`

**Step 1: Implement `agent/extended_play/tools/episodes.py`**

```python
"""Tools for browsing Rhythm Lab Radio episodes."""

from ..convex_client import query


async def list_episodes(limit: int = 10) -> dict:
    """List recent Rhythm Lab Radio episodes, most recent first.

    Args:
        limit: Number of episodes to return (1-20). Default 10.

    Returns:
        List of episodes with title, air date, track count, and description.
    """
    results = await query("queries:listEpisodes", {"limit": min(limit, 20)})
    return {"status": "success", "episodes": results}


async def get_episode(episode_id: str) -> dict:
    """Get full details of an episode including its complete tracklist with artist and album info.

    Args:
        episode_id: The Convex ID of the episode.

    Returns:
        Episode with title, air date, description, and full tracklist.
    """
    result = await query("queries:getEpisodeWithTracks", {"episodeId": episode_id})
    if not result:
        return {"status": "error", "message": "Episode not found"}
    return {"status": "success", "episode": result}
```

**Step 2: Implement `agent/extended_play/tools/reviews.py`**

```python
"""Tools for searching music journalism."""

from ..convex_client import action


async def search_reviews(topic: str, artist_names: list[str] | None = None) -> dict:
    """Search music journalism and reviews across 26 publications. Use this to ground claims about artists in critical writing.

    Args:
        topic: What to search for (e.g., "Fela Kuti influence on modern afrobeat").
        artist_names: Optional list of artist names to focus the search on.

    Returns:
        Top review excerpts with publication, author, and URL.
    """
    result = await action("reviewSearch:searchReviews", {
        "query": topic,
        "artistNames": artist_names or [],
        "maxResults": 5,
    })
    return {"status": "success", "reviews": result}
```

**Step 3: Implement `agent/extended_play/tools/playlists.py`**

```python
"""Tools for building and managing playlists (crates)."""

from ..convex_client import mutation, query


async def create_playlist(title: str, description: str = "") -> dict:
    """Create a new playlist (crate) for the listener.

    Args:
        title: Name of the playlist.
        description: Optional description of the playlist's theme.

    Returns:
        The created playlist with its ID.
    """
    result = await mutation("playlists:create", {
        "title": title,
        "description": description,
        "type": "agent_recommended",
    })
    return {"status": "success", "playlist": result}


async def add_to_playlist(playlist_id: str, track_id: str) -> dict:
    """Add a track to an existing playlist.

    Args:
        playlist_id: The Convex ID of the playlist.
        track_id: The Convex ID of the track to add.

    Returns:
        Confirmation of the addition.
    """
    await mutation("playlists:addTrack", {
        "playlistId": playlist_id,
        "trackId": track_id,
    })
    return {"status": "success", "message": "Track added to playlist"}
```

**Step 4: Register all tools in `agent/extended_play/agent.py`**

```python
from google.adk.agents import Agent
from .prompts import SYSTEM_INSTRUCTION
from .tools.graph import explore_artist, get_connections, search_artists, get_bridge_artists
from .tools.episodes import list_episodes, get_episode
from .tools.reviews import search_reviews
from .tools.playlists import create_playlist, add_to_playlist

root_agent = Agent(
    model="gemini-2.0-flash-live-001",
    name="extended_play_curator",
    description="A Tokyo record bar curator who guides music discovery through voice conversation.",
    instruction=SYSTEM_INSTRUCTION,
    tools=[
        explore_artist,
        get_connections,
        search_artists,
        get_bridge_artists,
        list_episodes,
        get_episode,
        search_reviews,
        create_playlist,
        add_to_playlist,
    ],
)
```

**Step 5: Test**

```bash
cd agent
adk run extended_play
```

Type: "What episodes do you have?" — should attempt `list_episodes` tool call.

**Step 6: Commit**

```bash
git add agent/
git commit -m "feat: add episode, review search, and playlist tools"
```

---

### Task 4: FastAPI WebSocket Server with Gemini Live Bidi-Streaming

**Files:**
- Create: `agent/main.py`
- Create: `agent/extended_play/live_session.py`

This is the most complex task. The server accepts WebSocket connections from the browser, manages a Gemini Live API session per connection, and relays audio + events bidirectionally.

**Step 1: Create `agent/extended_play/live_session.py`**

```python
"""Manages a Gemini Live API bidi-streaming session for one WebSocket connection."""

import asyncio
import json
import base64
import os
from google import genai

from .prompts import SYSTEM_INSTRUCTION
from .tools.graph import explore_artist, get_connections, search_artists, get_bridge_artists
from .tools.episodes import list_episodes, get_episode
from .tools.reviews import search_reviews
from .tools.playlists import create_playlist, add_to_playlist

# Map tool names to functions
TOOL_FUNCTIONS = {
    "explore_artist": explore_artist,
    "get_connections": get_connections,
    "search_artists": search_artists,
    "get_bridge_artists": get_bridge_artists,
    "list_episodes": list_episodes,
    "get_episode": get_episode,
    "search_reviews": search_reviews,
    "create_playlist": create_playlist,
    "add_to_playlist": add_to_playlist,
}

# Build tool declarations for Gemini
TOOL_DECLARATIONS = list(TOOL_FUNCTIONS.values())


class LiveSession:
    """Wraps a Gemini Live API session with tool calling support."""

    def __init__(self, send_to_client):
        """
        Args:
            send_to_client: async callable that sends a JSON message to the browser WebSocket.
        """
        self.send_to_client = send_to_client
        self.session = None
        self.client = None

    async def start(self):
        """Initialize the Gemini Live API session."""
        use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "False").lower() == "true"

        if use_vertex:
            self.client = genai.Client(
                vertexai=True,
                project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
                location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
            )
        else:
            self.client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))

        config = {
            "response_modalities": ["AUDIO"],
            "system_instruction": SYSTEM_INSTRUCTION,
            "tools": TOOL_DECLARATIONS,
        }

        self.session = await self.client.aio.live.connect(
            model="gemini-2.0-flash-live-001",
            config=config,
        )

    async def send_audio(self, audio_b64: str):
        """Send audio chunk from the browser to Gemini."""
        if not self.session:
            return
        audio_bytes = base64.b64decode(audio_b64)
        await self.session.send_realtime_input(
            audio={"data": base64.b64encode(audio_bytes).decode(), "mime_type": "audio/pcm;rate=16000"}
        )

    async def receive_loop(self):
        """Continuously receive from Gemini and forward to browser."""
        if not self.session:
            return

        async for response in self.session.receive():
            # Handle server content (audio, text, tool calls)
            if hasattr(response, "server_content") and response.server_content:
                content = response.server_content

                # Check for interruption
                if hasattr(content, "interrupted") and content.interrupted:
                    await self.send_to_client(json.dumps({"type": "interrupted"}))
                    continue

                # Process model turn parts
                if hasattr(content, "model_turn") and content.model_turn:
                    for part in content.model_turn.parts:
                        # Audio response
                        if hasattr(part, "inline_data") and part.inline_data:
                            audio_b64 = base64.b64encode(part.inline_data.data).decode()
                            await self.send_to_client(json.dumps({
                                "type": "audio",
                                "data": audio_b64,
                                "mimeType": part.inline_data.mime_type,
                            }))
                        # Text response
                        elif hasattr(part, "text") and part.text:
                            await self.send_to_client(json.dumps({
                                "type": "transcript",
                                "role": "agent",
                                "text": part.text,
                            }))

            # Handle tool calls
            if hasattr(response, "tool_call") and response.tool_call:
                tool_responses = []
                for fc in response.tool_call.function_calls:
                    fn_name = fc.name
                    fn_args = dict(fc.args) if fc.args else {}

                    # Execute the tool
                    fn = TOOL_FUNCTIONS.get(fn_name)
                    if fn:
                        try:
                            result = await fn(**fn_args)
                            # Send UI event to frontend based on tool
                            await self._emit_ui_event(fn_name, fn_args, result)
                            tool_responses.append({
                                "name": fn_name,
                                "response": result,
                            })
                        except Exception as e:
                            tool_responses.append({
                                "name": fn_name,
                                "response": {"status": "error", "message": str(e)},
                            })
                    else:
                        tool_responses.append({
                            "name": fn_name,
                            "response": {"status": "error", "message": f"Unknown tool: {fn_name}"},
                        })

                # Send tool results back to Gemini
                await self.session.send_tool_response(tool_responses)

    async def _emit_ui_event(self, tool_name: str, args: dict, result: dict):
        """Send structured UI events to the frontend based on tool calls."""
        if result.get("status") != "success":
            return

        if tool_name == "explore_artist":
            artist = result.get("artist", {})
            await self.send_to_client(json.dumps({
                "type": "show_artist",
                "artistId": artist.get("_id"),
                "data": artist,
            }))
            if artist.get("_id"):
                await self.send_to_client(json.dumps({
                    "type": "highlight_node",
                    "artistId": artist["_id"],
                }))

        elif tool_name == "get_connections":
            subgraph = result.get("subgraph", {})
            nodes = subgraph.get("nodes", [])
            if nodes:
                await self.send_to_client(json.dumps({
                    "type": "navigate_graph",
                    "centerId": nodes[0].get("id"),
                    "depth": args.get("depth", 2),
                    "nodes": nodes,
                    "edges": subgraph.get("edges", []),
                }))

        elif tool_name == "get_episode":
            episode = result.get("episode", {})
            await self.send_to_client(json.dumps({
                "type": "show_episode",
                "episodeId": episode.get("_id"),
                "data": episode,
            }))

        elif tool_name == "search_reviews":
            reviews = result.get("reviews", [])
            for review in reviews[:3]:
                await self.send_to_client(json.dumps({
                    "type": "show_narration",
                    "text": f'"{review.get("excerpt", "")}" — {review.get("publication", "")}',
                    "style": "review",
                }))

        elif tool_name == "add_to_playlist":
            await self.send_to_client(json.dumps({
                "type": "add_to_playlist",
                "trackId": args.get("track_id"),
                "playlistId": args.get("playlist_id"),
            }))

    async def close(self):
        """Close the Gemini session."""
        if self.session:
            await self.session.close()
```

**Step 2: Create `agent/main.py`**

```python
"""FastAPI server with WebSocket endpoint for Gemini Live bidi-streaming."""

import json
import asyncio
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from extended_play.live_session import LiveSession


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
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


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    async def send_to_client(message: str):
        try:
            await ws.send_text(message)
        except Exception:
            pass

    session = LiveSession(send_to_client)

    try:
        await session.start()

        # Start the receive loop in the background
        receive_task = asyncio.create_task(session.receive_loop())

        # Read from browser WebSocket and forward to Gemini
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)

            if msg["type"] == "audio":
                await session.send_audio(msg["data"])
            elif msg["type"] == "stop":
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        await session.close()
        if "receive_task" in locals():
            receive_task.cancel()


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

**Step 3: Add uvicorn to requirements**

Update `agent/requirements.txt`:

```txt
google-adk>=1.14.0
google-genai>=1.0.0
httpx>=0.27.0
python-dotenv>=1.0.0
fastapi>=0.115.0
uvicorn>=0.34.0
```

**Step 4: Test the server starts**

```bash
cd agent
python main.py
```

Should start on http://localhost:8000. Hit http://localhost:8000/health — should return `{"status": "ok"}`.

**Step 5: Commit**

```bash
git add agent/
git commit -m "feat: add FastAPI WebSocket server with Gemini Live bidi-streaming"
```

---

### Task 5: Frontend `useAgentConnection` Hook

**Files:**
- Create: `src/hooks/use-agent-connection.ts`

This hook manages the WebSocket lifecycle, audio capture via Web Audio API, audio playback, and event dispatch.

**Step 1: Create `src/hooks/use-agent-connection.ts`**

```typescript
"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

interface UseAgentConnectionOptions {
  agentUrl: string;
  onEvent: (event: AgentEvent) => void;
}

export function useAgentConnection({ agentUrl, onEvent }: UseAgentConnectionOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<{ role: string; text: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);

  // Connect to agent WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(agentUrl);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      setIsRecording(false);
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "audio") {
        // Play audio response from agent
        await playAudio(msg.data);
      } else if (msg.type === "transcript") {
        setTranscript({ role: msg.role, text: msg.text });
        onEvent(msg);
      } else if (msg.type === "interrupted") {
        // Stop any playing audio
        stopPlayback();
        onEvent(msg);
      } else {
        // Forward all other events (show_artist, highlight_node, etc.)
        onEvent(msg);
      }
    };
  }, [agentUrl, onEvent]);

  // Start recording microphone audio
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

    // Use ScriptProcessorNode to capture raw PCM
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      // Convert float32 to int16 PCM
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Base64 encode and send
      const bytes = new Uint8Array(pcm16.buffer);
      const b64 = btoa(String.fromCharCode(...bytes));
      wsRef.current.send(JSON.stringify({ type: "audio", data: b64 }));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    setIsRecording(true);
  }, [connect]);

  // Stop recording
  const stopRecording = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setIsRecording(false);
  }, []);

  // Play PCM audio from agent
  const playAudio = async (b64Data: string) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = playbackContextRef.current;

    const binaryStr = atob(b64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Convert int16 PCM to float32
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

  // Disconnect on unmount
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
    transcript,
    connect,
    startRecording,
    stopRecording,
    disconnect,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/
git commit -m "feat: add useAgentConnection hook for WebSocket audio streaming"
```

---

### Task 6: Wire Voice Bar to Agent

**Files:**
- Modify: `src/components/voice/voice-bar.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Update `src/components/voice/voice-bar.tsx`**

Replace the entire file to use the agent connection:

```tsx
"use client";

import { cn } from "@/lib/utils";

interface VoiceBarProps {
  isConnected: boolean;
  isRecording: boolean;
  transcript: { role: string; text: string } | null;
  onToggleRecording: () => void;
}

export function VoiceBar({
  isConnected,
  isRecording,
  transcript,
  onToggleRecording,
}: VoiceBarProps) {
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

      {/* Mic button */}
      <button
        onClick={onToggleRecording}
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0",
          isRecording
            ? "bg-amber text-walnut animate-vu-pulse"
            : "bg-shelf text-sleeve hover:text-cream hover:bg-edge"
        )}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          {isRecording ? (
            <rect x="4" y="4" width="8" height="8" rx="1" />
          ) : (
            <path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V3a2 2 0 0 1 2-2zm-3 6a3 3 0 1 0 6 0h1a4 4 0 0 1-3.5 3.97V13H10v1H6v-1h1.5v-2.03A4 4 0 0 1 4 7h1z" />
          )}
        </svg>
      </button>

      {/* Transcription area */}
      <div className="flex-1 min-w-0">
        {transcript ? (
          <p className="text-cream text-sm truncate">
            <span className="text-sleeve">{transcript.role === "user" ? "You" : "Curator"}:</span>{" "}
            {transcript.text}
          </p>
        ) : (
          <p className="text-shadow text-sm">
            {isRecording ? "Listening..." : "Talk to the curator..."}
          </p>
        )}
      </div>
    </header>
  );
}
```

**Step 2: Update `src/app/page.tsx` to use agent connection**

```tsx
"use client";

import { useState, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { MainLayout } from "@/components/layout/main-layout";
import { VoiceBar } from "@/components/voice/voice-bar";
import { EpisodeSidebar } from "@/components/layout/episode-sidebar";
import { InfluenceMap } from "@/components/graph/influence-map";
import { StoryStream } from "@/components/stream/story-stream";
import { PlaylistBar } from "@/components/playlist/playlist-bar";
import { useAgentConnection, AgentEvent } from "@/hooks/use-agent-connection";
import { Id } from "../../convex/_generated/dataModel";

const AGENT_WS_URL = process.env.NEXT_PUBLIC_AGENT_WS_URL || "ws://localhost:8000/ws";

export default function Home() {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<Id<"episodes"> | undefined>();
  const [selectedArtistId, setSelectedArtistId] = useState<string | undefined>();
  const [storyItems, setStoryItems] = useState<AgentEvent[]>([]);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | undefined>();

  const handleAgentEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case "show_artist":
      case "show_narration":
      case "show_episode":
        setStoryItems((prev) => [...prev, event]);
        break;
      case "highlight_node":
        setHighlightedNodeId(event.artistId as string);
        break;
      case "navigate_graph":
        setHighlightedNodeId(event.centerId as string);
        break;
      case "add_to_playlist":
        // TODO: update playlist bar reactively
        break;
    }
  }, []);

  const agent = useAgentConnection({
    agentUrl: AGENT_WS_URL,
    onEvent: handleAgentEvent,
  });

  const handleToggleRecording = () => {
    if (agent.isRecording) {
      agent.stopRecording();
    } else {
      agent.startRecording();
    }
  };

  const handleNodeClick = (artistId: string) => {
    setSelectedArtistId(artistId);
  };

  const handleTrackSelect = (trackId: Id<"tracks">, artistId: Id<"artists">) => {
    setSelectedArtistId(artistId);
  };

  return (
    <AppShell>
      <VoiceBar
        isConnected={agent.isConnected}
        isRecording={agent.isRecording}
        transcript={agent.transcript}
        onToggleRecording={handleToggleRecording}
      />
      <MainLayout
        sidebar={
          <EpisodeSidebar
            episodeId={selectedEpisodeId}
            onTrackSelect={handleTrackSelect}
          />
        }
        graph={
          <InfluenceMap
            onNodeClick={handleNodeClick}
            highlightedNodeId={highlightedNodeId}
          />
        }
        stream={<StoryStream items={storyItems} />}
      />
      <PlaylistBar title="My Crate" tracks={[]} />
    </AppShell>
  );
}
```

**Step 3: Commit**

```bash
git add src/
git commit -m "feat: wire voice bar to agent WebSocket with live audio"
```

---

### Task 7: Update Story Stream to Render Agent Events

**Files:**
- Modify: `src/components/stream/story-stream.tsx`
- Modify: `src/components/stream/artist-card.tsx`

**Step 1: Update `src/components/stream/story-stream.tsx`**

```tsx
"use client";

import { useRef, useEffect } from "react";
import { NarrationCard } from "./narration-card";
import { ArtistCard } from "./artist-card";
import { AlbumArtCard } from "./album-art-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentEvent } from "@/hooks/use-agent-connection";

interface StoryStreamProps {
  items?: AgentEvent[];
}

export function StoryStream({ items = [] }: StoryStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new items arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        <h3 className="font-editorial text-cream text-base mb-2">Story Stream</h3>

        {items.length === 0 && (
          <p className="text-shadow text-sm">
            Start a conversation to explore music connections...
          </p>
        )}

        {items.map((item, i) => {
          switch (item.type) {
            case "show_narration":
              return (
                <NarrationCard
                  key={i}
                  content={item.text as string}
                  timestamp="Just now"
                  style={item.style as string | undefined}
                />
              );
            case "show_artist": {
              const data = item.data as Record<string, unknown> | undefined;
              return (
                <ArtistCard
                  key={i}
                  name={(data?.name as string) || "Unknown"}
                  genres={(data?.genres as string[]) || []}
                  country={(data?.country as string) || ""}
                  communityLabel={(data?.communityLabel as string) || ""}
                  imageUrl={(data?.images as any)?.thumbnail?.url}
                  bio={(data?.bio as string) || ""}
                />
              );
            }
            case "transcript":
              if (item.role === "agent") {
                return (
                  <NarrationCard
                    key={i}
                    content={item.text as string}
                    timestamp="Just now"
                  />
                );
              }
              return null;
            default:
              return null;
          }
        })}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
```

**Step 2: Add optional `imageUrl` and `bio` props to `artist-card.tsx`**

Read the current artist-card.tsx and add the new optional props: `imageUrl?: string` and `bio?: string`. Display the image as a background on the card header, and show bio text if provided.

**Step 3: Commit**

```bash
git add src/components/stream/
git commit -m "feat: story stream renders live agent events"
```

---

### Task 8: Update Influence Map for Agent Highlights

**Files:**
- Modify: `src/components/graph/influence-map.tsx`
- Modify: `src/components/graph/use-force-graph.ts`

**Step 1: Add `highlightedNodeId` prop to `InfluenceMap`**

```tsx
interface InfluenceMapProps {
  onNodeClick?: (artistId: string) => void;
  highlightedNodeId?: string;
}
```

Pass `highlightedNodeId` through to `useForceGraph`. In the D3 hook, when `highlightedNodeId` changes, animate the highlighted node (scale up, add ring-tube-glow, pan to center).

**Step 2: In `use-force-graph.ts`, add highlight effect**

Add a `useEffect` that watches `highlightedNodeId`. When it changes:
- Find the node in the simulation
- Scale it to 1.5x
- Add the amber glow ring
- Transition the viewport to center on it

**Step 3: Commit**

```bash
git add src/components/graph/
git commit -m "feat: influence map highlights nodes from agent events"
```

---

### Task 9: Dockerfiles for Cloud Run

**Files:**
- Create: `agent/Dockerfile`
- Create: `Dockerfile` (frontend)

**Step 1: Create `agent/Dockerfile`**

```dockerfile
FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

**Step 2: Create root `Dockerfile` for Next.js frontend**

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package.json ./
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
```

**Step 3: Update `next.config.ts` for standalone output**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
};

export default nextConfig;
```

**Step 4: Test Docker builds locally**

```bash
# Agent
cd agent
docker build -t extended-play-agent .
cd ..

# Frontend
docker build -t extended-play-web .
```

**Step 5: Commit**

```bash
git add agent/Dockerfile Dockerfile next.config.ts
git commit -m "feat: add Dockerfiles for Cloud Run deployment"
```

---

### Task 10: Deploy to Google Cloud Run

**Files:**
- Create: `deploy.sh`

**Step 1: Create `deploy.sh`**

```bash
#!/bin/bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
CONVEX_URL="${CONVEX_URL:?Set CONVEX_URL}"

echo "=== Deploying Extended Play Agent ==="
cd agent
gcloud run deploy extended-play-agent \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,GOOGLE_GENAI_USE_VERTEXAI=True,CONVEX_URL=$CONVEX_URL" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5 \
  --session-affinity
cd ..

# Get the agent URL
AGENT_URL=$(gcloud run services describe extended-play-agent \
  --region "$REGION" --project "$PROJECT_ID" \
  --format='value(status.url)')
AGENT_WS_URL="wss://$(echo $AGENT_URL | sed 's|https://||')/ws"

echo "=== Deploying Extended Play Frontend ==="
gcloud run deploy extended-play-web \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --set-env-vars="NEXT_PUBLIC_CONVEX_URL=$CONVEX_URL,NEXT_PUBLIC_AGENT_WS_URL=$AGENT_WS_URL" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5

echo "=== Deployment Complete ==="
gcloud run services describe extended-play-web \
  --region "$REGION" --project "$PROJECT_ID" \
  --format='value(status.url)'
```

**Step 2: Make executable and commit**

```bash
chmod +x deploy.sh
git add deploy.sh
git commit -m "feat: add Cloud Run deployment script"
```

**Step 3: Deploy**

```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export CONVEX_URL=https://keen-pika-956.convex.cloud
./deploy.sh
```

**Step 4: Verify**

- Hit the frontend URL in a browser
- Check agent health: `curl https://<agent-url>/health`
- Click the mic button and speak — should connect via WebSocket

**Step 5: Commit deploy confirmation**

```bash
git commit --allow-empty -m "chore: confirmed Cloud Run deployment working"
```

---

### Task 11: Seed Data and End-to-End Test

**Files:**
- No new files — this is a manual verification task

**Step 1: Seed episodes via admin dashboard**

Navigate to `https://<frontend-url>/admin` and paste a Rhythm Lab Radio tracklist to ingest.

**Step 2: Run enrichment**

In the Convex dashboard or via the admin UI, trigger `enrichAllStubArtists` to populate artist metadata.

**Step 3: End-to-end voice test**

1. Open the frontend
2. Click mic button
3. Say: "Tell me about the artists in the latest episode"
4. Verify:
   - Agent responds with voice audio
   - Story stream shows artist cards and narration
   - Graph highlights relevant nodes
5. Say: "Create a crate called 'Tonight's Discovery'"
6. Verify playlist creation

**Step 4: Record demo video (4 minutes max)**

Capture the voice conversation, graph exploration, story stream, and playlist building. Upload to YouTube/Vimeo for hackathon submission.

---

## Summary

| Task | Description | New Files |
|------|-------------|-----------|
| 1 | Scaffold Python agent | 7 files in `agent/` |
| 2 | Graph tools (explore, connect, search, bridge) | `agent/extended_play/tools/graph.py` |
| 3 | Episode, review, playlist tools | 3 tool files |
| 4 | FastAPI WebSocket + Gemini Live bidi-streaming | `agent/main.py`, `live_session.py` |
| 5 | `useAgentConnection` hook | `src/hooks/use-agent-connection.ts` |
| 6 | Wire voice bar to agent | Modify `voice-bar.tsx`, `page.tsx` |
| 7 | Story stream renders agent events | Modify `story-stream.tsx` |
| 8 | Graph highlights from agent | Modify `influence-map.tsx`, `use-force-graph.ts` |
| 9 | Dockerfiles | `agent/Dockerfile`, `Dockerfile` |
| 10 | Cloud Run deployment | `deploy.sh` |
| 11 | Seed data + E2E test + demo video | Manual |
