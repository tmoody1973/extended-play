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
            if isinstance(reviews, list):
                for review in reviews[:3]:
                    await self.send_to_client(json.dumps({
                        "type": "show_narration",
                        "text": f'"{review.get("excerpt", "")}" \u2014 {review.get("publication", "")}',
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
