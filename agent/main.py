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

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.genai.types import Content, Part, Blob

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
        response_modalities=["AUDIO"],
    )

    async def upstream_task():
        """Receive from WebSocket, push to LiveRequestQueue."""
        try:
            while True:
                try:
                    data = await ws.receive()
                except WebSocketDisconnect:
                    break

                if "bytes" in data and data["bytes"]:
                    # Raw PCM audio bytes from browser
                    live_request_queue.send_realtime(data["bytes"])
                elif "text" in data and data["text"]:
                    msg = json.loads(data["text"])

                    if msg.get("type") == "text":
                        content = Content(role="user", parts=[Part(text=msg["text"])])
                        live_request_queue.send_content(content)
                    elif msg.get("type") == "audio":
                        # Base64-encoded audio fallback
                        audio_bytes = base64.b64decode(msg["data"])
                        live_request_queue.send_realtime(audio_bytes)
                    elif msg.get("type") == "image":
                        # Vision input
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
        # Audio and text content
        if hasattr(event, "content") and event.content and hasattr(event.content, "parts"):
            for part in (event.content.parts or []):
                if hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
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

        # Input transcription (user speech-to-text)
        if hasattr(event, "input_transcription") and event.input_transcription:
            await ws.send_text(json.dumps({
                "type": "transcript",
                "role": "user",
                "text": event.input_transcription,
            }))

        # Output transcription (agent speech-to-text)
        if hasattr(event, "output_transcription") and event.output_transcription:
            await ws.send_text(json.dumps({
                "type": "transcript",
                "role": "agent",
                "text": event.output_transcription,
            }))

        # Interruption
        if hasattr(event, "interrupted") and event.interrupted:
            await ws.send_text(json.dumps({"type": "interrupted"}))

        # Tool call activity (for UI indicators)
        if hasattr(event, "tool_calls") and event.tool_calls:
            for tc in event.tool_calls:
                tool_name = getattr(tc, "name", None) or getattr(tc, "function_name", "unknown")
                await ws.send_text(json.dumps({
                    "type": "agent_activity",
                    "tool": tool_name,
                    "status": "running",
                }))

        # Tool results -> UI events
        if hasattr(event, "actions") and event.actions:
            tool_results = getattr(event.actions, "tool_results", None) or []
            for tr in tool_results:
                await _emit_ui_event(ws, tr)

    except Exception:
        pass


async def _emit_ui_event(ws: WebSocket, tool_result):
    """Translate tool results into frontend UI events."""
    try:
        name = getattr(tool_result, "name", "") or ""
        raw_result = getattr(tool_result, "result", {})
        if isinstance(raw_result, str):
            try:
                result = json.loads(raw_result)
            except (json.JSONDecodeError, TypeError):
                return
        else:
            result = raw_result

        if not isinstance(result, dict) or result.get("status") != "success":
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


# Backward-compatible /ws endpoint (no user/session in path)
@app.websocket("/ws")
async def websocket_endpoint_compat(ws: WebSocket):
    await websocket_endpoint(ws, user_id="default", session_id="default")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
