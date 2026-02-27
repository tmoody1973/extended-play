// convex/enrichment.ts
// Enrichment Pipeline — Layers 1-4
// Progressively enriches artist, track, and episode records
// Each layer builds on the previous, writing results back to Convex

import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════════════════════
//  LAYER 1: MusicBrainz Identification (seconds per artist)
//  Matches artist stubs to canonical MusicBrainz IDs
// ═══════════════════════════════════════════════════════════════

export const enrichArtistLayer1 = internalAction({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    // Get the artist stub
    const artist = await ctx.runQuery(internal.enrichment.getArtist, { artistId });
    if (!artist || artist.enrichmentStatus !== "stub") return;

    try {
      // Search MusicBrainz by name
      const mbResponse = await fetch(
        `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artist.name)}&fmt=json&limit=5`,
        {
          headers: {
            "User-Agent": "RhythmLabExtended/1.0 (contact@rhythmlab.com)",
          },
        }
      );

      if (!mbResponse.ok) throw new Error(`MusicBrainz API error: ${mbResponse.status}`);

      const mbData = await mbResponse.json();
      const artists = mbData.artists || [];

      if (artists.length === 0) {
        await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
          artistId,
          updates: { enrichmentStatus: "identified" as const },
          logEntry: {
            step: "musicbrainz_lookup",
            status: "skipped" as const,
            timestamp: Date.now(),
            details: "No MusicBrainz match found",
          },
        });
        return;
      }

      // Take the highest-scoring match
      const best = artists[0];

      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {
          musicbrainzId: best.id,
          sortName: best["sort-name"],
          country: best.country,
          disambiguation: best.disambiguation,
          activeYearBegin: best["life-span"]?.begin
            ? parseInt(best["life-span"].begin.substring(0, 4))
            : undefined,
          activeYearEnd: best["life-span"]?.ended && best["life-span"]?.end
            ? parseInt(best["life-span"].end.substring(0, 4))
            : undefined,
          genres: best.tags
            ? best.tags.slice(0, 10).map((t: any) => t.name)
            : undefined,
          enrichmentStatus: "identified" as const,
        },
        logEntry: {
          step: "musicbrainz_lookup",
          status: "success" as const,
          timestamp: Date.now(),
          details: `Matched: ${best.name} (score: ${best.score})`,
        },
      });

      // Queue Layer 2 enrichment jobs
      await ctx.runMutation(internal.enrichment.queueEnrichmentJobs, {
        targetType: "artist",
        targetId: artistId,
        targetName: artist.name,
        steps: [
          "discogs_fetch",
          "genius_fetch",
          "fanart_tv_fetch",
          "wikimedia_fetch",
          "youtube_match",
        ],
        priority: "normal",
      });
    } catch (error: any) {
      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "musicbrainz_lookup",
          status: "failed" as const,
          timestamp: Date.now(),
          details: error.message,
        },
      });
    }
  },
});

// ═══════════════════════════════════════════════════════════════
//  LAYER 2: Deep Metadata + Images
//  Discogs, Genius, Fanart.tv, Wikimedia, Cover Art Archive
// ═══════════════════════════════════════════════════════════════

