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
