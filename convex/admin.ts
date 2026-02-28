// convex/admin.ts
// Admin tools: playlist text parser, review search, enrichment controls
// These power the admin dashboard for managing the knowledge graph

import { v } from "convex/values";
import { mutation, action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════════════════════
//  PLAYLIST TEXT PARSER
//  Paste raw text → parse into structured episode + tracks
//  Handles common formats from Mixcloud, show notes, spreadsheets
// ═══════════════════════════════════════════════════════════════

export const parseAndIngestPlaylist = mutation({
  args: {
    rawText: v.string(),
    episodeTitle: v.string(),
    airDate: v.string(), // ISO date
    slug: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceType: v.optional(
      v.union(
        v.literal("mixcloud"),
        v.literal("soundcloud"),
        v.literal("podcast_rss"),
        v.literal("manual")
      )
    ),
    parseFormat: v.optional(
      v.union(
        v.literal("auto"), // Try all formats
        v.literal("artist_dash_title"), // "Artist - Track Title"
        v.literal("artist_dash_title_album"), // "Artist - Track Title (Album)"
        v.literal("numbered"), // "1. Artist - Track Title"
        v.literal("tab_separated"), // "Artist\tTrack\tAlbum"
        v.literal("mixcloud") // Mixcloud tracklist format
      )
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const format = args.parseFormat || "auto";
    const lines = args.rawText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const parsedTracks: Array<{
      title: string;
      artistName: string;
      albumTitle?: string;
      albumYear?: number;
      label?: string;
    }> = [];

    for (const line of lines) {
      const parsed = parseLine(line, format);
      if (parsed) {
        parsedTracks.push(parsed);
      }
    }

    if (parsedTracks.length === 0) {
      return {
        status: "error",
        message: "Could not parse any tracks from the text. Try a different format.",
        rawLineCount: lines.length,
      };
    }

    // Generate slug if not provided
    const slug =
      args.slug ||
      args.episodeTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    // Check for existing episode
    const existing = await ctx.db
      .query("episodes")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (existing) {
      return {
        status: "duplicate",
        message: `Episode "${slug}" already exists`,
        episodeId: existing._id,
      };
    }

    // Create episode
    const airDateTimestamp = new Date(args.airDate).getTime();
    const episodeId = await ctx.db.insert("episodes", {
      title: args.episodeTitle,
      slug,
      airDate: args.airDate,
      airDateTimestamp,
      sourceUrl: args.sourceUrl,
      sourceType: args.sourceType || "manual",
      trackCount: parsedTracks.length,
      enrichmentStatus: "raw",
      createdAt: now,
      updatedAt: now,
    });

    // Create tracks and artist stubs
    const createdArtists: string[] = [];
    const trackIds = [];

    for (let i = 0; i < parsedTracks.length; i++) {
      const t = parsedTracks[i];

      // Find or create artist
      const normalized = t.artistName.trim();
      let artist = await ctx.db
        .query("artists")
        .withIndex("by_name", (q) => q.eq("name", normalized))
        .first();

      let artistId;
      if (artist) {
        artistId = artist._id;
      } else {
        artistId = await ctx.db.insert("artists", {
          name: normalized,
          enrichmentStatus: "stub",
          createdAt: now,
          updatedAt: now,
        });
        createdArtists.push(normalized);
      }

      // Create track
      const trackId = await ctx.db.insert("tracks", {
        title: t.title,
        artistId,
        artistName: normalized,
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

    // Create playlist-adjacent connections
    let connectionsCreated = 0;
    for (let i = 0; i < trackIds.length - 1; i++) {
      const currentTrack = await ctx.db.get(trackIds[i]);
      const nextTrack = await ctx.db.get(trackIds[i + 1]);

      if (
        currentTrack &&
        nextTrack &&
        currentTrack.artistId.toString() !== nextTrack.artistId.toString()
      ) {
        // Normalize direction
        const [sourceId, targetId] =
          currentTrack.artistId.toString() < nextTrack.artistId.toString()
            ? [currentTrack.artistId, nextTrack.artistId]
            : [nextTrack.artistId, currentTrack.artistId];

        const existing = await ctx.db
          .query("artistConnections")
          .withIndex("by_pair", (q) =>
            q.eq("sourceArtistId", sourceId).eq("targetArtistId", targetId)
          )
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            weight: existing.weight + 1,
            playlistAdjacentCount: (existing.playlistAdjacentCount || 0) + 1,
            episodeIds: [...(existing.episodeIds || []), episodeId],
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("artistConnections", {
            sourceArtistId: sourceId,
            targetArtistId: targetId,
            weight: 1,
            connectionTypes: ["playlist_adjacent"],
            playlistAdjacentCount: 1,
            episodeIds: [episodeId],
            evidence: [
              {
                type: "playlist",
                source: args.episodeTitle,
                excerpt: "Played sequentially in Rhythm Lab Radio",
              },
            ],
            createdAt: now,
            updatedAt: now,
          });
          connectionsCreated++;
        }
      }
    }

    // Queue enrichment for new artists
    for (const artistName of createdArtists) {
      const artist = await ctx.db
        .query("artists")
        .withIndex("by_name", (q) => q.eq("name", artistName))
        .first();
      if (artist) {
        await ctx.db.insert("enrichmentJobs", {
          targetType: "artist",
          targetId: artist._id.toString(),
          targetName: artistName,
          step: "musicbrainz_lookup",
          priority: "normal",
          status: "queued",
          attempts: 0,
          maxAttempts: 3,
          scheduledAt: now,
          createdAt: now,
        });
      }
    }

    return {
      status: "success",
      episodeId,
      tracksParsed: parsedTracks.length,
      newArtistsCreated: createdArtists.length,
      connectionsCreated,
      enrichmentJobsQueued: createdArtists.length,
      parsedTracks, // Return for preview/confirmation
    };
  },
});

// ─────────────────────────────────────────────────────────────
//  Preview parse without saving (for admin UI confirmation)
// ─────────────────────────────────────────────────────────────

export const previewParse = mutation({
  args: {
    rawText: v.string(),
    parseFormat: v.optional(v.string()),
  },
  handler: async (ctx, { rawText, parseFormat }) => {
    const format = (parseFormat as any) || "auto";
    const lines = rawText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const results = lines.map((line) => {
      const parsed = parseLine(line, format);
      return {
        raw: line,
        parsed,
        success: !!parsed,
      };
    });

    const successCount = results.filter((r) => r.success).length;

    return {
      totalLines: lines.length,
      successfullyParsed: successCount,
      failedLines: results.filter((r) => !r.success).map((r) => r.raw),
      preview: results.filter((r) => r.success).map((r) => r.parsed),
      suggestedFormat: detectBestFormat(lines),
    };
  },
});

// ─────────────────────────────────────────────────────────────
//  Line parser — handles multiple tracklist formats
// ─────────────────────────────────────────────────────────────

function parseLine(
  line: string,
  format: string
): {
  title: string;
  artistName: string;
  albumTitle?: string;
  albumYear?: number;
  label?: string;
} | null {
  // Skip obvious non-track lines
  if (
    line.startsWith("#") ||
    line.startsWith("//") ||
    line.toLowerCase().startsWith("tracklist") ||
    line.toLowerCase().startsWith("playlist") ||
    line.toLowerCase().startsWith("episode") ||
    line.toLowerCase().startsWith("aired") ||
    line.toLowerCase().startsWith("date:") ||
    line.length < 5
  ) {
    return null;
  }

  const formats =
    format === "auto"
      ? [
          "numbered",
          "artist_dash_title_album",
          "artist_dash_title",
          "tab_separated",
          "mixcloud",
        ]
      : [format];

  for (const fmt of formats) {
    const result = tryFormat(line, fmt);
    if (result) return result;
  }

  return null;
}

function tryFormat(
  line: string,
  format: string
): {
  title: string;
  artistName: string;
  albumTitle?: string;
  albumYear?: number;
  label?: string;
} | null {
  switch (format) {
    case "numbered": {
      // "1. Artist - Track Title" or "01. Artist - Track Title"
      // Also handles "1) Artist - Track Title"
      const numberedMatch = line.match(
        /^\d+[\.\)]\s*(.+?)\s*[-–—]\s*(.+?)(?:\s*[\(\[](.+?)[\)\]])?$/
      );
      if (numberedMatch) {
        const albumAndYear = parseAlbumAndYear(numberedMatch[3]);
        return {
          artistName: numberedMatch[1].trim(),
          title: numberedMatch[2].trim(),
          ...albumAndYear,
        };
      }
      return null;
    }

    case "artist_dash_title_album": {
      // "Artist - Track Title (Album, Year)" or "Artist - Track Title [Label]"
      const fullMatch = line.match(
        /^(.+?)\s*[-–—]\s*(.+?)\s*[\(\[](.+?)[\)\]]$/
      );
      if (fullMatch) {
        const albumAndYear = parseAlbumAndYear(fullMatch[3]);
        return {
          artistName: fullMatch[1].trim(),
          title: fullMatch[2].trim(),
          ...albumAndYear,
        };
      }
      return null;
    }

    case "artist_dash_title": {
      // "Artist - Track Title" (most common)
      const dashMatch = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch) {
        // Make sure both sides have content
        const artist = dashMatch[1].trim();
        const title = dashMatch[2].trim();
        if (artist.length > 0 && title.length > 0) {
          return { artistName: artist, title };
        }
      }
      return null;
    }

    case "tab_separated": {
      // "Artist\tTrack\tAlbum\tYear\tLabel"
      const parts = line.split("\t").map((p) => p.trim());
      if (parts.length >= 2) {
        return {
          artistName: parts[0],
          title: parts[1],
          albumTitle: parts[2] || undefined,
          albumYear: parts[3] ? parseInt(parts[3]) || undefined : undefined,
          label: parts[4] || undefined,
        };
      }
      return null;
    }

    case "mixcloud": {
      // Mixcloud format: "timestamp Artist - Track" or just "Artist - Track"
      // Strip leading timestamps like "00:00:00" or "0:00"
      const stripped = line.replace(/^[\d:]+\s+/, "");
      const dashMatch = stripped.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch) {
        return {
          artistName: dashMatch[1].trim(),
          title: dashMatch[2].trim(),
        };
      }
      return null;
    }

    default:
      return null;
  }
}

function parseAlbumAndYear(raw?: string): {
  albumTitle?: string;
  albumYear?: number;
  label?: string;
} {
  if (!raw) return {};

  // Try to extract year from the end: "Album Name, 2023" or "Album Name (2023)"
  const yearMatch = raw.match(/^(.+?),?\s*(\d{4})$/);
  if (yearMatch) {
    return {
      albumTitle: yearMatch[1].trim(),
      albumYear: parseInt(yearMatch[2]),
    };
  }

  // Check if it's just a year
  const justYear = raw.match(/^\d{4}$/);
  if (justYear) {
    return { albumYear: parseInt(raw) };
  }

  // Check if it looks like a label (often in square brackets)
  if (raw.includes("Records") || raw.includes("Music") || raw.includes("Label")) {
    return { label: raw.trim() };
  }

  // Otherwise treat as album title
  return { albumTitle: raw.trim() };
}

function detectBestFormat(lines: string[]): string {
  let scores: Record<string, number> = {
    numbered: 0,
    artist_dash_title_album: 0,
    artist_dash_title: 0,
    tab_separated: 0,
    mixcloud: 0,
  };

  for (const line of lines.slice(0, 10)) {
    // Sample first 10 lines
    if (/^\d+[\.\)]/.test(line)) scores.numbered += 2;
    if (line.includes("\t")) scores.tab_separated += 3;
    if (/^[\d:]+\s/.test(line)) scores.mixcloud += 2;
    if (/[\(\[]/.test(line) && /[-–—]/.test(line))
      scores.artist_dash_title_album += 2;
    if (/[-–—]/.test(line)) scores.artist_dash_title += 1;
  }

  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

// ═══════════════════════════════════════════════════════════════
//  SHOW NOTES / BLOG POST INGESTION
//  Paste raw show notes → extract text for NER pipeline
// ═══════════════════════════════════════════════════════════════

export const ingestShowNotes = mutation({
  args: {
    episodeId: v.id("episodes"),
    showNotesHtml: v.optional(v.string()),
    showNotesPlaintext: v.string(),
  },
  handler: async (ctx, { episodeId, showNotesHtml, showNotesPlaintext }) => {
    await ctx.db.patch(episodeId, {
      showNotesHtml,
      showNotesPlaintext,
      enrichmentStatus: "notes_parsed",
      updatedAt: Date.now(),
    });

    return { status: "success", episodeId };
  },
});

// ═══════════════════════════════════════════════════════════════
//  REVIEW CORPUS MANAGEMENT
//  Add reviews manually or via search results
// ═══════════════════════════════════════════════════════════════

// Manually add a review (from admin or from agent search results)
export const addReview = mutation({
  args: {
    publication: v.union(
      v.literal("npr"),
      v.literal("pitchfork"),
      v.literal("the_quietus"),
      v.literal("rhythm_lab"),
      v.literal("the_intersection"),
      v.literal("genius"),
      v.literal("resident_advisor"),
      v.literal("bandcamp_daily"),
      v.literal("the_wire"),
      v.literal("the_fader"),
      v.literal("stereogum"),
      v.literal("tiny_mix_tapes"),
      v.literal("aquarium_drunkard"),
      v.literal("okayplayer"),
      v.literal("the_vinyl_factory"),
      v.literal("fact_mag"),
      v.literal("dj_mag"),
      v.literal("xlr8r"),
      v.literal("other")
    ),
    author: v.optional(v.string()),
    title: v.optional(v.string()),
    url: v.optional(v.string()),
    publishDate: v.optional(v.string()),
    excerpt: v.string(),
    fullText: v.optional(v.string()),
    primaryArtistName: v.optional(v.string()),
    albumTitle: v.optional(v.string()),
    rating: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Resolve primary artist if name provided
    let primaryArtistId;
    if (args.primaryArtistName) {
      const artist = await ctx.db
        .query("artists")
        .withIndex("by_name", (q) => q.eq("name", args.primaryArtistName!))
        .first();
      primaryArtistId = artist?._id;
    }

    const reviewId = await ctx.db.insert("reviews", {
      publication: args.publication,
      author: args.author,
      title: args.title,
      url: args.url,
      publishDate: args.publishDate,
      excerpt: args.excerpt,
      fullText: args.fullText,
      primaryArtistId,
      primaryArtistName: args.primaryArtistName,
      albumTitle: args.albumTitle,
      rating: args.rating,
      nerProcessed: false,
      createdAt: now,
    });

    // Queue NER processing
    await ctx.db.insert("enrichmentJobs", {
      targetType: "review",
      targetId: reviewId.toString(),
      targetName: `${args.publication}: ${args.primaryArtistName || "unknown"} - ${args.albumTitle || args.title || "review"}`,
      step: "ner_extraction",
      priority: "normal",
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      scheduledAt: now,
      createdAt: now,
    });

    return { reviewId, status: "success" };
  },
});

// Bulk add reviews (from a curated corpus import)
export const bulkAddReviews = mutation({
  args: {
    reviews: v.array(
      v.object({
        publication: v.string(),
        author: v.optional(v.string()),
        title: v.optional(v.string()),
        url: v.optional(v.string()),
        publishDate: v.optional(v.string()),
        excerpt: v.string(),
        primaryArtistName: v.optional(v.string()),
        albumTitle: v.optional(v.string()),
        rating: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, { reviews }) => {
    const now = Date.now();
    let added = 0;

    for (const review of reviews) {
      let primaryArtistId;
      if (review.primaryArtistName) {
        const artist = await ctx.db
          .query("artists")
          .withIndex("by_name", (q) => q.eq("name", review.primaryArtistName!))
          .first();
        primaryArtistId = artist?._id;
      }

      await ctx.db.insert("reviews", {
        publication: review.publication as any,
        author: review.author,
        title: review.title,
        url: review.url,
        publishDate: review.publishDate,
        excerpt: review.excerpt,
        primaryArtistId,
        primaryArtistName: review.primaryArtistName,
        albumTitle: review.albumTitle,
        rating: review.rating,
        nerProcessed: false,
        createdAt: now,
      });
      added++;
    }

    return { added, status: "success" };
  },
});

// ═══════════════════════════════════════════════════════════════
//  ENRICHMENT CONTROLS (admin dashboard)
// ═══════════════════════════════════════════════════════════════

// Retry all failed enrichment jobs
export const retryFailedJobs = mutation({
  handler: async (ctx) => {
    const failed = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_status_priority", (q) => q.eq("status", "failed"))
      .collect();

    let retried = 0;
    for (const job of failed) {
      if (job.attempts < job.maxAttempts + 1) {
        await ctx.db.patch(job._id, {
          status: "queued",
          attempts: 0,
          lastError: undefined,
        });
        retried++;
      }
    }

    return { retried, totalFailed: failed.length };
  },
});

// Clear completed jobs (housekeeping)
export const clearCompletedJobs = mutation({
  handler: async (ctx) => {
    const completed = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_status_priority", (q) => q.eq("status", "completed"))
      .collect();

    for (const job of completed) {
      await ctx.db.delete(job._id);
    }

    return { cleared: completed.length };
  },
});

// Force re-enrich a specific artist (all layers)
export const forceReenrichArtist = mutation({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    const artist = await ctx.db.get(artistId);
    if (!artist) throw new Error("Artist not found");

    const now = Date.now();
    const steps = [
      "musicbrainz_lookup",
      "discogs_fetch",
      "fanart_tv_fetch",
      "wikimedia_fetch",
      "youtube_match",
    ];

    for (const step of steps) {
      await ctx.db.insert("enrichmentJobs", {
        targetType: "artist",
        targetId: artistId.toString(),
        targetName: artist.name,
        step: step as any,
        priority: "high",
        status: "queued",
        attempts: 0,
        maxAttempts: 3,
        scheduledAt: now,
        createdAt: now,
      });
    }

    // Reset enrichment status
    await ctx.db.patch(artistId, {
      enrichmentStatus: "stub",
      updatedAt: now,
    });

    return { queued: steps.length, artistName: artist.name };
  },
});

// Re-enrich all artists that already have MusicBrainz IDs but are missing images
// Queues only image-related steps; the cron picks them up rate-limited
export const reEnrichAllArtistImages = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const imageSteps = ["discogs_fetch", "fanart_tv_fetch"];

    // Collect artists past the stub stage (they already have MBIDs)
    const identified = await ctx.db
      .query("artists")
      .withIndex("by_enrichmentStatus", (q) => q.eq("enrichmentStatus", "identified"))
      .collect();
    const metadata = await ctx.db
      .query("artists")
      .withIndex("by_enrichmentStatus", (q) => q.eq("enrichmentStatus", "metadata"))
      .collect();
    const complete = await ctx.db
      .query("artists")
      .withIndex("by_enrichmentStatus", (q) => q.eq("enrichmentStatus", "complete"))
      .collect();

    const allArtists = [...identified, ...metadata, ...complete];

    // Only queue for artists missing a primary image
    const needsImages = allArtists.filter(
      (a) => !a.images?.primary?.url
    );

    let queued = 0;
    for (const artist of needsImages) {
      for (const step of imageSteps) {
        await ctx.db.insert("enrichmentJobs", {
          targetType: "artist",
          targetId: artist._id.toString(),
          targetName: artist.name,
          step: step as any,
          priority: "normal",
          status: "queued",
          attempts: 0,
          maxAttempts: 3,
          scheduledAt: now,
          createdAt: now,
        });
      }
      queued++;
    }

    return {
      totalArtists: allArtists.length,
      needingImages: needsImages.length,
      jobsQueued: needsImages.length * imageSteps.length,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
//  GRAPH SNAPSHOT BUILDER
//  Collects all artists + connections → serialized JSON for D3
// ═══════════════════════════════════════════════════════════════

// --- Internal paginated helpers for graph snapshot builder ---

/** Read all connections in pages (lightweight docs, ~3 fields each) */
export const _getConnectionsPage = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db
      .query("artistConnections")
      .paginate({ numItems: 5000, cursor: cursor ?? null });
    return {
      items: result.page.map((c) => ({
        src: c.sourceArtistId,
        tgt: c.targetArtistId,
        w: c.weight,
      })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** Read a page of artists — only the fields needed for graph nodes */
export const _getArtistsPage = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db
      .query("artists")
      .paginate({ numItems: 500, cursor: cursor ?? null });
    return {
      items: result.page.map((a) => ({
        id: a._id,
        name: a.name,
        communityId: a.communityId ?? 0,
        bridgeScore: a.bridgeScore ?? 0,
        imageUrl: a.images?.thumbnail?.url || a.images?.primary?.url || null,
      })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** Save the computed snapshot (called from action) */
export const _saveGraphSnapshot = internalMutation({
  args: {
    label: v.optional(v.string()),
    nodesJson: v.string(),
    edgesJson: v.string(),
    imagesJson: v.string(),
    nodeCount: v.number(),
    edgeCount: v.number(),
  },
  handler: async (ctx, { label, nodesJson, edgesJson, imagesJson, nodeCount, edgeCount }) => {
    const now = Date.now();

    // Deactivate any existing active snapshot
    const activeSnapshot = await ctx.db
      .query("graphSnapshots")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();
    if (activeSnapshot) {
      await ctx.db.patch(activeSnapshot._id, { isActive: false });
    }

    // Get next version
    const latestSnapshot = await ctx.db
      .query("graphSnapshots")
      .withIndex("by_version")
      .order("desc")
      .first();
    const version = (latestSnapshot?.version ?? 0) + 1;

    // Helper: split JSON into chunks under 900KB
    function chunkJson(json: string, field: "nodesJson" | "edgesJson" | "nodeImagesJson") {
      const chunks: Array<Record<string, any>> = [];
      if (json.length < 900_000) {
        chunks.push({ [field]: json });
      } else {
        const arr = JSON.parse(json);
        const entries = Array.isArray(arr) ? arr : Object.entries(arr);
        const perChunk = Math.ceil(entries.length / Math.ceil(json.length / 800_000));
        for (let i = 0; i < entries.length; i += perChunk) {
          const slice = entries.slice(i, i + perChunk);
          const value = Array.isArray(arr) ? slice : Object.fromEntries(slice);
          chunks.push({ [field]: JSON.stringify(value) });
        }
      }
      return chunks;
    }

    const nodesChunks = chunkJson(nodesJson, "nodesJson");
    const edgesChunks = chunkJson(edgesJson, "edgesJson");
    const imagesChunks = chunkJson(imagesJson, "nodeImagesJson");

    const snapshotId = await ctx.db.insert("graphSnapshots", {
      version,
      label: label ?? `v${version}-auto`,
      nodeCount,
      edgeCount,
      communityCount: 0,
      nodesJson: nodesChunks[0].nodesJson,
      edgesJson: edgesChunks[0].edgesJson,
      communitiesJson: JSON.stringify([]),
      isActive: true,
      createdAt: now,
    });

    for (let i = 1; i < nodesChunks.length; i++) {
      await ctx.db.insert("graphSnapshots", {
        version, label: `v${version}-nodes-${i}`, nodeCount: 0, edgeCount: 0, communityCount: 0,
        nodesJson: nodesChunks[i].nodesJson, edgesJson: "[]", communitiesJson: "[]",
        isActive: false, createdAt: now,
      });
    }
    for (let i = 1; i < edgesChunks.length; i++) {
      await ctx.db.insert("graphSnapshots", {
        version, label: `v${version}-edges-${i}`, nodeCount: 0, edgeCount: 0, communityCount: 0,
        nodesJson: "[]", edgesJson: edgesChunks[i].edgesJson, communitiesJson: "[]",
        isActive: false, createdAt: now,
      });
    }
    for (const chunk of imagesChunks) {
      await ctx.db.insert("graphSnapshots", {
        version, label: `v${version}-images`, nodeCount: 0, edgeCount: 0, communityCount: 0,
        nodesJson: "[]", edgesJson: "[]", communitiesJson: "[]",
        nodeImagesJson: chunk.nodeImagesJson,
        isActive: false, createdAt: now,
      });
    }

    return { snapshotId, version, nodeCount, edgeCount };
  },
});

/** Build graph snapshot — action that paginates reads to avoid 16MB limit */
export const buildGraphSnapshot = action({
  args: {
    label: v.optional(v.string()),
    minConnections: v.optional(v.number()),
  },
  handler: async (ctx, { label, minConnections = 2 }): Promise<{ snapshotId: string; version: number; nodeCount: number; edgeCount: number }> => {
    // Step 1: Paginate through all connections
    const allConns: Array<{ src: string; tgt: string; w: number }> = [];
    let cursor: string | undefined = undefined;
    let done = false;
    while (!done) {
      const page: any = await ctx.runQuery(internal.admin._getConnectionsPage, { cursor });
      allConns.push(...page.items);
      cursor = page.cursor;
      done = page.isDone;
    }

    // Step 2: Count connections per artist
    const connectionCount = new Map<string, number>();
    for (const conn of allConns) {
      connectionCount.set(conn.src, (connectionCount.get(conn.src) || 0) + 1);
      connectionCount.set(conn.tgt, (connectionCount.get(conn.tgt) || 0) + 1);
    }

    const includedIds = new Set<string>();
    for (const [id, count] of connectionCount) {
      if (count >= minConnections) includedIds.add(id);
    }

    // Step 3: Paginate through artists, keep only included ones
    const nodes: Array<{ id: string; name: string; c: number; s: number; bs: number }> = [];
    const nodeImages: Record<string, string> = {};
    cursor = undefined;
    done = false;
    while (!done) {
      const page: any = await ctx.runQuery(internal.admin._getArtistsPage, { cursor });
      for (const a of page.items) {
        if (!includedIds.has(a.id)) continue;
        nodes.push({
          id: a.id,
          name: a.name,
          c: a.communityId,
          s: Math.max(3, connectionCount.get(a.id) || 0),
          bs: a.bridgeScore,
        });
        if (a.imageUrl) nodeImages[a.id] = a.imageUrl;
      }
      cursor = page.cursor;
      done = page.isDone;
    }

    // Step 4: Filter edges to included artists
    const edges = allConns
      .filter((c) => includedIds.has(c.src) && includedIds.has(c.tgt))
      .map((c) => ({ source: c.src, target: c.tgt, w: c.w }));

    // Step 5: Save via mutation
    const result = await ctx.runMutation(internal.admin._saveGraphSnapshot, {
      label,
      nodesJson: JSON.stringify(nodes),
      edgesJson: JSON.stringify(edges),
      imagesJson: JSON.stringify(nodeImages),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    });

    return result;
  },
});

// ═══════════════════════════════════════════════════════════════
//  EPISODE DATE MANAGEMENT
//  Parse dates from titles + manual editing
// ═══════════════════════════════════════════════════════════════

// Update a single episode's air date (admin manual edit)
export const updateEpisodeDate = mutation({
  args: {
    episodeId: v.id("episodes"),
    airDate: v.string(), // ISO date string YYYY-MM-DD
  },
  handler: async (ctx, { episodeId, airDate }) => {
    const episode = await ctx.db.get(episodeId);
    if (!episode) throw new Error("Episode not found");

    const airDateTimestamp = new Date(airDate).getTime();
    await ctx.db.patch(episodeId, {
      airDate,
      airDateTimestamp,
      updatedAt: Date.now(),
    });

    return { episodeId, oldDate: episode.airDate, newDate: airDate };
  },
});

// Parse a M-D-YY or M-D-YYYY date pattern from an episode title
function parseDateFromTitle(title: string): string | null {
  // Pattern 1: M-D-YY or M-D-YYYY anywhere in the title
  // Match the LAST occurrence (most likely the actual air date, not a year reference)
  const dateMatches = [...title.matchAll(/(\d{1,2})-(\d{1,2})-(\d{2,4})/g)];
  if (dateMatches.length > 0) {
    const match = dateMatches[dateMatches.length - 1]; // take the last one
    let [, month, day, year] = match;
    if (year.length === 2) {
      year = parseInt(year) > 50 ? "19" + year : "20" + year;
    }
    const m = parseInt(month);
    const d = parseInt(day);
    const y = parseInt(year);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2030) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  // Pattern 2: compact 4-digit MMDD at end, e.g. "Part 2 1215"
  const compactMatch = title.match(/\b(\d{2})(\d{2})\s*$/);
  if (compactMatch) {
    const m = parseInt(compactMatch[1]);
    const d = parseInt(compactMatch[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const yearMatch = title.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        return `${yearMatch[1]}-${compactMatch[1]}-${compactMatch[2]}`;
      }
    }
  }

  // Pattern 2b: compact 5-6 digit MDDYY or MMDDYY, e.g. "52413" = May 24, 2013, "101813"
  const compact6 = title.match(/\b(\d{5,6})\b/);
  if (compact6) {
    const s = compact6[1];
    let m: number, d: number, yy: number;
    if (s.length === 5) {
      m = parseInt(s[0]);
      d = parseInt(s.slice(1, 3));
      yy = parseInt(s.slice(3));
    } else {
      m = parseInt(s.slice(0, 2));
      d = parseInt(s.slice(2, 4));
      yy = parseInt(s.slice(4));
    }
    const year = yy > 50 ? 1900 + yy : 2000 + yy;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && year >= 2000 && year <= 2030) {
      return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // Pattern 2c: M/D/YY or M/D/YYYY with slashes, e.g. "2/21/00"
  const slashMatch = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    let [, month, day, year] = slashMatch;
    if (year.length === 2) {
      year = parseInt(year) > 50 ? "19" + year : "20" + year;
    }
    const m2 = parseInt(month);
    const d2 = parseInt(day);
    if (m2 >= 1 && m2 <= 12 && d2 >= 1 && d2 <= 31) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  // Pattern 2d: "Month D, YYYY" e.g. "Feb 1, 2019" or "Jan 7"
  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const namedMatch = title.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i);
  if (namedMatch) {
    const mon = MONTHS[namedMatch[1].toLowerCase()];
    const day = namedMatch[2].padStart(2, "0");
    let year: string | undefined = namedMatch[3];
    if (!year) {
      const yearMatch = title.match(/\b(20\d{2})\b/);
      year = yearMatch?.[1];
    }
    if (mon && year) {
      return `${year}-${mon}-${day}`;
    }
  }

  // Pattern 3: "Best of YYYY" or "Best Songs of YYYY" — use Jan 1 of following year
  const bestOfMatch = title.match(/Best\s+(?:Songs?\s+)?of\s+(20\d{2})/i);
  if (bestOfMatch) {
    const year = parseInt(bestOfMatch[1]) + 1;
    return `${year}-01-01`;
  }

  // Pattern 4: "Top albums YYYY" — use Dec 31 of that year
  const topAlbumsMatch = title.match(/Top\s+albums?\s+(20\d{2})/i);
  if (topAlbumsMatch) {
    return `${topAlbumsMatch[1]}-12-31`;
  }

  return null;
}

// Backfill: parse dates from titles for all episodes with fallback date
export const backfillEpisodeDates = mutation({
  args: {},
  handler: async (ctx) => {
    const episodes = await ctx.db.query("episodes").collect();
    const fallbackDate = "2020-01-01";

    let fixed = 0;
    let unfixable = 0;
    const unfixableList: Array<{ id: string; title: string }> = [];

    for (const ep of episodes) {
      if (ep.airDate !== fallbackDate) continue;

      // Skip "Notes" episodes — these are show notes, not full episodes
      if (/\bNotes\b/i.test(ep.title)) {
        unfixable++;
        unfixableList.push({ id: ep._id, title: ep.title });
        continue;
      }

      const parsed = parseDateFromTitle(ep.title);
      if (parsed) {
        await ctx.db.patch(ep._id, {
          airDate: parsed,
          airDateTimestamp: new Date(parsed).getTime(),
          updatedAt: Date.now(),
        });
        fixed++;
      } else {
        unfixable++;
        unfixableList.push({ id: ep._id, title: ep.title });
      }
    }

    return {
      fixed,
      unfixable,
      unfixableList: unfixableList.slice(0, 50), // return first 50 for review
    };
  },
});