// --- Discogs: credits, label info, images ---
export const enrichArtistDiscogs = internalAction({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    const artist = await ctx.runQuery(internal.enrichment.getArtist, { artistId });
    if (!artist) return;

    try {
      // Search Discogs by name
      const searchUrl = `https://api.discogs.com/database/search?q=${encodeURIComponent(artist.name)}&type=artist&per_page=3`;
      const searchResp = await fetch(searchUrl, {
        headers: {
          "User-Agent": "RhythmLabExtended/1.0",
          Authorization: `Discogs key=${process.env.DISCOGS_KEY}, secret=${process.env.DISCOGS_SECRET}`,
        },
      });

      if (!searchResp.ok) throw new Error(`Discogs search error: ${searchResp.status}`);
      const searchData = await searchResp.json();

      if (!searchData.results?.length) {
        await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
          artistId,
          updates: {},
          logEntry: {
            step: "discogs_fetch",
            status: "skipped" as const,
            timestamp: Date.now(),
            details: "No Discogs match found",
          },
        });
        return;
      }

      const discogsArtist = searchData.results[0];
      const discogsId = discogsArtist.id;

      // Fetch full artist details
      const detailResp = await fetch(
        `https://api.discogs.com/artists/${discogsId}`,
        {
          headers: {
            "User-Agent": "RhythmLabExtended/1.0",
            Authorization: `Discogs key=${process.env.DISCOGS_KEY}, secret=${process.env.DISCOGS_SECRET}`,
          },
        }
      );

      const detailData = detailResp.ok ? await detailResp.json() : null;

      // Extract images
      const discogsImages = detailData?.images || [];
      const primaryImage = discogsImages.find((img: any) => img.type === "primary");
      const allImages = discogsImages.map((img: any) => ({
        url: img.uri,
        source: "discogs",
        width: img.width,
        height: img.height,
        type: img.type === "primary" ? "photo" : "photo",
      }));

      // Build image update
      const currentImages = artist.images || {};
      const updatedImages = {
        ...currentImages,
        all: [...(currentImages.all || []), ...allImages],
      };

      // Set primary image if we don't have one yet
      if (!currentImages.primary && primaryImage) {
        updatedImages.primary = {
          url: primaryImage.uri,
          source: "discogs" as const,
          width: primaryImage.width,
          height: primaryImage.height,
        };
        updatedImages.thumbnail = {
          url: primaryImage.uri150 || primaryImage.uri,
          source: "discogs",
        };
      }

      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {
          discogsId,
          discogsResourceUrl: detailData?.resource_url,
          bio: detailData?.profile?.substring(0, 2000),
          members: detailData?.members?.map((m: any) => m.name),
          images: updatedImages,
        },
        logEntry: {
          step: "discogs_fetch",
          status: "success" as const,
          timestamp: Date.now(),
          details: `Found: ${discogsArtist.title}, ${allImages.length} images`,
        },
      });
    } catch (error: any) {
      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "discogs_fetch",
          status: "failed" as const,
          timestamp: Date.now(),
          details: error.message,
        },
      });
    }
  },
});

// --- Cover Art Archive: album artwork via MusicBrainz release IDs ---
export const enrichTrackAlbumArt = internalAction({
  args: { trackId: v.id("tracks") },
  handler: async (ctx, { trackId }) => {
    const track = await ctx.runQuery(internal.enrichment.getTrack, { trackId });
    if (!track) return;

    try {
      let coverUrl: string | undefined;
      let coverThumb: string | undefined;
      let coverSource = "cover_art_archive";

      // Try Cover Art Archive if we have a MusicBrainz release ID
      if (track.albumMusicbrainzId) {
        const caaUrl = `https://coverartarchive.org/release/${track.albumMusicbrainzId}`;
        const caaResp = await fetch(caaUrl);

        if (caaResp.ok) {
          const caaData = await caaResp.json();
          const front = caaData.images?.find((img: any) => img.front);
          if (front) {
            coverUrl = front.image;
            coverThumb = front.thumbnails?.["250"] || front.thumbnails?.small;
          }
        }
      }

      // Fallback: search MusicBrainz for the release
      if (!coverUrl && track.albumTitle && track.artistName) {
        const mbQuery = `release:${encodeURIComponent(track.albumTitle)} AND artist:${encodeURIComponent(track.artistName)}`;
        const mbResp = await fetch(
          `https://musicbrainz.org/ws/2/release/?query=${mbQuery}&fmt=json&limit=3`,
          {
            headers: { "User-Agent": "RhythmLabExtended/1.0 (contact@rhythmlab.com)" },
          }
        );

        if (mbResp.ok) {
          const mbData = await mbResp.json();
          const release = mbData.releases?.[0];
          if (release) {
            // Store the MBID for future use
            await ctx.runMutation(internal.enrichment.updateTrackField, {
              trackId,
              field: "albumMusicbrainzId",
              value: release.id,
            });

            // Try Cover Art Archive with the found MBID
            const caaResp2 = await fetch(
              `https://coverartarchive.org/release/${release.id}`
            );
            if (caaResp2.ok) {
              const caaData2 = await caaResp2.json();
              const front2 = caaData2.images?.find((img: any) => img.front);
              if (front2) {
                coverUrl = front2.image;
                coverThumb = front2.thumbnails?.["250"] || front2.thumbnails?.small;
              }
            }
          }
        }
      }

      if (coverUrl) {
        await ctx.runMutation(internal.enrichment.updateTrackAlbumArt, {
          trackId,
          albumArt: {
            coverArtArchiveUrl: coverUrl,
            coverArtArchiveThumb: coverThumb,
            primaryUrl: coverUrl,
            primarySource: coverSource,
          },
        });
      }
    } catch (error: any) {
      console.error(`Cover art enrichment failed for track ${trackId}:`, error.message);
    }
  },
});

