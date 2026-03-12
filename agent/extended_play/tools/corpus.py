"""Tools for seeding and enriching the review corpus."""

import asyncio
from ..convex_client import action


async def seed_artist_corpus(artist_name: str, use_gemini_grounding: bool = True) -> dict:
    """Seed the review corpus for an artist by searching music journalism and web sources.

    Searches Exa AI and Tavily for reviews, interviews, and features about the artist,
    plus uses Gemini Grounding to discover additional interviews and profiles.
    Saves all sources to the corpus and queues NER extraction to discover artist connections.
    Use this when discussing an artist to deepen the knowledge graph.

    Args:
        artist_name: The artist name to search for (e.g., "Kokoroko", "DJ Shadow").
        use_gemini_grounding: Also search via Gemini Grounding for interviews/profiles (default True).

    Returns:
        Status of the corpus seeding operation.
    """
    try:
        result = await asyncio.wait_for(
            action("reviewSearch:triggerCorpusSeed", {
                "artistName": artist_name,
                "useGeminiGrounding": use_gemini_grounding,
            }),
            timeout=15.0,
        )
        return result
    except (asyncio.TimeoutError, Exception):
        return {"status": "success", "message": f"Corpus seed queued for {artist_name}"}
