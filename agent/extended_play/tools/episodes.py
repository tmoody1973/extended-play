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
    # Trim to essential fields to save context tokens
    if isinstance(results, list):
        results = [
            {"_id": e.get("_id"), "title": e.get("title"), "airDate": e.get("airDate"),
             "trackCount": e.get("trackCount", 0)}
            for e in results
        ]
    return {"status": "success", "episodes": results}


async def get_episode(episode_id: str) -> dict:
    """Get full details of an episode including its complete tracklist with artist and album info.

    Args:
        episode_id: The Convex ID of the episode.

    Returns:
        Episode with title, air date, description, and complete tracklist.
    """
    result = await query("queries:getEpisodeWithTracks", {"episodeId": episode_id})
    if not result:
        return {"status": "error", "message": "Episode not found"}

    # Return full tracklist with compact per-track info
    tracks = result.get("tracks", [])
    compact_tracks = [
        {"title": t.get("title"), "artistName": t.get("artistName"),
         "albumTitle": t.get("albumTitle", ""), "_id": t.get("_id")}
        for t in tracks
    ]

    return {
        "status": "success",
        "episode": {
            "_id": result.get("_id"),
            "title": result.get("title"),
            "airDate": result.get("airDate"),
            "description": result.get("description", ""),
            "trackCount": len(tracks),
            "tracks": compact_tracks,
        },
    }