// --- Fanart.tv: high-quality artist images, backgrounds, logos ---
export const enrichArtistFanartTv = internalAction({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    const artist = await ctx.runQuery(internal.enrichment.getArtist, { artistId });
    if (!artist?.musicbrainzId) return;

    try {
      const faResp = await fetch(
        `https://webservice.fanart.tv/v3/music/${artist.musicbrainzId}?api_key=${process.env.FANART_TV_API_KEY}`,
      );

      if (!faResp.ok) {
        await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
          artistId,
          updates: {},
          logEntry: {
            step: "fanart_tv_fetch",
            status: "skipped" as const,
            timestamp: Date.now(),
            details: `Fanart.tv returned ${faResp.status}`,
          },
        });
        return;
      }

      const faData = await faResp.json();

      const currentImages = artist.images || {};
      const newImages = [...(currentImages.all || [])];

      // Artist thumbs (best for graph nodes)
      const thumbs = faData.artistthumb || [];
      for (const thumb of thumbs.slice(0, 3)) {
        newImages.push({
          url: thumb.url,
          source: "fanart_tv",
          type: "photo",
        });
      }

      // HD backgrounds
      const backgrounds = faData.artistbackground || [];
      const fanartBackground = backgrounds[0]?.url;
      for (const bg of backgrounds.slice(0, 2)) {
        newImages.push({
          url: bg.url,
          source: "fanart_tv",
          type: "banner",
        });
      }

      // HD logos
      const logos = faData.hdmusiclogo || faData.musiclogo || [];
      const fanartLogo = logos[0]?.url;
      for (const logo of logos.slice(0, 2)) {
        newImages.push({
          url: logo.url,
          source: "fanart_tv",
          type: "logo",
        });
      }

      const updatedImages = {
        ...currentImages,
        all: newImages,
        fanartBackground,
        fanartLogo,
      };

      // Upgrade primary image if fanart.tv has a better one
      if (!currentImages.primary && thumbs.length > 0) {
        updatedImages.primary = {
          url: thumbs[0].url,
          source: "fanart_tv" as const,
        };
        updatedImages.thumbnail = {
          url: thumbs[0].url,
          source: "fanart_tv",
        };
      }

      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: { images: updatedImages },
        logEntry: {
          step: "fanart_tv_fetch",
          status: "success" as const,
          timestamp: Date.now(),
          details: `${thumbs.length} thumbs, ${backgrounds.length} backgrounds, ${logos.length} logos`,
        },
      });
    } catch (error: any) {
      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "fanart_tv_fetch",
          status: "failed" as const,
          timestamp: Date.now(),
          details: error.message,
        },
      });
    }
  },
});

