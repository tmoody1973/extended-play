// convex/ingest.ts
// Layer 0: Raw playlist ingestion — creates episode, track, and artist stubs
// This is the first step: get the raw playlist data into Convex

import { v } from "convex/values";
import { mutation, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────
//  Ingest a single episode with its tracklist
// ─────────────────────────────────────────────────────────────

export const ingestEpisode = mutation({
  args: {
    title: v.string(),
    slug: v.string(),
    airDate: v.string(),
    description: v.optional(v.string()),
    showNotesHtml: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceType: v.optional(
      v.union(
        v.literal("mixcloud"),
        v.literal("soundcloud"),
        v.literal("podcast_rss"),
        v.literal("manual")
      )
    ),
    coverImageUrl: v.optional(v.string()),
    tracks: v.array(
      v.object({
        title: v.string(),
        artistName: v.string(),
        albumTitle: v.optional(v.string()),
        albumYear: v.optional(v.number()),
        label: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const airDateTimestamp = new Date(args.airDate).getTime();

    // Check if episode already exists
    const existing = await ctx.db
      .query("episodes")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      return { episodeId: existing._id, status: "already_exists" };
    }

    // Create the episode
    const episodeId = await ctx.db.insert("episodes", {
      title: args.title,
      slug: args.slug,
      airDate: args.airDate,
      airDateTimestamp,
      description: args.description,
      showNotesHtml: args.showNotesHtml,
      sourceUrl: args.sourceUrl,
      sourceType: args.sourceType,
      coverImageUrl: args.coverImageUrl,
      trackCount: args.tracks.length,
      enrichmentStatus: "raw",
      createdAt: now,
      updatedAt: now,
    });

    // For each track: find or create artist stub, create track record
    const trackIds = [];
    for (let i = 0; i < args.tracks.length; i++) {
      const t = args.tracks[i];

      // Find or create artist
      const artistId = await findOrCreateArtist(ctx, t.artistName, now);

      // Create track
      const trackId = await ctx.db.insert("tracks", {
        title: t.title,
        artistId,
        artistName: t.artistName,
        episodeId,
        position: i + 1,
        albumTitle: t.albumTitle,
        albumYear: t.albumYear,
        label: t.label,
        enrichmentStatus: "raw",
        createdAt: now,
        updatedAt: now,
      });

      trackIds.push(trackId);
    }

    // Create playlist-adjacent connections for sequential tracks
    for (let i = 0; i < args.tracks.length - 1; i++) {
      const currentTrack = await ctx.db.get(trackIds[i]);
      const nextTrack = await ctx.db.get(trackIds[i + 1]);

      if (currentTrack && nextTrack && currentTrack.artistId !== nextTrack.artistId) {
        await findOrCreateConnection(
          ctx,
          currentTrack.artistId,
          nextTrack.artistId,
          episodeId,
          now
        );
      }
    }

    return {
      episodeId,
      trackCount: trackIds.length,
      status: "ingested",
    };
  },
});

// ─────────────────────────────────────────────────────────────
//  Bulk ingest multiple episodes (for initial load)
// ─────────────────────────────────────────────────────────────

export const bulkIngestEpisodes = action({
  args: {
    episodes: v.array(
      v.object({
        title: v.string(),
        slug: v.string(),
        airDate: v.string(),
        description: v.optional(v.string()),
        showNotesHtml: v.optional(v.string()),
        sourceUrl: v.optional(v.string()),
        sourceType: v.optional(
          v.union(
            v.literal("mixcloud"),
            v.literal("soundcloud"),
            v.literal("podcast_rss"),
            v.literal("manual")
          )
        ),
        coverImageUrl: v.optional(v.string()),
        tracks: v.array(
          v.object({
            title: v.string(),
            artistName: v.string(),
            albumTitle: v.optional(v.string()),
            albumYear: v.optional(v.number()),
            label: v.optional(v.string()),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args): Promise<{ ingested: number; results: any[] }> => {
    const results: any[] = [];
    for (const episode of args.episodes) {
      const result = await ctx.runMutation(internal.ingest.ingestEpisodeInternal, episode);
      results.push(result);
    }
    return { ingested: results.length, results };
  },
});

// Internal version for use in actions
export const ingestEpisodeInternal = internalMutation({
  args: {
    title: v.string(),
    slug: v.string(),
    airDate: v.string(),
    description: v.optional(v.string()),
    showNotesHtml: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceType: v.optional(
      v.union(
        v.literal("mixcloud"),
        v.literal("soundcloud"),
        v.literal("podcast_rss"),
        v.literal("manual")
      )
    ),
    coverImageUrl: v.optional(v.string()),
    tracks: v.array(
      v.object({
        title: v.string(),
        artistName: v.string(),
        albumTitle: v.optional(v.string()),
        albumYear: v.optional(v.number()),
        label: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const airDateTimestamp = new Date(args.airDate).getTime();

    const existing = await ctx.db
      .query("episodes")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) return { episodeId: existing._id, status: "already_exists" };

    const episodeId = await ctx.db.insert("episodes", {
      title: args.title,
      slug: args.slug,
      airDate: args.airDate,
      airDateTimestamp,
      description: args.description,
      showNotesHtml: args.showNotesHtml,
      sourceUrl: args.sourceUrl,
      sourceType: args.sourceType,
      coverImageUrl: args.coverImageUrl,
      trackCount: args.tracks.length,
      enrichmentStatus: "raw",
      createdAt: now,
      updatedAt: now,
    });

    const trackIds = [];
    for (let i = 0; i < args.tracks.length; i++) {
      const t = args.tracks[i];
      const artistId = await findOrCreateArtist(ctx, t.artistName, now);
      const trackId = await ctx.db.insert("tracks", {
        title: t.title,
        artistId,
        artistName: t.artistName,
        episodeId,
        position: i + 1,
        albumTitle: t.albumTitle,
        albumYear: t.albumYear,
        label: t.label,
        enrichmentStatus: "raw",
        createdAt: now,
        updatedAt: now,
      });
      trackIds.push(trackId);
    }

    // Create playlist-adjacent edges
    for (let i = 0; i < args.tracks.length - 1; i++) {
      const currentTrack = await ctx.db.get(trackIds[i]);
      const nextTrack = await ctx.db.get(trackIds[i + 1]);
      if (currentTrack && nextTrack && currentTrack.artistId !== nextTrack.artistId) {
        await findOrCreateConnection(ctx, currentTrack.artistId, nextTrack.artistId, episodeId, now);
      }
    }

    return { episodeId, trackCount: trackIds.length, status: "ingested" };
  },
});

// ─────────────────────────────────────────────────────────────
//  Helper: Find or create an artist stub by name
// ─────────────────────────────────────────────────────────────

async function findOrCreateArtist(
  ctx: any,
  artistName: string,
  now: number
) {
  // Normalize the name for lookup
  const normalized = artistName.trim();

  // Search for existing artist by exact name
  const existing = await ctx.db
    .query("artists")
    .withIndex("by_name", (q: any) => q.eq("name", normalized))
    .first();

  if (existing) return existing._id;

  // Create stub artist
  const artistId = await ctx.db.insert("artists", {
    name: normalized,
    enrichmentStatus: "stub",
    createdAt: now,
    updatedAt: now,
  });

  return artistId;
}

// ─────────────────────────────────────────────────────────────
//  Helper: Find or create/update a connection between artists
// ─────────────────────────────────────────────────────────────

async function findOrCreateConnection(
  ctx: any,
  artistA: any,
  artistB: any,
  episodeId: any,
  now: number
) {
  // Normalize direction: always store with smaller ID as source
  const [sourceId, targetId] =
    artistA.toString() < artistB.toString()
      ? [artistA, artistB]
      : [artistB, artistA];

  // Check for existing connection
  const existing = await ctx.db
    .query("artistConnections")
    .withIndex("by_pair", (q: any) =>
      q.eq("sourceArtistId", sourceId).eq("targetArtistId", targetId)
    )
    .first();

  if (existing) {
    // Increment playlist adjacent count
    const currentCount = existing.playlistAdjacentCount || 0;
    const currentEpisodes = existing.episodeIds || [];
    const updatedTypes = existing.connectionTypes.includes("playlist_adjacent")
      ? existing.connectionTypes
      : [...existing.connectionTypes, "playlist_adjacent"];

    await ctx.db.patch(existing._id, {
      weight: existing.weight + 1,
      playlistAdjacentCount: currentCount + 1,
      episodeIds: [...currentEpisodes, episodeId],
      connectionTypes: updatedTypes,
      updatedAt: now,
    });
    return existing._id;
  }

  // Create new connection
  const connectionId = await ctx.db.insert("artistConnections", {
    sourceArtistId: sourceId,
    targetArtistId: targetId,
    weight: 1,
    connectionTypes: ["playlist_adjacent"],
    playlistAdjacentCount: 1,
    episodeIds: [episodeId],
    evidence: [
      {
        type: "playlist",
        source: `Episode`,
        excerpt: "Played sequentially in Rhythm Lab Radio episode",
      },
    ],
    createdAt: now,
    updatedAt: now,
  });

  return connectionId;
}
