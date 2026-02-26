// convex/queries.ts
// Frontend-facing queries — what the D3 graph, story stream, and UI consume
// All queries are reactive: UI updates automatically as enrichment writes data

import { v } from "convex/values";
import { query } from "./_generated/server";

// ═══════════════════════════════════════════════════════════════
//  GRAPH DATA — For D3 Force-Directed Influence Map
// ═══════════════════════════════════════════════════════════════

// Get the active graph snapshot for rendering
export const getActiveGraph = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("graphSnapshots")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();
  },
});

// Get subgraph around a specific artist (for focused exploration)
export const getArtistSubgraph = query({
  args: {
    artistId: v.id("artists"),
    depth: v.optional(v.number()), // How many hops from center (default 2)
  },
  handler: async (ctx, { artistId, depth = 2 }) => {
    const visited = new Set<string>();
    const nodes: any[] = [];
    const edges: any[] = [];
    const queue: { id: any; currentDepth: number }[] = [
      { id: artistId, currentDepth: 0 },
    ];

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;
      if (visited.has(id.toString()) || currentDepth > depth) continue;
      visited.add(id.toString());

      const artist = await ctx.db.get(id);
      if (!artist) continue;

      nodes.push({
        id: artist._id,
        name: artist.name,
        communityId: artist.communityId,
        communityLabel: artist.communityLabel,
        bridgeScore: artist.bridgeScore,
        influenceScore: artist.influenceScore,
        imageUrl: artist.images?.thumbnail?.url || artist.images?.primary?.url,
        sonicProfile: artist.sonicProfile,
        genres: artist.genres,
        country: artist.country,
        enrichmentStatus: artist.enrichmentStatus,
      });

      // Get connections from this artist
      const connectionsFrom = await ctx.db
        .query("artistConnections")
        .withIndex("by_source", (q) => q.eq("sourceArtistId", id))
        .collect();

      const connectionsTo = await ctx.db
        .query("artistConnections")
        .withIndex("by_target", (q) => q.eq("targetArtistId", id))
        .collect();

      const allConnections = [...connectionsFrom, ...connectionsTo];

      for (const conn of allConnections) {
        edges.push({
          id: conn._id,
          source: conn.sourceArtistId,
          target: conn.targetArtistId,
          weight: conn.weight,
          connectionTypes: conn.connectionTypes,
          sonicDistance: conn.sonicDistance,
        });

        const neighborId =
          conn.sourceArtistId.toString() === id.toString()
            ? conn.targetArtistId
            : conn.sourceArtistId;

        if (!visited.has(neighborId.toString()) && currentDepth < depth) {
          queue.push({ id: neighborId, currentDepth: currentDepth + 1 });
        }
      }
    }

    return { nodes, edges };
  },
});

// ═══════════════════════════════════════════════════════════════
//  ARTIST QUERIES
// ═══════════════════════════════════════════════════════════════

// Full artist card data (for story stream / detail panel)
export const getArtistCard = query({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    const artist = await ctx.db.get(artistId);
    if (!artist) return null;

    // Get their tracks
    const tracks = await ctx.db
      .query("tracks")
      .withIndex("by_artistId", (q) => q.eq("artistId", artistId))
      .take(20);

    // Get their connections (top 10 by weight)
    const connectionsFrom = await ctx.db
      .query("artistConnections")
      .withIndex("by_source", (q) => q.eq("sourceArtistId", artistId))
      .collect();

    const connectionsTo = await ctx.db
      .query("artistConnections")
      .withIndex("by_target", (q) => q.eq("targetArtistId", artistId))
      .collect();

    const allConnections = [...connectionsFrom, ...connectionsTo]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    // Resolve connected artist names
    const connectedArtists = await Promise.all(
      allConnections.map(async (conn) => {
        const otherId =
          conn.sourceArtistId.toString() === artistId.toString()
            ? conn.targetArtistId
            : conn.sourceArtistId;
        const other = await ctx.db.get(otherId);
        return {
          id: otherId,
          name: other?.name || "Unknown",
          imageUrl: other?.images?.thumbnail?.url,
          weight: conn.weight,
          connectionTypes: conn.connectionTypes,
        };
      })
    );

    // Get related reviews
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_primaryArtist", (q) => q.eq("primaryArtistId", artistId))
      .take(5);

    return {
      ...artist,
      tracks: tracks.map((t) => ({
        id: t._id,
        title: t.title,
        albumTitle: t.albumTitle,
        albumYear: t.albumYear,
        albumArtUrl: t.albumArt?.primaryUrl || t.albumArt?.coverArtArchiveThumb,
        youtubeVideoId: t.youtubeVideoId,
        sonicFeatures: t.sonicFeatures,
      })),
      connectedArtists,
      reviews: reviews.map((r) => ({
        id: r._id,
        publication: r.publication,
        excerpt: r.excerpt,
        url: r.url,
        rating: r.rating,
      })),
    };
  },
});

// Search artists by name (for search bar)
export const searchArtists = query({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    if (query.length < 2) return [];

    const results = await ctx.db
      .query("artists")
      .withSearchIndex("search_artists", (q) => q.search("name", query))
      .take(10);

    return results.map((a) => ({
      id: a._id,
      name: a.name,
      imageUrl: a.images?.thumbnail?.url || a.images?.primary?.url,
      genres: a.genres?.slice(0, 3),
      communityLabel: a.communityLabel,
      enrichmentStatus: a.enrichmentStatus,
    }));
  },
});

