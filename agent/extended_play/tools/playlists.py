"""Tools for building and managing playlists (crates)."""

from ..convex_client import mutation


async def create_playlist(title: str, description: str = "") -> dict:
    """Create a new playlist (crate) for the listener.

    Args:
        title: Name of the playlist.
        description: Optional description of the playlist's theme.

    Returns:
        The created playlist with its ID.
    """
    result = await mutation("playlists:create", {
        "title": title,
        "description": description,
        "type": "agent_recommended",
    })
    return {"status": "success", "playlist": result}


async def add_to_playlist(playlist_id: str, track_id: str) -> dict:
    """Add a track to an existing playlist.

    Args:
        playlist_id: The Convex ID of the playlist.
        track_id: The Convex ID of the track to add.

    Returns:
        Confirmation of the addition.
    """
    await mutation("playlists:addTrack", {
        "playlistId": playlist_id,
        "trackId": track_id,
    })
    return {"status": "success", "message": "Track added to playlist"}
