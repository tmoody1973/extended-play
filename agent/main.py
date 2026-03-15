"""FastAPI server — direct Gemini storytelling, no Live API."""

import asyncio
import json
import os
import base64
import logging
import uuid

logger = logging.getLogger("extended_play")
logging.basicConfig(level=logging.INFO)

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from extended_play.tools.storyteller import tell_story, curate_episode
from extended_play.tools.graph import explore_artist, get_connections, get_bridge_artists
from extended_play.tools.reviews import search_reviews
from extended_play.tools.episodes import list_episodes, get_episode
from extended_play.tools import storyteller

app = FastAPI(title="Extended Play Agent")

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
    logger.info(f"[SESSION] Connected: user={user_id}")

    # Give storyteller access to this WebSocket
    storyteller.active_websocket = ws

    try:
        while True:
            try:
                data = await ws.receive()
            except (WebSocketDisconnect, RuntimeError):
                break

            if "text" in data and data["text"]:
                msg = json.loads(data["text"])

                if msg.get("type") == "walkthrough":
                    episode_id = msg.get("episodeId")
                    if episode_id:
                        asyncio.create_task(_handle_walkthrough(ws, episode_id))

                elif msg.get("type") == "text":
                    text = msg["text"]
                    logger.info(f"[USER] {text}")
                    # Process in background so WebSocket stays responsive
                    asyncio.create_task(_handle_message(ws, text))

                elif msg.get("type") == "stop":
                    break

    finally:
        storyteller.active_websocket = None
        logger.info(f"[SESSION] Disconnected: user={user_id}")


async def _handle_message(ws: WebSocket, text: str):
    """Route user message to the right handler and stream results."""
    try:
        lower = text.lower().strip()

        # Detect intent from user message
        if any(w in lower for w in ["surprise", "unexpected", "wild", "random", "discover"]):
            await _handle_surprise(ws)
        elif any(w in lower for w in ["episode", "show", "walk me", "tracklist", "playlist"]):
            await _handle_episode(ws, text)
        else:
            # Default: treat as artist/topic deep dive
            await _handle_deep_dive(ws, text)

    except Exception as e:
        logger.error(f"[HANDLER ERROR] {e}", exc_info=True)
        try:
            await ws.send_text(json.dumps({
                "type": "error",
                "message": str(e),
            }))
        except Exception:
            pass


async def _handle_surprise(ws: WebSocket):
    """Surprise me flow: bridge artists → interleaved story → connections."""
    logger.info("[FLOW] Surprise me")

    await ws.send_text(json.dumps({
        "type": "agent_activity",
        "tool": "tell_story",
        "status": "running",
    }))

    # tell_story streams show_narration + show_image directly via ws
    result = await tell_story(topic="surprise me")
    logger.info(f"[STORYTELLER] {result.get('status')} parts={result.get('parts_count')}")

    # Follow up with connections for the first bridge artist
    try:
        bridges = await get_bridge_artists(limit=3)
        bridge_list = bridges.get("bridge_artists", [])
        if bridge_list:
            first = bridge_list[0]
            name = first.get("name", "")
            if name:
                conn = await get_connections(artist_name=name, depth=1)
                subgraph = conn.get("subgraph", {})
                nodes = subgraph.get("nodes", [])
                if nodes:
                    await ws.send_text(json.dumps({
                        "type": "navigate_graph",
                        "centerId": nodes[0].get("id"),
                        "nodes": nodes,
                        "edges": subgraph.get("edges", []),
                    }))
    except Exception as e:
        logger.error(f"[CONNECTIONS ERROR] {e}")

    # Search reviews
    try:
        reviews = await search_reviews(topic="surprising music connections bridge artists")
        for review in (reviews.get("reviews", []) or [])[:2]:
            await ws.send_text(json.dumps({
                "type": "show_evidence",
                "data": {
                    "publication": review.get("publication", ""),
                    "excerpt": review.get("excerpt", ""),
                    "url": review.get("url"),
                    "artistNames": review.get("artistNames", []),
                },
            }))
    except Exception as e:
        logger.error(f"[REVIEWS ERROR] {e}")


async def _handle_deep_dive(ws: WebSocket, topic: str):
    """Artist/topic deep dive: story → connections → reviews."""
    logger.info(f"[FLOW] Deep dive: {topic}")

    await ws.send_text(json.dumps({
        "type": "agent_activity",
        "tool": "tell_story",
        "status": "running",
    }))

    # Interleaved story
    result = await tell_story(topic=topic)
    logger.info(f"[STORYTELLER] {result.get('status')} parts={result.get('parts_count')}")

    # Try to get connections
    try:
        # Extract likely artist name (first few words or the whole topic)
        conn = await get_connections(artist_name=topic, depth=1)
        subgraph = conn.get("subgraph", {})
        nodes = subgraph.get("nodes", [])
        if nodes:
            await ws.send_text(json.dumps({
                "type": "navigate_graph",
                "centerId": nodes[0].get("id"),
                "nodes": nodes,
                "edges": subgraph.get("edges", []),
            }))
    except Exception as e:
        logger.error(f"[CONNECTIONS ERROR] {e}")

    # Search reviews
    try:
        reviews = await search_reviews(topic=topic)
        for review in (reviews.get("reviews", []) or [])[:3]:
            await ws.send_text(json.dumps({
                "type": "show_evidence",
                "data": {
                    "publication": review.get("publication", ""),
                    "excerpt": review.get("excerpt", ""),
                    "url": review.get("url"),
                    "artistNames": review.get("artistNames", []),
                },
            }))
    except Exception as e:
        logger.error(f"[REVIEWS ERROR] {e}")


async def _handle_episode(ws: WebSocket, text: str):
    """Episode walkthrough: list episodes → story about standout artist."""
    logger.info(f"[FLOW] Episode: {text}")

    await ws.send_text(json.dumps({
        "type": "agent_activity",
        "tool": "get_episode",
        "status": "running",
    }))

    # List episodes and pick one
    try:
        episodes = await list_episodes()
        ep_list = episodes.get("episodes", [])
        if ep_list:
            ep = ep_list[0]  # Most recent
            episode_data = await get_episode(episode_id=ep.get("_id") or ep.get("id"))
            episode = episode_data.get("episode", {})

            await ws.send_text(json.dumps({
                "type": "show_episode",
                "episodeId": episode.get("_id"),
                "data": episode,
            }))

            # Tell a story about the episode's standout artist
            tracks = episode.get("tracks", [])
            if tracks:
                artist_name = tracks[0].get("artistName", "")
                if artist_name:
                    result = await tell_story(topic=f"{artist_name} and their music")
                    logger.info(f"[STORYTELLER] {result.get('status')}")
    except Exception as e:
        logger.error(f"[EPISODE ERROR] {e}", exc_info=True)


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


# Backward-compatible /ws endpoint
@app.websocket("/ws")
async def websocket_endpoint_compat(ws: WebSocket):
    await websocket_endpoint(ws, user_id="default", session_id="default")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
