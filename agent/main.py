"""FastAPI server with ADK Runner/LiveRequestQueue for bidi-streaming."""

import asyncio
import json
import os
import base64
import logging
from contextlib import asynccontextmanager

logger = logging.getLogger("extended_play")
logging.basicConfig(level=logging.INFO)

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


@app.get("/ws-test")
async def ws_test_page():
    """Minimal browser WebSocket test page."""
    from fastapi.responses import HTMLResponse
    return HTMLResponse("""
    <html><body>
    <h2>WebSocket Test</h2>
    <button onclick="doConnect()">Connect</button>
    <button onclick="doSend()">Send Hello</button>
    <pre id="log"></pre>
    <script>
    let ws;
    const log = s => document.getElementById('log').textContent += s + '\\n';
    function doConnect() {
        ws = new WebSocket('ws://localhost:8000/ws/default/browser-test');
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => log('OPEN');
        ws.onclose = e => log('CLOSE code=' + e.code + ' reason=' + e.reason + ' wasClean=' + e.wasClean);
        ws.onerror = e => log('ERROR ' + JSON.stringify(e));
        ws.onmessage = e => {
            if (e.data instanceof ArrayBuffer) log('BINARY ' + e.data.byteLength + ' bytes');
            else log('MSG: ' + e.data.substring(0, 100));
        };
    }
    function doSend() {
        if (!ws || ws.readyState !== 1) { log('Not connected'); return; }
        ws.send(JSON.stringify({type: 'text', text: 'hello'}));
        log('Sent hello');
    }
    </script>
    </body></html>
    """)


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
                    # Raw PCM audio bytes from browser — wrap in Blob for ADK
                    live_request_queue.send_realtime(
                        Blob(data=data["bytes"], mime_type="audio/pcm;rate=16000")
                    )
                elif "text" in data and data["text"]:
                    msg = json.loads(data["text"])

                    if msg.get("type") == "text":
                        content = Content(role="user", parts=[Part(text=msg["text"])])
                        live_request_queue.send_content(content)
                    elif msg.get("type") == "audio":
                        # Base64-encoded audio fallback
                        audio_bytes = base64.b64decode(msg["data"])
                        live_request_queue.send_realtime(
                            Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
                        )
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
            error_msg = str(e)
            is_context_overflow = "context window" in error_msg or "32000" in error_msg
            try:
                await ws.send_text(json.dumps({
                    "type": "session_expired" if is_context_overflow else "error",
                    "message": "Session full — reconnect to continue." if is_context_overflow else error_msg,
                }))
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
        # Log event type for debugging
        event_attrs = [a for a in dir(event) if not a.startswith("_")]
        has_content = hasattr(event, "content") and event.content
        has_actions = hasattr(event, "actions") and event.actions

        if has_actions or (hasattr(event, "tool_calls") and event.tool_calls):
            logger.info(f"[EVENT] attrs={event_attrs}")
            if has_actions:
                logger.info(f"[EVENT] actions={event.actions}")

        # Audio and text content
        if has_content and hasattr(event.content, "parts"):
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
                    # Also emit as narration card for the story stream
                    await ws.send_text(json.dumps({
                        "type": "show_narration",
                        "text": part.text,
                    }))

        # Input transcription (user speech-to-text)
        if hasattr(event, "input_transcription") and event.input_transcription:
            tx = event.input_transcription
            text = getattr(tx, "text", None) or str(tx)
            if text:
                await ws.send_text(json.dumps({
                    "type": "transcript",
                    "role": "user",
                    "text": text,
                }))

        # Output transcription (agent speech-to-text)
        if hasattr(event, "output_transcription") and event.output_transcription:
            tx = event.output_transcription
            text = getattr(tx, "text", None) or str(tx)
            if text:
                await ws.send_text(json.dumps({
                    "type": "transcript",
                    "role": "agent",
                    "text": text,
                }))
                # Also emit as narration card so text appears in story stream
                await ws.send_text(json.dumps({
                    "type": "show_narration",
                    "text": text,
                }))

        # Interruption
        if hasattr(event, "interrupted") and event.interrupted:
            await ws.send_text(json.dumps({"type": "interrupted"}))

        # Tool call activity — check multiple possible attribute names
        function_calls = None
        if hasattr(event, "tool_calls") and event.tool_calls:
            function_calls = event.tool_calls
        elif has_content and hasattr(event.content, "parts"):
            for part in (event.content.parts or []):
                if hasattr(part, "function_call") and part.function_call:
                    if function_calls is None:
                        function_calls = []
                    function_calls.append(part.function_call)

        if function_calls:
            for tc in function_calls:
                tool_name = getattr(tc, "name", None) or getattr(tc, "function_name", "unknown")
                logger.info(f"[TOOL CALL] {tool_name}")
                await ws.send_text(json.dumps({
                    "type": "agent_activity",
                    "tool": tool_name,
                    "status": "running",
                }))

        # Tool results -> UI events — check multiple possible locations
        tool_results = []
        if has_actions:
            tool_results = getattr(event.actions, "tool_results", None) or []
        # Also check content parts for function_response
        if has_content and hasattr(event.content, "parts"):
            for part in (event.content.parts or []):
                if hasattr(part, "function_response") and part.function_response:
                    tool_results.append(part.function_response)

        for tr in tool_results:
            logger.info(f"[TOOL RESULT] name={getattr(tr, 'name', '?')}")
            await _emit_ui_event(ws, tr)

    except Exception as e:
        logger.error(f"[EVENT ERROR] {e}", exc_info=True)


async def _emit_ui_event(ws: WebSocket, tool_result):
    """Translate tool results into frontend UI events."""
    try:
        name = getattr(tool_result, "name", "") or ""
        # Handle both ADK tool_result and Gemini function_response formats
        raw_result = getattr(tool_result, "result", None) or getattr(tool_result, "response", {})
        if isinstance(raw_result, str):
            try:
                result = json.loads(raw_result)
            except (json.JSONDecodeError, TypeError):
                return
        elif isinstance(raw_result, dict):
            result = raw_result
        else:
            # Try converting proto-like objects to dict
            try:
                result = dict(raw_result) if raw_result else {}
            except (TypeError, ValueError):
                return

        logger.info(f"[UI EVENT] tool={name} status={result.get('status')} keys={list(result.keys()) if isinstance(result, dict) else '?'}")

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

        elif name == "get_bridge_artists":
            bridges = result.get("bridge_artists", [])
            for bridge in (bridges[:3] if isinstance(bridges, list) else []):
                await ws.send_text(json.dumps({
                    "type": "show_artist",
                    "artistId": bridge.get("_id") or bridge.get("id"),
                    "data": bridge,
                }))
                if bridge.get("_id") or bridge.get("id"):
                    await ws.send_text(json.dumps({
                        "type": "highlight_node",
                        "artistId": bridge.get("_id") or bridge.get("id"),
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
