// convex/queries.ts
// Frontend-facing queries — what the D3 graph, story stream, and UI consume
// All queries are reactive: UI updates automatically as enrichment writes data

import { v } from "convex/values";
import { query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

// ═══════════════════════════════════════════════════════════════
//  GRAPH DATA — For D3 Force-Directed Influence Map
// ═══════════════════════════════════════════════════════════════

// Get the active graph snapshot + companion chunks (client merges them)
export const getActiveGraph = query({
  handler: async (ctx) => {
    const snapshot = await ctx.db
      .query("graphSnapshots")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();
    if (!snapshot) return null;

    // Return primary + companion docs as-is (avoid server-side JSON parse/merge/re-serialize)
    const companions = await ctx.db
      .query("graphSnapshots")
      .withIndex("by_version", (q) => q.eq("version", snapshot.version))
      .collect();

    const chunks = companions
      .filter((c) => c._id !== snapshot._id)
      .map((c) => ({
        nodesJson: c.nodesJson !== "[]" ? c.nodesJson : undefined,
        edgesJson: c.edgesJson !== "[]" ? c.edgesJson : undefined,
        nodeImagesJson: c.nodeImagesJson || undefined,
      }));

    return { ...snapshot, chunks };
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

      const artist = await ctx.db.get(id) as Doc<"artists"> | null;
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
//  TEMPORAL EXPLORER — Date-based browsing and graph filtering
// ═══════════════════════════════════════════════════════════════

// Lightweight episode summary for the date browser
export const getEpisodeDateSummary = query({
  handler: async (ctx) => {
    const episodes = await ctx.db
      .query("episodes")
      .withIndex("by_airDate")
      .order("desc")
      .collect();
    return episodes.map((ep) => ({
      _id: ep._id,
      title: ep.title,
      airDate: ep.airDate,
      airDateTimestamp: ep.airDateTimestamp,
      trackCount: ep.trackCount,
    }));
  },
});

// Get all artist IDs that appeared in episodes within a date range
export const getArtistIdsByDateRange = query({
  args: {
    startTimestamp: v.number(),
    endTimestamp: v.number(),
  },
  handler: async (ctx, { startTimestamp, endTimestamp }) => {
    const episodes = await ctx.db
      .query("episodes")
      .withIndex("by_airDate")
      .filter((q) =>
        q.and(
          q.gte(q.field("airDateTimestamp"), startTimestamp),
          q.lte(q.field("airDateTimestamp"), endTimestamp)
        )
      )
      .collect();

    const artistIds = new Set<string>();
    for (const ep of episodes) {
      const tracks = await ctx.db
        .query("tracks")
        .withIndex("by_episodeId", (q) => q.eq("episodeId", ep._id))
        .collect();
      for (const t of tracks) {
        artistIds.add(t.artistId as string);
      }
    }
    return {
      artistIds: Array.from(artistIds),
      episodeCount: episodes.length,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
//  ENRICHMENT STATUS (for admin dashboard / progress tracking)
// ═══════════════════════════════════════════════════════════════

// Lightweight table counts + corpus stats (capped reads to avoid limits)
export const getEnrichmentStats = query({
  handler: async (ctx) => {
    const reviews = await ctx.db.query("reviews").take(5000);
    const tracks = await ctx.db.query("tracks").take(5000);
    const episodes = await ctx.db.query("episodes").take(5000);

    const tracksWithSpotify = tracks.filter((t) => t.spotifyTrackId).length;
    const tracksWithYoutube = tracks.filter((t) => t.youtubeVideoId).length;
    const tracksWithSonic = tracks.filter((t) => t.sonicFeatures).length;
    const tracksWithArt = tracks.filter((t) => t.albumArt?.primaryUrl).length;

    const reviewsBySource: Record<string, number> = {};
    for (const r of reviews) {
      const src = r.sourceType || "unknown";
      reviewsBySource[src] = (reviewsBySource[src] || 0) + 1;
    }

    return {
      counts: {
        reviews: reviews.length,
        tracks: tracks.length,
        episodes: episodes.length,
      },
      trackEnrichment: {
        withSpotifyId: tracksWithSpotify,
        withYoutubeId: tracksWithYoutube,
        withSonicFeatures: tracksWithSonic,
        withAlbumArt: tracksWithArt,
      },
      reviewsBySource,
    };
  },
});

// Enrichment pipeline monitor — lightweight, uses indexed counting
// Reads at most ~200 docs per step (not 5000) to stay well under limits
export const getEnrichmentMonitor = query({
  handler: async (ctx) => {
    // Only check active steps (skip ones unlikely to have jobs)
    const ACTIVE_STEPS = [
      "musicbrainz_lookup", "discogs_fetch", "fanart_tv_fetch",
      "wikipedia_fetch", "youtube_match", "musicbrainz_rels",
      "cover_art_archive", "spotify_match", "soundstat_fetch",
      "sonic_profile_compute", "ner_extraction",
      "gemini_corpus_seed", "review_corpus_seed",
    ];

    const stepCounts: Record<string, { queued: number; running: number; failed: number }> = {};
    let totalQueued = 0;
    let totalRunning = 0;
    let totalFailed = 0;

    for (const step of ACTIVE_STEPS) {
      // Cap at 200 per query — gives accurate-enough counts without blowing read limits
      const queued = await ctx.db.query("enrichmentJobs")
        .withIndex("by_step", (q) => q.eq("step", step as any).eq("status", "queued"))
        .take(200);
      const running = await ctx.db.query("enrichmentJobs")
        .withIndex("by_step", (q) => q.eq("step", step as any).eq("status", "running"))
        .take(10);
      const failed = await ctx.db.query("enrichmentJobs")
        .withIndex("by_step", (q) => q.eq("step", step as any).eq("status", "failed"))
        .take(10);

      const q = queued.length;
      const r = running.length;
      const f = failed.length;
      if (q > 0 || r > 0 || f > 0) {
        // Mark as 200+ if we hit the cap (approximate)
        stepCounts[step] = { queued: q, running: r, failed: f };
      }
      totalQueued += q;
      totalRunning += r;
      totalFailed += f;
    }

    // Artist enrichment progress — cap at 500 per status
    const CAP = 500;
    const stubs = (await ctx.db.query("artists")
      .withIndex("by_enrichmentStatus", (q) => q.eq("enrichmentStatus", "stub"))
      .take(CAP)).length;
    const identified = (await ctx.db.query("artists")
      .withIndex("by_enrichmentStatus", (q) => q.eq("enrichmentStatus", "identified"))
      .take(CAP)).length;
    const metadata = (await ctx.db.query("artists")
      .withIndex("by_enrichmentStatus", (q) => q.eq("enrichmentStatus", "metadata"))
      .take(CAP)).length;
    const withImages = (await ctx.db.query("artists")
      .withIndex("by_enrichmentStatus", (q) => q.eq("enrichmentStatus", "images"))
      .take(CAP)).length;
    const sonic = (await ctx.db.query("artists")
      .withIndex("by_enrichmentStatus", (q) => q.eq("enrichmentStatus", "sonic"))
      .take(CAP)).length;
    const complete = (await ctx.db.query("artists")
      .withIndex("by_enrichmentStatus", (q) => q.eq("enrichmentStatus", "complete"))
      .take(CAP)).length;

    // Failed job samples (only 3 queries max)
    const failedSample: Array<{ step: string; name: string; error?: string }> = [];
    const failedJobs = await ctx.db.query("enrichmentJobs")
      .withIndex("by_status_priority", (q) => q.eq("status", "failed"))
      .take(5);
    for (const j of failedJobs) {
      failedSample.push({ step: j.step, name: j.targetName, error: j.lastError });
    }

    return {
      pipeline: { queued: totalQueued, running: totalRunning, failed: totalFailed },
      steps: stepCounts,
      artists: {
        stubs, identified, metadata,
        images: withImages, sonic, complete,
      },
      failedSample,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
//  BRIDGE ARTISTS — Lightweight preload for welcome + explore
//  Returns top artists by connection count with minimal fields
// ═══════════════════════════════════════════════════════════════

export const getBridgeArtists = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    // Get artists sorted by bridgeScore (indexed)
    const byBridge = await ctx.db
      .query("artists")
      .withIndex("by_bridgeScore")
      .order("desc")
      .take(limit * 2);

    // Filter to artists past stub stage, take top N
    const artists = byBridge
      .filter((a) => a.name && a.enrichmentStatus !== "stub")
      .slice(0, limit);

    const artistIds = new Set(artists.map((a) => a._id.toString()));

    // Build nodes
    const nodes = artists.map((a) => ({
      id: a._id,
      name: a.name,
      imageUrl: a.images?.thumbnail?.url || a.images?.primary?.url,
      communityId: a.communityId ?? 0,
      communityLabel: a.communityLabel,
      bridgeScore: a.bridgeScore ?? 0,
      genres: a.genres?.slice(0, 3),
      country: a.country,
    }));

    // Collect edges between these artists only
    const edges: Array<{ source: string; target: string; weight: number }> = [];
    const seenEdges = new Set<string>();

    for (const a of artists) {
      const conns = await ctx.db
        .query("artistConnections")
        .withIndex("by_source", (q) => q.eq("sourceArtistId", a._id))
        .collect();

      for (const c of conns) {
        if (!artistIds.has(c.targetArtistId.toString())) continue;
        const key = `${c.sourceArtistId}-${c.targetArtistId}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        edges.push({
          source: c.sourceArtistId.toString(),
          target: c.targetArtistId.toString(),
          weight: c.weight,
        });
      }
    }

    return { nodes, edges };
  },
});
