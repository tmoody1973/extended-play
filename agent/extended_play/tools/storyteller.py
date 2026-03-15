"""Interleaved storytelling using Gemini's native text+image output.

This module uses Gemini 2.0 Flash's interleaved output capabilities to generate
rich mixed-media narratives — text woven with generated images — in a single
streaming response. This is the Creative Storyteller hackathon capability.
"""

import asyncio
import base64
import contextvars
import json
import logging
import os

from google import genai

from ..convex_client import query

logger = logging.getLogger("extended_play")

# Context var to pass the WebSocket into tool calls without changing ADK signatures
_active_ws: contextvars.ContextVar = contextvars.ContextVar("active_ws", default=None)

STORYTELLER_MODEL = "gemini-3.1-flash-image-preview"

STORY_SYSTEM = """You are the curator of Extended Play — a Tokyo record bar built on 20 years of Rhythm Lab Radio playlists curated by Tarik Moody out of Milwaukee.

You create rich, visual music stories. For every response, interleave your narration with generated images that bring the music to life. Paint scenes, capture moods, illustrate connections.

## Style Guide
- Write in warm, authoritative prose. You have strong opinions about music.
- Generate images in a vintage concert poster aesthetic: warm tones, muted gold and walnut palette, textured paper feel, screen-printed gig poster style.
- NO text, words, or letters in images.
- Alternate between narration paragraphs and evocative illustrations.
- Each response should have at least 2-3 images woven into the narrative.
- End with an invitation to explore further.

## Image Subjects
When illustrating, choose scenes that capture:
- The feeling of a genre or era (smoky jazz club, sun-drenched Lagos street, neon-lit Tokyo alley)
- Musical instruments and performance moments
- Abstract representations of sound and rhythm
- Cultural contexts that shaped the music
"""


async def _get_artist_context(artist_name: str) -> dict | None:
    """Fetch artist data from the graph to ground the story."""
    try:
        results = await query("queries:searchArtists", {"query": artist_name})
        if not results:
            return None
        artist_id = results[0]["id"]
        card = await query("queries:getArtistCard", {"artistId": artist_id})
        return card
    except Exception:
        return None


async def _get_bridge_context(limit: int = 3) -> list:
    """Fetch bridge artists for surprise stories."""
    try:
        results = await query("queries:getBridgeArtists", {"limit": limit})
        return results or []
    except Exception:
        return []


async def tell_story(
    topic: str,
) -> dict:
    """Generate a rich, interleaved text+image story about a music topic.

    Uses Gemini's native interleaved output to weave narration with
    generated illustrations in a single streaming response.

    Args:
        topic: The story topic — an artist name, genre, connection, or "surprise me".

    Returns:
        dict with status, parts (text and image segments), and summary.
    """
    ws = _active_ws.get(None)
    # Build context from our knowledge graph
    context_parts = []

    if "surprise" in topic.lower():
        bridges = await _get_bridge_context(3)
        if bridges:
            bridge_info = []
            for b in bridges:
                name = b.get("name", "Unknown")
                genres = ", ".join(b.get("genres", [])[:3])
                communities = b.get("connectedCommunities", [])
                comm_str = " and ".join(communities[:2]) if communities else "multiple scenes"
                bridge_info.append(f"- {name} ({genres}) — bridges {comm_str}")
            context_parts.append(
                "Here are bridge artists who connect different musical worlds:\n"
                + "\n".join(bridge_info)
            )
            # Also send bridge artists to frontend
            if ws:
                for b in bridges:
                    try:
                        await ws.send_text(json.dumps({
                            "type": "show_artist",
                            "artistId": b.get("_id") or b.get("id"),
                            "data": b,
                        }))
                        if b.get("_id") or b.get("id"):
                            await ws.send_text(json.dumps({
                                "type": "highlight_node",
                                "artistId": b.get("_id") or b.get("id"),
                            }))
                    except Exception:
                        pass
    else:
        # Try to find the artist in our graph
        artist = await _get_artist_context(topic)
        if artist:
            name = artist.get("name", topic)
            bio = artist.get("bio", "")
            genres = ", ".join(artist.get("genres", [])[:5])
            country = artist.get("country", "")
            context_parts.append(
                f"Artist from our graph: {name}\n"
                f"Genres: {genres}\n"
                f"Country: {country}\n"
                f"Bio: {bio[:500]}"
            )
            # Send artist card to frontend
            if ws:
                try:
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
                except Exception:
                    pass

    context_str = "\n\n".join(context_parts) if context_parts else ""

    prompt = f"""Tell me a vivid, immersive music story about: {topic}

{f"Context from our knowledge graph:{chr(10)}{context_str}" if context_str else ""}

Create a rich narrative with at least 3 paragraphs of narration interleaved with 2-3 generated illustrations.
Each image should capture a different mood or scene from the story.
End with a question inviting the listener to explore a connection."""

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
            model=STORYTELLER_MODEL,
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                system_instruction=STORY_SYSTEM,
            ),
        )

        parts_out = []
        for part in response.candidates[0].content.parts:
            if hasattr(part, "text") and part.text and part.text.strip():
                parts_out.append({"type": "text", "content": part.text.strip()})
                if ws:
                    try:
                        await ws.send_text(json.dumps({
                            "type": "show_narration",
                            "text": part.text.strip(),
                        }))
                    except Exception:
                        pass

            elif hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
                img_b64 = base64.b64encode(part.inline_data.data).decode()
                mime = part.inline_data.mime_type or "image/png"
                parts_out.append({"type": "image", "mimeType": mime})
                if ws:
                    try:
                        await ws.send_text(json.dumps({
                            "type": "show_image",
                            "imageData": img_b64,
                            "mimeType": mime,
                            "caption": topic,
                        }))
                    except Exception:
                        pass

        summary = " ".join(
            p["content"][:100] for p in parts_out if p["type"] == "text"
        )[:300]

        return {
            "status": "success",
            "parts_count": len(parts_out),
            "text_segments": sum(1 for p in parts_out if p["type"] == "text"),
            "image_segments": sum(1 for p in parts_out if p["type"] == "image"),
            "summary": summary,
        }

    except Exception as e:
        logger.error(f"[STORYTELLER] Error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}