// Get bridge artists (for featured display)
export const getBridgeArtists = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    return await ctx.db
      .query("artists")
      .withIndex("by_bridgeScore")
      .order("desc")
      .take(limit);
  },
});

// ═══════════════════════════════════════════════════════════════
//  EPISODE QUERIES
// ═══════════════════════════════════════════════════════════════

// List episodes (most recent first)
export const listEpisodes = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 20 }) => {
    return await ctx.db
      .query("episodes")
      .withIndex("by_airDate")
      .order("desc")
      .take(limit);
  },
});

// Get full episode with tracks
export const getEpisodeWithTracks = query({
  args: { episodeId: v.id("episodes") },
  handler: async (ctx, { episodeId }) => {
    const episode = await ctx.db.get(episodeId);
    if (!episode) return null;

    const tracks = await ctx.db
      .query("tracks")
      .withIndex("by_position", (q) => q.eq("episodeId", episodeId))
      .collect();

    // Sort by position
    tracks.sort((a, b) => a.position - b.position);

    // Enrich tracks with artist images and album art
    const enrichedTracks = await Promise.all(
      tracks.map(async (track) => {
        const artist = await ctx.db.get(track.artistId);
        return {
          ...track,
          artistImageUrl: artist?.images?.thumbnail?.url,
          albumArtUrl: track.albumArt?.primaryUrl || track.albumArt?.coverArtArchiveThumb,
        };
      })
    );

    return { ...episode, tracks: enrichedTracks };
  },
});

// ═══════════════════════════════════════════════════════════════
//  PLAYLIST QUERIES
// ═══════════════════════════════════════════════════════════════

export const getUserPlaylists = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("playlists")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});

export const getPlaylistWithTracks = query({
  args: { playlistId: v.id("playlists") },
  handler: async (ctx, { playlistId }) => {
    const playlist = await ctx.db.get(playlistId);
    if (!playlist) return null;

    const tracks = await Promise.all(
      playlist.trackIds.map(async (trackId) => {
        const track = await ctx.db.get(trackId);
        if (!track) return null;
        const artist = await ctx.db.get(track.artistId);
        return {
          ...track,
          artistImageUrl: artist?.images?.thumbnail?.url,
          albumArtUrl: track.albumArt?.primaryUrl || track.albumArt?.coverArtArchiveThumb,
        };
      })
    );

    return { ...playlist, tracks: tracks.filter(Boolean) };
  },
});

// ═══════════════════════════════════════════════════════════════
//  COMMUNITY QUERIES
// ═══════════════════════════════════════════════════════════════

export const getCommunities = query({
  handler: async (ctx) => {
    return await ctx.db.query("communities").collect();
  },
});

export const getCommunityArtists = query({
  args: {
    communityId: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { communityId, limit = 20 }) => {
    return await ctx.db
      .query("artists")
      .withIndex("by_communityId", (q) => q.eq("communityId", communityId))
      .take(limit);
  },
});

// ═══════════════════════════════════════════════════════════════
//  ENRICHMENT STATUS (for admin dashboard / progress tracking)
// ═══════════════════════════════════════════════════════════════

export const getEnrichmentStats = query({
  handler: async (ctx) => {
    const allArtists = await ctx.db.query("artists").collect();
    const allTracks = await ctx.db.query("tracks").collect();
    const allJobs = await ctx.db.query("enrichmentJobs").collect();

    const artistStats = {
      total: allArtists.length,
      stub: allArtists.filter((a) => a.enrichmentStatus === "stub").length,
      identified: allArtists.filter((a) => a.enrichmentStatus === "identified").length,
      metadata: allArtists.filter((a) => a.enrichmentStatus === "metadata").length,
      images: allArtists.filter((a) => a.enrichmentStatus === "images").length,
      sonic: allArtists.filter((a) => a.enrichmentStatus === "sonic").length,
      complete: allArtists.filter((a) => a.enrichmentStatus === "complete").length,
      withImages: allArtists.filter((a) => a.images?.primary).length,
      withSonicProfile: allArtists.filter((a) => a.sonicProfile).length,
    };

    const trackStats = {
      total: allTracks.length,
      raw: allTracks.filter((t) => t.enrichmentStatus === "raw").length,
      matched: allTracks.filter((t) => t.enrichmentStatus === "matched").length,
      artwork: allTracks.filter((t) => t.enrichmentStatus === "artwork").length,
      sonic: allTracks.filter((t) => t.enrichmentStatus === "sonic").length,
      complete: allTracks.filter((t) => t.enrichmentStatus === "complete").length,
      withAlbumArt: allTracks.filter((t) => t.albumArt?.primaryUrl).length,
    };

    const jobStats = {
      queued: allJobs.filter((j) => j.status === "queued").length,
      running: allJobs.filter((j) => j.status === "running").length,
      completed: allJobs.filter((j) => j.status === "completed").length,
      failed: allJobs.filter((j) => j.status === "failed").length,
    };

    return { artistStats, trackStats, jobStats };
  },
});