// --- YouTube: match best music video for artist ---
export const enrichArtistYoutube = internalAction({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    const artist = await ctx.runQuery(internal.enrichment.getArtist, { artistId });
    if (!artist) return;

    try {
      const query = `${artist.name} official music video`;
      const ytResp = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=3&key=${process.env.YOUTUBE_API_KEY}`
      );

      if (!ytResp.ok) throw new Error(`YouTube API error: ${ytResp.status}`);
      const ytData = await ytResp.json();

      const topVideo = ytData.items?.[0];
      if (topVideo) {
        await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
          artistId,
          updates: {
            youtubeMusicChannelId: topVideo.snippet.channelId,
          },
          logEntry: {
            step: "youtube_match",
            status: "success" as const,
            timestamp: Date.now(),
            details: `Top video: ${topVideo.snippet.title}`,
          },
        });
      }
    } catch (error: any) {
      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "youtube_match",
          status: "failed" as const,
          timestamp: Date.now(),
          details: error.message,
        },
      });
    }
  },
});

// ═══════════════════════════════════════════════════════════════
//  LAYER 3: Sonic Features (ReccoBeats / AcousticBrainz)
// ═══════════════════════════════════════════════════════════════

export const enrichTrackSonicFeatures = internalAction({
  args: { trackId: v.id("tracks") },
  handler: async (ctx, { trackId }) => {
    const track = await ctx.runQuery(internal.enrichment.getTrack, { trackId });
    if (!track) return;

    try {
      // Try ReccoBeats first (drop-in Spotify replacement)
      const query = `${track.artistName} ${track.title}`;
      const rbResp = await fetch(
        `https://api.reccobeats.com/v1/track/search?q=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.RECCOBEATS_API_KEY}`,
          },
        }
      );

      if (rbResp.ok) {
        const rbData = await rbResp.json();
        const topTrack = rbData.tracks?.[0];

        if (topTrack?.audio_features) {
          const features = topTrack.audio_features;
          await ctx.runMutation(internal.enrichment.updateTrackSonic, {
            trackId,
            sonicFeatures: {
              acousticness: features.acousticness ?? 0,
              danceability: features.danceability ?? 0,
              energy: features.energy ?? 0,
              instrumentalness: features.instrumentalness ?? 0,
              liveness: features.liveness ?? 0,
              loudness: features.loudness ?? 0,
              speechiness: features.speechiness ?? 0,
              tempo: features.tempo ?? 0,
              valence: features.valence ?? 0,
              key: features.key,
              mode: features.mode,
              durationMs: features.duration_ms,
            },
            source: "reccobeats",
          });
          return;
        }
      }

      // Fallback: AcousticBrainz if we have a MusicBrainz recording ID
      if (track.musicbrainzRecordingId) {
        const abResp = await fetch(
          `https://acousticbrainz.org/api/v1/${track.musicbrainzRecordingId}/low-level`
        );

        if (abResp.ok) {
          const abData = await abResp.json();
          // Map AcousticBrainz low-level features to our schema
          const rhythm = abData.rhythm || {};
          const lowlevel = abData.lowlevel || {};
          const tonal = abData.tonal || {};

          await ctx.runMutation(internal.enrichment.updateTrackSonic, {
            trackId,
            sonicFeatures: {
              acousticness: 0, // Not directly available in AB
              danceability: rhythm.danceability ?? 0,
              energy: lowlevel.average_loudness ?? 0,
              instrumentalness: 0,
              liveness: 0,
              loudness: lowlevel.dynamic_complexity ?? 0,
              speechiness: 0,
              tempo: rhythm.bpm ?? 0,
              valence: 0,
              key: tonal.key_key ? pitchClassFromKey(tonal.key_key) : undefined,
              mode: tonal.key_scale === "major" ? 1 : 0,
            },
            source: "acousticbrainz",
          });
        }
      }
    } catch (error: any) {
      console.error(`Sonic enrichment failed for track ${trackId}:`, error.message);
    }
  },
});

// Compute artist-level sonic profile by averaging track features
export const computeArtistSonicProfile = internalAction({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    const tracks = await ctx.runQuery(internal.enrichment.getArtistTracks, { artistId });

    const tracksWithSonic = tracks.filter((t: any) => t.sonicFeatures);
    if (tracksWithSonic.length === 0) return;

    // Average all features
    const featureKeys = [
      "acousticness", "danceability", "energy", "instrumentalness",
      "liveness", "loudness", "speechiness", "tempo", "valence",
    ] as const;

    const avgProfile: Record<string, number> = {};
    for (const key of featureKeys) {
      const values = tracksWithSonic
        .map((t: any) => t.sonicFeatures[key])
        .filter((v: any) => v !== undefined && v !== null);
      avgProfile[key] = values.length > 0
        ? values.reduce((a: number, b: number) => a + b, 0) / values.length
        : 0;
    }

    await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
      artistId,
      updates: {
        sonicProfile: avgProfile as any,
        sonicProfileTrackCount: tracksWithSonic.length,
        sonicProfileSource: tracksWithSonic[0].sonicFeaturesSource,
      },
      logEntry: {
        step: "sonic_profile_compute",
        status: "success" as const,
        timestamp: Date.now(),
        details: `Averaged ${tracksWithSonic.length} tracks`,
      },
    });
  },
});

// ═══════════════════════════════════════════════════════════════
//  ORCHESTRATOR: Process enrichment job queue
// ═══════════════════════════════════════════════════════════════

