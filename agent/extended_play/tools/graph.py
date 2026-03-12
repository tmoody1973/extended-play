"""Tools for exploring the artist knowledge graph."""

from ..convex_client import query


async def explore_artist(artist_name: str) -> dict:
    """Look up an artist by name and return their full profile including bio, genres, images, connections, and tracks.

    Args:
        artist_name: The name of the artist to explore.

    Returns:
        Artist profile with bio, genres, images, top connections, and tracks. Returns error if not found.
    """
    results = await query("queries:searchArtists", {"query": artist_name})
    if not results:
        return {"status": "error", "message": f"No artist found matching '{artist_name}'"}

    artist_id = results[0]["id"]
    card = await query("queries:getArtistCard", {"artistId": artist_id})
    if not card:
        return {"status": "error", "message": f"Could not load artist card for '{artist_name}'"}

    return {"status": "success", "artist": card}


async def get_connections(artist_name: str, depth: int = 1) -> dict:
    """Get the subgraph of connections around an artist, showing how they relate to other artists.

    Args:
        artist_name: The name of the artist to center the graph on.
        depth: How many hops from the center artist to include (1-2). Default 1.

    Returns:
        Graph with nodes (artists) and edges (connections) around the specified artist.
    """
    results = await query("queries:searchArtists", {"query": artist_name})
    if not results:
        return {"status": "error", "message": f"No artist found matching '{artist_name}'"}

    artist_id = results[0]["id"]
    try:
        subgraph = await query("queries:getArtistSubgraph", {
            "artistId": artist_id,
            "depth": min(depth, 2),
        })
    except Exception:
        return {"status": "success", "center": artist_name, "subgraph": {
            "nodes": [{"id": artist_id, "name": artist_name}],
            "edges": [],
        }}

    # Trim to top connections by weight to avoid huge payloads
    if isinstance(subgraph, dict):
        edges = subgraph.get("edges", [])
        if len(edges) > 15:
            edges = sorted(edges, key=lambda e: e.get("weight", 0), reverse=True)[:15]
            # Keep only nodes referenced by kept edges
            kept_ids = {artist_id}
            for e in edges:
                kept_ids.add(e.get("source", ""))
                kept_ids.add(e.get("target", ""))
            nodes = [n for n in subgraph.get("nodes", []) if n.get("id") in kept_ids]
            # Strip heavy fields from nodes
            nodes = [{"id": n.get("id"), "name": n.get("name"), "genres": n.get("genres", [])[:3]} for n in nodes]
            subgraph = {"nodes": nodes, "edges": edges}

    return {"status": "success", "center": artist_name, "subgraph": subgraph}


async def search_artists(search_query: str) -> dict:
    """Search for artists by name. Use this when you need to find an artist before exploring them.

    Args:
        search_query: Search term (artist name or partial name, minimum 2 characters).

    Returns:
        List of matching artists with id, name, genres, and enrichment status.
    """
    results = await query("queries:searchArtists", {"query": search_query})
    return {"status": "success", "results": results}


async def get_bridge_artists(limit: int = 5) -> dict:
    """Get featured bridge artists — those who connect different musical communities.

    Args:
        limit: Number of bridge artists to return (1-10). Default 5.

    Returns:
        List of bridge artists with high betweenness centrality scores.
    """
    results = await query("queries:getBridgeArtists", {"limit": min(limit, 10)})
    return {"status": "success", "bridge_artists": results}
