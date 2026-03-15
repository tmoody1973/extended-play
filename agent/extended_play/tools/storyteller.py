"""Interleaved storytelling using Gemini's native text+image output.

This module uses Gemini 2.0 Flash's interleaved output capabilities to generate
rich mixed-media narratives — text woven with generated images — in a single
streaming response. This is the Creative Storyteller hackathon capability.
"""

import asyncio
import base64
import json
import logging
import os

import httpx

from google import genai

from ..convex_client import query

logger = logging.getLogger("extended_play")

# Module-level ref set by main.py when a WebSocket connects
active_websocket = None

STORYTELLER_MODEL = "gemini-3.1-flash-image-preview"
TTS_MODEL = "gemini-2.5-flash-preview-tts"
TTS_VOICE = "Kore"  # Warm, expressive voice

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


async def _generate_tts(client: genai.Client, text: str) -> bytes | None:
    """Generate TTS audio for narration text using Gemini TTS."""
    try:
        response = await client.aio.models.generate_content(
            model=TTS_MODEL,
            contents=text,
            config=genai.types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=genai.types.SpeechConfig(
                    voice_config=genai.types.VoiceConfig(
                        prebuilt_voice_config=genai.types.PrebuiltVoiceConfig(
                            voice_name=TTS_VOICE
                        )
                    )
                ),
            ),
        )
        for part in response.candidates[0].content.parts:
            if hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
                return part.inline_data.data
    except Exception as e:
        logger.warning(f"[TTS] Failed: {e}")
    return None


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
        if not results:
            return []
        # Query returns { nodes: [...], edges: [...] }
        nodes = results.get("nodes", []) if isinstance(results, dict) else results
        return nodes[:limit]
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
    ws = active_websocket
    # Build context from our knowledge graph
    context_parts = []

    if "surprise" in topic.lower():
        bridges = await _get_bridge_context(3)
        if bridges:
            bridge_info = []
            for b in bridges:
                name = b.get("name", "Unknown")
                genres = ", ".join(b.get("genres", [])[:3])
                community = b.get("communityLabel") or b.get("connectedCommunities", [])
                comm_str = community if isinstance(community, str) else (" and ".join(community[:2]) if community else "multiple scenes")
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
        # Prefer API key for interleaved image generation (Vertex often lacks access)
        api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
        if api_key:
            # Explicitly disable Vertex so SDK routes to generativelanguage.googleapis.com
            client = genai.Client(api_key=api_key, vertexai=False)
            modalities = ["TEXT", "IMAGE"]
        else:
            # Fall back to Vertex AI — try image first, degrade to text-only
            client = genai.Client(
                vertexai=True,
                project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
                location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
            )
            modalities = ["TEXT", "IMAGE"]

        try:
            response = await client.aio.models.generate_content(
                model=STORYTELLER_MODEL,
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    response_modalities=modalities,
                    system_instruction=STORY_SYSTEM,
                ),
            )
        except genai.errors.ClientError as model_err:
            if "404" in str(model_err) or "not found" in str(model_err).lower():
                logger.warning("[STORYTELLER] Image model unavailable, falling back to text-only")
                response = await client.aio.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt,
                    config=genai.types.GenerateContentConfig(
                        response_modalities=["TEXT"],
                        system_instruction=STORY_SYSTEM,
                    ),
                )
            else:
                raise

        # Build a TTS client (uses API key, same as storyteller)
        tts_client = client

        parts_out = []
        for part in response.candidates[0].content.parts:
            if hasattr(part, "text") and part.text and part.text.strip():
                narration = part.text.strip()
                parts_out.append({"type": "text", "content": narration})
                if ws:
                    try:
                        await ws.send_text(json.dumps({
                            "type": "show_narration",
                            "text": narration,
                        }))
                    except Exception:
                        pass
                    # Generate TTS audio for this narration
                    audio_data = await _generate_tts(tts_client, narration)
                    if audio_data and ws:
                        try:
                            audio_b64 = base64.b64encode(audio_data).decode()
                            await ws.send_text(json.dumps({
                                "type": "narration_audio",
                                "audioData": audio_b64,
                                "mimeType": "audio/L16;codec=pcm;rate=24000",
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


async def curate_episode(episode_id: str) -> dict:
    """Curate a cinematic walkthrough for a Rhythm Lab Radio episode.

    Uses Gemini with Google Search grounding + knowledge graph context
    to pick the most compelling 3-5 tracks and build a narrative arc.
    """
    ws = active_websocket

    # Send loading state
    if ws:
        await ws.send_text(json.dumps({
            "type": "walkthrough_loading",
            "status": "curating",
            "message": "Curating your episode...",
        }))

    # Fetch episode + tracks from Convex
    episode = await query("queries:getEpisodeWithTracks", {"episodeId": episode_id})
    if not episode or not episode.get("tracks"):
        return {"status": "error", "message": "Episode not found or has no tracks"}

    tracks = episode.get("tracks", [])

    # Build knowledge graph context
    graph_context_parts = []
    for t in tracks[:30]:
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

    # Call 1: Narrative curation (Gemini + grounding)
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

    # Resolve YouTube IDs for selected tracks
    youtube_api_key = os.environ.get("YOUTUBE_API_KEY")
    for st in selected_tracks:
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
            try:
                search_query = f"{st.get('artistName', '')} {st.get('trackTitle', '')}"
                async with httpx.AsyncClient() as http_client:
                    yt_resp = await http_client.get(
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

    # Calls 2-4: Images + TTS (parallel)
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
        asyncio.create_task(generate_tts_segment(premise)),
        *[asyncio.create_task(generate_tts_segment(st.get("paragraph", ""))) for st in selected_tracks],
        asyncio.create_task(generate_tts_segment(closing)),
    ]

    cover_b64 = await cover_task
    track_images = await asyncio.gather(*image_tasks)
    tts_segments = await asyncio.gather(*tts_tasks)

    # Assemble walkthrough data
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

    # Send complete walkthrough to frontend
    if ws:
        await ws.send_text(json.dumps({
            "type": "walkthrough_ready",
            "data": walkthrough,
        }))

    return walkthrough