// Called by a Convex cron or manually to process pending jobs
export const processEnrichmentQueue = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { batchSize = 10 }): Promise<{ processed: number }> => {
    // Get next batch of queued jobs, highest priority first
    const jobs = await ctx.runQuery(internal.enrichment.getQueuedJobs, {
      limit: batchSize,
    });

    for (const job of jobs) {
      // Mark as running
      await ctx.runMutation(internal.enrichment.updateJobStatus, {
        jobId: job._id,
        status: "running",
      });

      try {
        // Route to appropriate enrichment function
        switch (job.step) {
          case "musicbrainz_lookup":
            await ctx.runAction(internal.enrichment.enrichArtistLayer1, {
              artistId: job.targetId as any,
            });
            break;
          case "discogs_fetch":
            await ctx.runAction(internal.enrichment.enrichArtistDiscogs, {
              artistId: job.targetId as any,
            });
            break;
          case "fanart_tv_fetch":
            await ctx.runAction(internal.enrichment.enrichArtistFanartTv, {
              artistId: job.targetId as any,
            });
            break;
          case "youtube_match":
            await ctx.runAction(internal.enrichment.enrichArtistYoutube, {
              artistId: job.targetId as any,
            });
            break;
          case "cover_art_archive":
            await ctx.runAction(internal.enrichment.enrichTrackAlbumArt, {
              trackId: job.targetId as any,
            });
            break;
          case "reccobeats_fetch":
            await ctx.runAction(internal.enrichment.enrichTrackSonicFeatures, {
              trackId: job.targetId as any,
            });
            break;
          case "sonic_profile_compute":
            await ctx.runAction(internal.enrichment.computeArtistSonicProfile, {
              artistId: job.targetId as any,
            });
            break;
        }

        await ctx.runMutation(internal.enrichment.updateJobStatus, {
          jobId: job._id,
          status: "completed",
        });
      } catch (error: any) {
        const attempts = job.attempts + 1;
        await ctx.runMutation(internal.enrichment.updateJobStatus, {
          jobId: job._id,
          status: attempts >= job.maxAttempts ? "failed" : "queued",
          error: error.message,
          attempts,
        });
      }

      // Rate limiting: wait between API calls
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return { processed: jobs.length };
  },
});

// ═══════════════════════════════════════════════════════════════
//  BATCH STARTERS: Kick off enrichment for all stubs
// ═══════════════════════════════════════════════════════════════

// Enrich all artist stubs (Layer 1 — MusicBrainz identification)
export const enrichAllStubArtists = action({
  args: {},
  handler: async (ctx): Promise<{ queued: number }> => {
    const stubs = await ctx.runQuery(internal.enrichment.getArtistsByStatus, {
      status: "stub",
      limit: 500,
    });

    for (const stub of stubs) {
      await ctx.runMutation(internal.enrichment.queueEnrichmentJobs, {
        targetType: "artist",
        targetId: stub._id,
        targetName: stub.name,
        steps: ["musicbrainz_lookup"],
        priority: "normal",
      });
    }

    return { queued: stubs.length };
  },
});

// Enrich all tracks missing album art
export const enrichAllTrackArt = action({
  args: {},
  handler: async (ctx): Promise<{ queued: number }> => {
    const tracks = await ctx.runQuery(internal.enrichment.getTracksByStatus, {
      status: "raw",
      limit: 100,
    });

    for (const track of tracks) {
      await ctx.runMutation(internal.enrichment.queueEnrichmentJobs, {
        targetType: "track",
        targetId: track._id,
        targetName: `${track.artistName} - ${track.title}`,
        steps: ["cover_art_archive", "reccobeats_fetch"],
        priority: "normal",
      });
    }

    return { queued: tracks.length };
  },
});

// ═══════════════════════════════════════════════════════════════
//  INTERNAL QUERIES & MUTATIONS (used by actions above)
// ═══════════════════════════════════════════════════════════════

export const getArtist = internalQuery({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => ctx.db.get(artistId),
});

export const getTrack = internalQuery({
  args: { trackId: v.id("tracks") },
  handler: async (ctx, { trackId }) => ctx.db.get(trackId),
});

export const getArtistTracks = internalQuery({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    return await ctx.db
      .query("tracks")
      .withIndex("by_artistId", (q) => q.eq("artistId", artistId))
      .collect();
  },
});

export const getArtistsByStatus = internalQuery({
  args: {
    status: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit = 50 }) => {
    return await ctx.db
      .query("artists")
      .withIndex("by_enrichmentStatus", (q) => q.eq("enrichmentStatus", status as any))
      .take(limit);
  },
});

