"""HTTP client for calling Convex query/mutation/action functions."""

import os
import httpx

CONVEX_URL = os.environ.get("CONVEX_URL", "")


async def query(path: str, args: dict | None = None) -> dict:
    """Call a Convex query function via HTTP.

    Args:
        path: Function path like "queries:getArtistCard"
        args: Arguments to pass to the function

    Returns:
        The query result as a dict.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{CONVEX_URL}/api/query",
            json={"path": path, "args": args or {}},
            timeout=15.0,
        )
        resp.raise_for_status()
        return resp.json()


async def mutation(path: str, args: dict | None = None) -> dict:
    """Call a Convex mutation function via HTTP."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{CONVEX_URL}/api/mutation",
            json={"path": path, "args": args or {}},
            timeout=15.0,
        )
        resp.raise_for_status()
        return resp.json()


async def action(path: str, args: dict | None = None) -> dict:
    """Call a Convex action function via HTTP."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{CONVEX_URL}/api/action",
            json={"path": path, "args": args or {}},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()
