// convex/admin.ts
// Admin tools: playlist text parser, review search, enrichment controls
// These power the admin dashboard for managing the knowledge graph

import { v } from "convex/values";
import { mutation, action, internalMutation } from "./_generated/server";
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

// ═══════════════════════════════════════════════════════════════
//  GRAPH SNAPSHOT BUILDER
//  Collects all artists + connections → serialized JSON for D3
// ═══════════════════════════════════════════════════════════════

export const buildGraphSnapshot = mutation({
  args: {
    label: v.optional(v.string()),
  },
  handler: async (ctx, { label }) => {
    const now = Date.now();

    // Collect all artists with at least one connection
    const allArtists = await ctx.db.query("artists").collect();
    const allConnections = await ctx.db.query("artistConnections").collect();

    // Build set of artist IDs that have connections
    const connectedIds = new Set<string>();
    for (const conn of allConnections) {
      connectedIds.add(conn.sourceArtistId.toString());
      connectedIds.add(conn.targetArtistId.toString());
    }

    // Filter to connected artists only
    const artists = allArtists.filter((a) => connectedIds.has(a._id.toString()));

    // Build nodes
    const nodes = artists.map((a, i) => ({
      id: a._id,
      name: a.name,
      community: a.communityId ?? 0,
      communityLabel: a.communityLabel,
      size: Math.max(3, (a.bridgeScore ?? 0) * 10 + 3),
      imageUrl: a.images?.thumbnail?.url || a.images?.primary?.url,
      genres: a.genres?.slice(0, 3),
      country: a.country,
      enrichmentStatus: a.enrichmentStatus,
      // Initial positions in a circle
      x: 400 + 300 * Math.cos((2 * Math.PI * i) / artists.length),
      y: 300 + 200 * Math.sin((2 * Math.PI * i) / artists.length),
    }));

    // Build edges
    const edges = allConnections.map((c) => ({
      source: c.sourceArtistId,
      target: c.targetArtistId,
      weight: c.weight,
      types: c.connectionTypes,
    }));

    // Deactivate any existing active snapshot
    const activeSnapshot = await ctx.db
      .query("graphSnapshots")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();

    if (activeSnapshot) {
      await ctx.db.patch(activeSnapshot._id, { isActive: false });
    }

    // Get next version number
    const latestSnapshot = await ctx.db
      .query("graphSnapshots")
      .withIndex("by_version")
      .order("desc")
      .first();
    const version = (latestSnapshot?.version ?? 0) + 1;

    // Create new snapshot
    const snapshotId = await ctx.db.insert("graphSnapshots", {
      version,
      label: label ?? `v${version}-auto`,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      communityCount: 0,
      nodesJson: JSON.stringify(nodes),
      edgesJson: JSON.stringify(edges),
      communitiesJson: JSON.stringify([]),
      isActive: true,
      createdAt: now,
    });

    return {
      snapshotId,
      version,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };
  },
});