export const getTracksByStatus = internalQuery({
  args: {
    status: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit = 50 }) => {
    return await ctx.db
      .query("tracks")
      .withIndex("by_enrichmentStatus", (q) => q.eq("enrichmentStatus", status as any))
      .take(limit);
  },
});

export const getQueuedJobs = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_status_priority", (q) => q.eq("status", "queued"))
      .take(limit);
  },
});

export const updateArtistEnrichment = internalMutation({
  args: {
    artistId: v.id("artists"),
    updates: v.any(),
    logEntry: v.object({
      step: v.string(),
      status: v.union(v.literal("success"), v.literal("failed"), v.literal("skipped")),
      timestamp: v.number(),
      details: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { artistId, updates, logEntry }) => {
    const artist = await ctx.db.get(artistId);
    if (!artist) return;

    const currentLog = artist.enrichmentLog || [];
    await ctx.db.patch(artistId, {
      ...updates,
      enrichmentLog: [...currentLog, logEntry],
      lastEnrichedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateTrackAlbumArt = internalMutation({
  args: {
    trackId: v.id("tracks"),
    albumArt: v.object({
      coverArtArchiveUrl: v.optional(v.string()),
      coverArtArchiveThumb: v.optional(v.string()),
      discogsImageUrl: v.optional(v.string()),
      primaryUrl: v.optional(v.string()),
      primarySource: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { trackId, albumArt }) => {
    await ctx.db.patch(trackId, {
      albumArt,
      enrichmentStatus: "artwork",
      updatedAt: Date.now(),
    });
  },
});

export const updateTrackSonic = internalMutation({
  args: {
    trackId: v.id("tracks"),
    sonicFeatures: v.object({
      acousticness: v.number(),
      danceability: v.number(),
      energy: v.number(),
      instrumentalness: v.number(),
      liveness: v.number(),
      loudness: v.number(),
      speechiness: v.number(),
      tempo: v.number(),
      valence: v.number(),
      key: v.optional(v.number()),
      mode: v.optional(v.number()),
      durationMs: v.optional(v.number()),
    }),
    source: v.string(),
  },
  handler: async (ctx, { trackId, sonicFeatures, source }) => {
    await ctx.db.patch(trackId, {
      sonicFeatures,
      sonicFeaturesSource: source,
      enrichmentStatus: "sonic",
      updatedAt: Date.now(),
    });
  },
});

export const updateTrackField = internalMutation({
  args: {
    trackId: v.id("tracks"),
    field: v.string(),
    value: v.any(),
  },
  handler: async (ctx, { trackId, field, value }) => {
    await ctx.db.patch(trackId, { [field]: value, updatedAt: Date.now() });
  },
});

export const updateJobStatus = internalMutation({
  args: {
    jobId: v.id("enrichmentJobs"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    attempts: v.optional(v.number()),
  },
  handler: async (ctx, { jobId, status, error, attempts }) => {
    const updates: any = { status };
    if (status === "running") updates.startedAt = Date.now();
    if (status === "completed" || status === "failed") updates.completedAt = Date.now();
    if (error) updates.lastError = error;
    if (attempts !== undefined) updates.attempts = attempts;
    await ctx.db.patch(jobId, updates);
  },
});

export const queueEnrichmentJobs = internalMutation({
  args: {
    targetType: v.union(
      v.literal("artist"),
      v.literal("track"),
      v.literal("episode"),
      v.literal("review")
    ),
    targetId: v.any(),
    targetName: v.string(),
    steps: v.array(v.string()),
    priority: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("normal"),
      v.literal("low")
    ),
  },
  handler: async (ctx, { targetType, targetId, targetName, steps, priority }) => {
    const now = Date.now();
    for (const step of steps) {
      await ctx.db.insert("enrichmentJobs", {
        targetType,
        targetId: targetId.toString(),
        targetName,
        step: step as any,
        priority,
        status: "queued",
        attempts: 0,
        maxAttempts: 3,
        scheduledAt: now,
        createdAt: now,
      });
    }
  },
});

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function pitchClassFromKey(keyName: string): number {
  const map: Record<string, number> = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
    E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8,
    Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
  };
  return map[keyName] ?? 0;
}
