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
