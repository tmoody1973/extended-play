// convex/playlists.ts
// Playlist creation, modification, and export — used by both agent and frontend

import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";

// ─────────────────────────────────────────────────────────────
//  Create a new playlist (from agent or user)
// ─────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    userId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    trackIds: v.array(v.id("tracks")),
    generatedFrom: v.optional(
      v.object({
        type: v.union(
          v.literal("episode_walkthrough"),
          v.literal("influence_path"),
          v.literal("sonic_journey"),
          v.literal("user_curated"),
          v.literal("agent_recommended")
        ),
        startArtistId: v.optional(v.id("artists")),
        endArtistId: v.optional(v.id("artists")),
        episodeId: v.optional(v.id("episodes")),
        traversalAlgorithm: v.optional(v.string()),
        constraints: v.optional(v.string()),
      })
    ),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const playlistId = await ctx.db.insert("playlists", {
      title: args.title,
      description: args.description,
      userId: args.userId,
      sessionId: args.sessionId,
      trackIds: args.trackIds,
      trackOrder: args.trackIds.map((_, i) => i),
      generatedFrom: args.generatedFrom,
      isPublic: args.isPublic ?? false,
      createdAt: now,
      updatedAt: now,
    });

    return playlistId;
  },
});

// ─────────────────────────────────────────────────────────────
//  Add / remove / reorder tracks
// ─────────────────────────────────────────────────────────────

export const addTrack = mutation({
  args: {
    playlistId: v.id("playlists"),
    trackId: v.id("tracks"),
    position: v.optional(v.number()), // Insert at position, or append
  },
  handler: async (ctx, { playlistId, trackId, position }) => {
    const playlist = await ctx.db.get(playlistId);
    if (!playlist) throw new Error("Playlist not found");

    const newTrackIds = [...playlist.trackIds];
    const newOrder = [...playlist.trackOrder];

    if (position !== undefined && position < newTrackIds.length) {
      newTrackIds.splice(position, 0, trackId);
      newOrder.splice(position, 0, newOrder.length);
    } else {
      newTrackIds.push(trackId);
      newOrder.push(newOrder.length);
    }

    await ctx.db.patch(playlistId, {
      trackIds: newTrackIds,
      trackOrder: newOrder,
      updatedAt: Date.now(),
    });
  },
});

export const removeTrack = mutation({
  args: {
    playlistId: v.id("playlists"),
    trackId: v.id("tracks"),
  },
  handler: async (ctx, { playlistId, trackId }) => {
    const playlist = await ctx.db.get(playlistId);
    if (!playlist) throw new Error("Playlist not found");

    const index = playlist.trackIds.findIndex(
      (id) => id.toString() === trackId.toString()
    );
    if (index === -1) return;

    const newTrackIds = [...playlist.trackIds];
    const newOrder = [...playlist.trackOrder];
    newTrackIds.splice(index, 1);
    newOrder.splice(index, 1);

    await ctx.db.patch(playlistId, {
      trackIds: newTrackIds,
      trackOrder: newOrder,
      updatedAt: Date.now(),
    });
  },
});

export const reorderTracks = mutation({
  args: {
    playlistId: v.id("playlists"),
    trackIds: v.array(v.id("tracks")), // New order
  },
  handler: async (ctx, { playlistId, trackIds }) => {
    await ctx.db.patch(playlistId, {
      trackIds,
      trackOrder: trackIds.map((_, i) => i),
      updatedAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────
//  Set cover art (generated or from track)
// ─────────────────────────────────────────────────────────────

export const setCoverArt = mutation({
  args: {
    playlistId: v.id("playlists"),
    generatedUrl: v.optional(v.string()),
    prompt: v.optional(v.string()),
  },
  handler: async (ctx, { playlistId, generatedUrl, prompt }) => {
    const playlist = await ctx.db.get(playlistId);
    if (!playlist) throw new Error("Playlist not found");

    // Get first track's album art as fallback
    let sourceTrackArtUrl: string | undefined;
    if (playlist.trackIds.length > 0) {
      const firstTrack = await ctx.db.get(playlist.trackIds[0]);
      sourceTrackArtUrl = firstTrack?.albumArt?.primaryUrl;
    }

    await ctx.db.patch(playlistId, {
      coverArt: {
        generatedUrl,
        prompt,
        sourceTrackArtUrl,
      },
      updatedAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────
//  Record playlist export
// ─────────────────────────────────────────────────────────────

export const recordExport = mutation({
  args: {
    playlistId: v.id("playlists"),
    platform: v.union(
      v.literal("spotify"),
      v.literal("apple_music"),
      v.literal("youtube_music"),
      v.literal("tidal"),
      v.literal("m3u"),
      v.literal("json")
    ),
    externalId: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
  },
  handler: async (ctx, { playlistId, platform, externalId, externalUrl }) => {
    const playlist = await ctx.db.get(playlistId);
    if (!playlist) throw new Error("Playlist not found");

    const currentExports = playlist.exports || [];
    await ctx.db.patch(playlistId, {
      exports: [
        ...currentExports,
        {
          platform,
          externalId,
          externalUrl,
          exportedAt: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────
//  Generate .m3u export content
// ─────────────────────────────────────────────────────────────

export const generateM3u = query({
  args: { playlistId: v.id("playlists") },
  handler: async (ctx, { playlistId }) => {
    const playlist = await ctx.db.get(playlistId);
    if (!playlist) return null;

    let m3u = `#EXTM3U\n#PLAYLIST:${playlist.title}\n`;

    for (const trackId of playlist.trackIds) {
      const track = await ctx.db.get(trackId);
      if (!track) continue;

      const duration = track.sonicFeatures?.durationMs
        ? Math.round(track.sonicFeatures.durationMs / 1000)
        : -1;

      m3u += `#EXTINF:${duration},${track.artistName} - ${track.title}\n`;

      // If we have a YouTube video, use its URL
      if (track.youtubeVideoId) {
        m3u += `https://www.youtube.com/watch?v=${track.youtubeVideoId}\n`;
      } else {
        m3u += `# No streaming URL available\n`;
      }
    }

    return m3u;
  },
});
