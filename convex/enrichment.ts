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

      // Queue Layer 1b + Layer 2 enrichment jobs (free APIs only)
      // Paid steps (review_corpus_seed, gemini_corpus_seed) are triggered
      // selectively via batchCorpusSeed for high-signal artists
      await ctx.runMutation(internal.enrichment.queueEnrichmentJobs, {
        targetType: "artist",
        targetId: artistId,
        targetName: artist.name,
        steps: [
          "musicbrainz_rels",
          "discogs_fetch",
          "genius_fetch",
          "fanart_tv_fetch",
          "wikimedia_fetch",
          "youtube_match",
          "wikipedia_fetch",
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
//  LAYER 1b: MusicBrainz Relationship Extraction
//  Runs AFTER Layer 1 (needs MBID) — extracts collaborations,
//  band membership, producer credits
// ═══════════════════════════════════════════════════════════════

export const enrichArtistMusicBrainzRels = internalAction({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    const artist = await ctx.runQuery(internal.enrichment.getArtist, { artistId });
    if (!artist?.musicbrainzId) return;

    try {
      const mbResponse = await fetch(
        `https://musicbrainz.org/ws/2/artist/${artist.musicbrainzId}?inc=artist-rels&fmt=json`,
        {
          headers: {
            "User-Agent": "RhythmLabExtended/1.0 (contact@rhythmlab.com)",
          },
        }
      );

      if (!mbResponse.ok) throw new Error(`MusicBrainz rels API error: ${mbResponse.status}`);

      const mbData = await mbResponse.json();
      const relations = mbData.relations || [];

      // Map MusicBrainz relation types to our connection types
      const MB_TYPE_MAP: Record<string, string> = {
        "member of band": "shared_member",
        "is person": "collaboration", // producer credits
        collaboration: "collaboration",
        "conductor position": "collaboration",
        "vocal supporting musician": "collaboration",
        "instrumental supporting musician": "collaboration",
        "mix": "collaboration",
        "remixer": "collaboration",
        "producer": "collaboration",
      };

      let connectionsCreated = 0;

      for (const rel of relations) {
        if (rel["target-type"] !== "artist") continue;

        const mappedType = MB_TYPE_MAP[rel.type];
        if (!mappedType) continue;

        const targetName = rel.artist?.name;
        if (!targetName) continue;

        // Find target artist in our DB
        const targetArtist = await ctx.runQuery(
          internal.enrichment.findArtistByNameFuzzy,
          { name: targetName }
        );

        if (!targetArtist) continue;

        await ctx.runMutation(internal.enrichment.createOrStrengthenConnection, {
          artistAId: artistId,
          artistBId: targetArtist._id,
          connectionType: mappedType,
          evidence: {
            type: "credits",
            source: "MusicBrainz",
            excerpt: `${rel.type}: ${artist.name} — ${targetName}`,
            url: `https://musicbrainz.org/artist/${artist.musicbrainzId}`,
          },
        });
        connectionsCreated++;
      }

      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "musicbrainz_rels",
          status: "success" as const,
          timestamp: Date.now(),
          details: `${connectionsCreated} connections from ${relations.length} relations`,
        },
      });
    } catch (error: any) {
      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "musicbrainz_rels",
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

      // --- Extract relationship data from Discogs ---
      const memberNames: string[] = detailData?.members?.map((m: any) => m.name) || [];
      const groupNames: string[] = detailData?.groups?.map((g: any) => g.name) || [];
      const aliasNames: string[] = detailData?.aliases?.map((a: any) => a.name) || [];

      // Extract Wikipedia URL from Discogs URLs
      const discogsUrls: string[] = detailData?.urls || [];
      const wikipediaUrl = discogsUrls.find((u: string) =>
        u.includes("wikipedia.org") || u.includes("en.wikipedia.org")
      );

      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {
          discogsId,
          discogsResourceUrl: detailData?.resource_url,
          bio: detailData?.profile?.substring(0, 2000),
          members: memberNames.length > 0 ? memberNames : undefined,
          aliases: aliasNames.length > 0 ? aliasNames : undefined,
          groups: groupNames.length > 0 ? groupNames : undefined,
          wikipediaUrl,
          images: updatedImages,
        },
        logEntry: {
          step: "discogs_fetch",
          status: "success" as const,
          timestamp: Date.now(),
          details: `Found: ${discogsArtist.title}, ${allImages.length} images, ${memberNames.length} members, ${groupNames.length} groups`,
        },
      });

      // Create shared_member edges for members
      for (const memberName of memberNames) {
        const memberArtist = await ctx.runQuery(
          internal.enrichment.findArtistByNameFuzzy,
          { name: memberName }
        );
        if (memberArtist && memberArtist._id !== artistId) {
          await ctx.runMutation(internal.enrichment.createOrStrengthenConnection, {
            artistAId: artistId,
            artistBId: memberArtist._id,
            connectionType: "shared_member",
            evidence: {
              type: "credits",
              source: "Discogs",
              excerpt: `${memberName} is a member of ${artist.name}`,
              url: `https://www.discogs.com/artist/${discogsId}`,
            },
          });
        }
      }

      // Create shared_member edges for groups
      for (const groupName of groupNames) {
        const groupArtist = await ctx.runQuery(
          internal.enrichment.findArtistByNameFuzzy,
          { name: groupName }
        );
        if (groupArtist && groupArtist._id !== artistId) {
          await ctx.runMutation(internal.enrichment.createOrStrengthenConnection, {
            artistAId: artistId,
            artistBId: groupArtist._id,
            connectionType: "shared_member",
            evidence: {
              type: "credits",
              source: "Discogs",
              excerpt: `${artist.name} is a member of ${groupName}`,
              url: `https://www.discogs.com/artist/${discogsId}`,
            },
          });
        }
      }

      // Queue Wikipedia fetch if URL found
      if (wikipediaUrl) {
        await ctx.runMutation(internal.enrichment.queueEnrichmentJobs, {
          targetType: "artist",
          targetId: artistId,
          targetName: artist.name,
          steps: ["wikipedia_fetch"],
          priority: "normal",
        });
      }
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
//  SPOTIFY TOKEN — Client credentials flow (no user auth needed)
// ═══════════════════════════════════════════════════════════════

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt) {
    return spotifyTokenCache.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing Spotify credentials");

  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!resp.ok) throw new Error(`Spotify auth error: ${resp.status}`);
  const data = await resp.json();

  spotifyTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return data.access_token;
}

// ═══════════════════════════════════════════════════════════════
//  SPOTIFY TRACK MATCH — Search by name → store Spotify ID
// ═══════════════════════════════════════════════════════════════

export const matchTrackSpotify = internalAction({
  args: { trackId: v.id("tracks") },
  handler: async (ctx, { trackId }) => {
    const track = await ctx.runQuery(internal.enrichment.getTrack, { trackId });
    if (!track || track.spotifyTrackId) return; // Already matched

    try {
      const token = await getSpotifyToken();
      const query = `track:${track.title} artist:${track.artistName}`;
      const resp = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!resp.ok) return;
      const data = await resp.json();
      const spotifyTrack = data.tracks?.items?.[0];
      if (!spotifyTrack) return;

      await ctx.runMutation(internal.enrichment.updateTrackField, {
        trackId,
        field: "spotifyTrackId",
        value: spotifyTrack.id,
      });

      // Save preview URL if available (30s audio snippet)
      if (spotifyTrack.preview_url) {
        await ctx.runMutation(internal.enrichment.updateTrackField, {
          trackId,
          field: "spotifyPreviewUrl",
          value: spotifyTrack.preview_url,
        });
      }
    } catch {
      // Silently skip — will retry via cron
    }
  },
});

// ═══════════════════════════════════════════════════════════════
//  LAYER 3: Sonic Features (Spotify ID → SoundStat / AcousticBrainz)
// ═══════════════════════════════════════════════════════════════

export const enrichTrackSonicFeatures = internalAction({
  args: { trackId: v.id("tracks") },
  handler: async (ctx, { trackId }) => {
    const track = await ctx.runQuery(internal.enrichment.getTrack, { trackId });
    if (!track) return;

    try {
      // Use Spotify ID with SoundStat if available
      if (track.spotifyTrackId) {
        const apiKey = process.env.SOUNDSTAT_API_KEY;
        const ssResp = await fetch(
          `https://soundstat.info/api/v1/track/${track.spotifyTrackId}`,
          {
            headers: apiKey ? { "x-api-key": apiKey } : {},
          }
        );

        if (ssResp.ok) {
          const data = await ssResp.json();
          const features = data.features;
          if (features && features.danceability !== undefined) {
            await ctx.runMutation(internal.enrichment.updateTrackSonic, {
              trackId,
              sonicFeatures: {
                acousticness: features.acousticness ?? 0,
                danceability: features.danceability ?? 0,
                energy: features.energy ?? 0,
                instrumentalness: features.instrumentalness ?? 0,
                liveness: 0,
                loudness: features.loudness ?? 0,
                speechiness: 0,
                tempo: features.tempo ?? 0,
                valence: features.valence ?? 0,
                key: features.key,
                mode: features.mode,
                durationMs: data.duration_ms,
              },
              source: "soundstat",
            });
            return;
          }
        }
      }

      // Fallback: AcousticBrainz if we have a MusicBrainz recording ID
      if (track.musicbrainzRecordingId) {
        const abResp = await fetch(
          `https://acousticbrainz.org/api/v1/${track.musicbrainzRecordingId}/low-level`
        );

        if (abResp.ok) {
          const abData = await abResp.json();
          const rhythm = abData.rhythm || {};
          const lowlevel = abData.lowlevel || {};
          const tonal = abData.tonal || {};

          await ctx.runMutation(internal.enrichment.updateTrackSonic, {
            trackId,
            sonicFeatures: {
              acousticness: 0,
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

// Route a single job to its enrichment handler
async function executeJob(ctx: any, job: any): Promise<void> {
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
    case "spotify_match":
      await ctx.runAction(internal.enrichment.matchTrackSpotify, {
        trackId: job.targetId as any,
      });
      break;
    case "soundstat_fetch":
      await ctx.runAction(internal.enrichment.enrichTrackSonicFeatures, {
        trackId: job.targetId as any,
      });
      break;
    case "sonic_profile_compute":
      await ctx.runAction(internal.enrichment.computeArtistSonicProfile, {
        artistId: job.targetId as any,
      });
      break;
    case "gemini_grounding":
      await ctx.runAction(internal.geminiGrounding.enrichArtistWithGrounding, {
        artistId: job.targetId as any,
      });
      break;
    case "musicbrainz_rels":
      await ctx.runAction(internal.enrichment.enrichArtistMusicBrainzRels, {
        artistId: job.targetId as any,
      });
      break;
    case "wikipedia_fetch":
      await ctx.runAction(internal.enrichment.enrichArtistWikipedia, {
        artistId: job.targetId as any,
      });
      break;
    case "ner_extraction":
      await ctx.runAction(internal.enrichment.processNerExtraction, {
        reviewId: job.targetId as any,
      });
      break;
    case "gemini_corpus_seed":
      await ctx.runAction(internal.geminiGrounding.seedCorpusWithGrounding, {
        artistId: job.targetId as any,
      });
      break;
    case "review_corpus_seed":
      await ctx.runAction(internal.reviewSearch.seedCorpusForArtist, {
        artistId: job.targetId as any,
      });
      break;
  }
}

// Process a single job with status tracking
async function processJob(ctx: any, job: any): Promise<boolean> {
  await ctx.runMutation(internal.enrichment.updateJobStatus, {
    jobId: job._id,
    status: "running",
  });
  try {
    await executeJob(ctx, job);
    await ctx.runMutation(internal.enrichment.updateJobStatus, {
      jobId: job._id,
      status: "completed",
    });
    return true;
  } catch (error: any) {
    const attempts = job.attempts + 1;
    await ctx.runMutation(internal.enrichment.updateJobStatus, {
      jobId: job._id,
      status: attempts >= job.maxAttempts ? "failed" : "queued",
      error: error.message,
      attempts,
    });
    return false;
  }
}

// Fast pipeline: free APIs (images, metadata, IDs) — runs every 5s
// Processes jobs in parallel batches of 5 (different API types are safe to parallelize)
export const processEnrichmentQueue = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { batchSize = 25 }): Promise<{ processed: number }> => {
    // Focus on free API steps that give us images + metadata
    const FAST_STEPS = [
      "musicbrainz_lookup", "musicbrainz_rels",
      "discogs_fetch", "fanart_tv_fetch",
      "wikipedia_fetch", "youtube_match",
      "cover_art_archive", "spotify_match",
      "soundstat_fetch", "sonic_profile_compute",
      "ner_extraction",
    ];

    const jobs = await ctx.runQuery(internal.enrichment.getQueuedJobsBySteps, {
      steps: FAST_STEPS,
      limit: batchSize,
    });

    if (jobs.length === 0) return { processed: 0 };

    let processed = 0;
    const CONCURRENCY = 5;

    // Process in parallel batches
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const batch = jobs.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((job: any) => processJob(ctx, job)));
      processed += results.filter(Boolean).length;
    }

    return { processed };
  },
});

// Slow pipeline: paid APIs (Gemini, Exa/Tavily corpus seeding) — runs every 30s
export const processCorpusQueue = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { batchSize = 3 }): Promise<{ processed: number }> => {
    const PAID_STEPS = [
      "gemini_corpus_seed", "review_corpus_seed", "gemini_grounding",
    ];

    const jobs = await ctx.runQuery(internal.enrichment.getQueuedJobsBySteps, {
      steps: PAID_STEPS,
      limit: batchSize,
    });

    if (jobs.length === 0) return { processed: 0 };

    // Process sequentially — paid APIs need careful rate limiting
    let processed = 0;
    for (const job of jobs) {
      const ok = await processJob(ctx, job);
      if (ok) processed++;
    }

    return { processed };
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
        steps: ["cover_art_archive", "spotify_match", "soundstat_fetch"],
        priority: "normal",
      });
    }

    return { queued: tracks.length };
  },
});

// ═══════════════════════════════════════════════════════════════
//  BATCH CORPUS SEEDING — Selective, for high-signal artists
//  Targets artists with 3+ playlist appearances (highest graph value)
// ═══════════════════════════════════════════════════════════════

export const batchCorpusSeed = action({
  args: {
    limit: v.optional(v.number()),
    minTracks: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ queued: number; skipped: number }> => {
    const limit = args.limit || 800;
    const minTracks = args.minTracks || 3;

    // Get top artists by track count
    const topArtists = await ctx.runQuery(
      internal.enrichment.getTopArtistsByTrackCount,
      { limit, minTracks }
    );

    let queued = 0;
    let skipped = 0;

    for (const artist of topArtists) {
      // Skip if already corpus-seeded (check enrichment log)
      const hasCorpusSeed = artist.enrichmentLog?.some(
        (e: any) => e.step === "review_corpus_seed" && e.status === "success"
      );
      if (hasCorpusSeed) {
        skipped++;
        continue;
      }

      await ctx.runMutation(internal.enrichment.queueEnrichmentJobs, {
        targetType: "artist",
        targetId: artist._id,
        targetName: artist.name,
        steps: ["review_corpus_seed", "gemini_corpus_seed"],
        priority: "low",
      });
      queued++;
    }

    return { queued, skipped };
  },
});

// ═══════════════════════════════════════════════════════════════
//  INTERNAL QUERIES & MUTATIONS (used by actions above)
// ═══════════════════════════════════════════════════════════════

export const getTopArtistsByTrackCount = internalQuery({
  args: { limit: v.number(), minTracks: v.number() },
  handler: async (ctx, { limit, minTracks }) => {
    // Get all identified+ artists
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

    // Count tracks per artist
    const withCounts = await Promise.all(
      allArtists.map(async (artist) => {
        const tracks = await ctx.db
          .query("tracks")
          .withIndex("by_artistId", (q) => q.eq("artistId", artist._id))
          .collect();
        return { ...artist, trackCount: tracks.length };
      })
    );

    // Filter by min tracks and sort by count descending
    return withCounts
      .filter((a) => a.trackCount >= minTracks)
      .sort((a, b) => b.trackCount - a.trackCount)
      .slice(0, limit);
  },
});

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

// Get queued jobs filtered by step type (for separate fast/slow pipelines)
// Uses by_step index to efficiently find jobs for specific enrichment steps
export const getQueuedJobsBySteps = internalQuery({
  args: {
    steps: v.array(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, { steps, limit }) => {
    const results = [];
    const perStep = Math.max(3, Math.ceil(limit / steps.length));

    // Query each step using the by_step index (efficient — skips corpus seed jobs entirely)
    for (const step of steps) {
      if (results.length >= limit) break;
      const jobs = await ctx.db
        .query("enrichmentJobs")
        .withIndex("by_step", (q) => q.eq("step", step as any).eq("status", "queued"))
        .take(perStep);
      results.push(...jobs);
    }

    // Return up to limit, sorted by creation time (oldest first)
    return results.slice(0, limit).sort((a, b) => a.createdAt - b.createdAt);
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
    const merged = { ...artist, ...updates };

    // Auto-promote enrichmentStatus based on accumulated data
    let status = updates.enrichmentStatus ?? artist.enrichmentStatus;
    if (status === "identified" || status === "stub") {
      // Has images? → "images"
      const hasImages = merged.images?.primary?.url || merged.images?.thumbnail?.url;
      const hasMeta = merged.discogsId || merged.bio;
      if (hasImages) {
        status = "images";
      } else if (hasMeta) {
        status = "metadata";
      }
    }

    await ctx.db.patch(artistId, {
      ...updates,
      enrichmentStatus: status,
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
//  NER CO-MENTION EXTRACTION — The Stell-R Core Loop
//  Extracts artist mentions from review text, creates co-mention edges
// ═══════════════════════════════════════════════════════════════

export const processNerExtraction = internalAction({
  args: { reviewId: v.id("reviews") },
  handler: async (ctx, { reviewId }) => {
    const review = await ctx.runQuery(internal.enrichment.getReview, { reviewId });
    if (!review || review.nerProcessed) return;

    const text = review.fullText || review.excerpt;
    if (!text || text.length < 20) {
      await ctx.runMutation(internal.enrichment.updateReviewNer, {
        reviewId,
        mentionedArtistIds: [],
        mentionedArtistNames: [],
      });
      return;
    }

    // Get primary artist name to exclude self-mentions
    const primaryName = review.primaryArtistName || "";

    // Run NER extraction
    const mentions = extractArtistMentions(text, primaryName);

    const matchedIds: any[] = [];
    const matchedNames: string[] = [];

    for (const mention of mentions) {
      const artist = await ctx.runQuery(
        internal.enrichment.findArtistByNameFuzzy,
        { name: mention.name }
      );

      if (!artist) continue;

      matchedIds.push(artist._id);
      matchedNames.push(mention.name);

      // Create co-mention edge if we have a primary artist
      if (review.primaryArtistId) {
        const weight = mention.isInfluenceContext ? 0.5 : 0.3;
        await ctx.runMutation(internal.enrichment.createOrStrengthenConnection, {
          artistAId: review.primaryArtistId,
          artistBId: artist._id,
          connectionType: "review_comention",
          weight,
          evidence: {
            type: "review",
            source: review.publication || "unknown",
            excerpt: mention.context?.substring(0, 200),
            url: review.url,
            date: review.publishDate,
          },
          reviewId,
        });
      }
    }

    await ctx.runMutation(internal.enrichment.updateReviewNer, {
      reviewId,
      mentionedArtistIds: matchedIds,
      mentionedArtistNames: matchedNames,
    });
  },
});

// ═══════════════════════════════════════════════════════════════
//  WIKIPEDIA BIO + INFLUENCE EXTRACTION
//  Free API — extracts bio, associated acts, influence sections
// ═══════════════════════════════════════════════════════════════

export const enrichArtistWikipedia = internalAction({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    const artist = await ctx.runQuery(internal.enrichment.getArtist, { artistId });
    if (!artist) return;

    try {
      // Determine Wikipedia title from URL or artist name
      let wikiTitle: string;
      if (artist.wikipediaUrl) {
        const urlParts = artist.wikipediaUrl.split("/wiki/");
        wikiTitle = urlParts[urlParts.length - 1] || encodeURIComponent(artist.name);
      } else {
        // Search Wikipedia for the artist
        const searchResp = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(artist.name + " musician")}&format=json&srlimit=3`
        );
        if (!searchResp.ok) throw new Error(`Wikipedia search error: ${searchResp.status}`);
        const searchData = await searchResp.json();
        const firstResult = searchData.query?.search?.[0];
        if (!firstResult) {
          await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
            artistId,
            updates: {},
            logEntry: {
              step: "wikipedia_fetch",
              status: "skipped" as const,
              timestamp: Date.now(),
              details: "No Wikipedia article found",
            },
          });
          return;
        }
        wikiTitle = firstResult.title.replace(/ /g, "_");
      }

      // Fetch summary for bio
      const summaryResp = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`
      );

      let bio: string | undefined;
      if (summaryResp.ok) {
        const summaryData = await summaryResp.json();
        bio = summaryData.extract;
      }

      // Fetch full page HTML for associated acts / influences parsing
      const pageResp = await fetch(
        `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(wikiTitle)}&prop=wikitext&format=json`
      );

      let associatedActs: string[] = [];
      let influencedBy: string[] = [];
      let wikitext = "";

      if (pageResp.ok) {
        const pageData = await pageResp.json();
        wikitext = pageData.parse?.wikitext?.["*"] || "";

        // Extract "Associated acts" from infobox
        const associatedMatch = wikitext.match(
          /\|\s*associated_acts\s*=\s*([\s\S]+?)(?:\n\||\n\}\})/
        );
        if (associatedMatch) {
          const rawList = associatedMatch[1];
          // Extract wiki links: [[Artist Name]] or [[Artist Name|Display Name]]
          const linkMatches = rawList.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g);
          for (const match of linkMatches) {
            associatedActs.push(match[2] || match[1]);
          }
        }

        // Extract "Influences" section
        const influenceMatch = wikitext.match(
          /={2,3}\s*(?:Influences|Musical influences)\s*={2,3}\s*([\s\S]*?)(?=\n={2,3}|\n\[\[Category)/i
        );
        if (influenceMatch) {
          const influenceText = influenceMatch[1];
          const linkMatches = influenceText.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g);
          for (const match of linkMatches) {
            influencedBy.push(match[2] || match[1]);
          }
        }
      }

      // Update artist bio if richer than existing
      const updates: Record<string, any> = {};
      if (bio && (!artist.bio || bio.length > artist.bio.length)) {
        updates.bio = bio.substring(0, 2000);
      }
      if (!artist.wikipediaUrl) {
        updates.wikipediaUrl = `https://en.wikipedia.org/wiki/${wikiTitle}`;
      }

      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates,
        logEntry: {
          step: "wikipedia_fetch",
          status: "success" as const,
          timestamp: Date.now(),
          details: `Bio: ${bio ? bio.length : 0} chars, ${associatedActs.length} associated acts, ${influencedBy.length} influences`,
        },
      });

      // Save Wikipedia content as a review for NER processing
      const wikiContent = [bio, wikitext.substring(0, 3000)].filter(Boolean).join("\n\n");
      if (wikiContent.length > 100) {
        await ctx.runMutation(internal.enrichment.saveWikipediaReview, {
          artistId,
          artistName: artist.name,
          wikiTitle,
          content: wikiContent.substring(0, 5000),
        });
      }

      // Create collaboration edges for explicit associated acts
      for (const actName of [...associatedActs, ...influencedBy]) {
        const targetArtist = await ctx.runQuery(
          internal.enrichment.findArtistByNameFuzzy,
          { name: actName }
        );
        if (targetArtist && targetArtist._id !== artistId) {
          const type = influencedBy.includes(actName) ? "collaboration" : "collaboration";
          await ctx.runMutation(internal.enrichment.createOrStrengthenConnection, {
            artistAId: artistId,
            artistBId: targetArtist._id,
            connectionType: type,
            evidence: {
              type: "credits",
              source: "Wikipedia",
              excerpt: influencedBy.includes(actName)
                ? `${actName} listed as influence on ${artist.name}`
                : `${actName} listed as associated act of ${artist.name}`,
              url: `https://en.wikipedia.org/wiki/${wikiTitle}`,
            },
          });
        }
      }
    } catch (error: any) {
      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "wikipedia_fetch",
          status: "failed" as const,
          timestamp: Date.now(),
          details: error.message,
        },
      });
    }
  },
});

// Save Wikipedia content to reviews table for NER
export const saveWikipediaReview = internalMutation({
  args: {
    artistId: v.id("artists"),
    artistName: v.string(),
    wikiTitle: v.string(),
    content: v.string(),
  },
  handler: async (ctx, { artistId, artistName, wikiTitle, content }) => {
    const reviewId = await ctx.db.insert("reviews", {
      publication: "other",
      sourceType: "wikipedia",
      title: `Wikipedia: ${artistName}`,
      url: `https://en.wikipedia.org/wiki/${wikiTitle}`,
      excerpt: content.substring(0, 500),
      fullText: content,
      primaryArtistId: artistId,
      primaryArtistName: artistName,
      nerProcessed: false,
      createdAt: Date.now(),
    });

    // Queue NER for this review
    await ctx.db.insert("enrichmentJobs", {
      targetType: "review",
      targetId: reviewId.toString(),
      targetName: `Wikipedia: ${artistName}`,
      step: "ner_extraction",
      priority: "normal",
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      scheduledAt: Date.now(),
      createdAt: Date.now(),
    });
  },
});

// Save a grounded source (from Gemini) to reviews table + queue NER
export const saveGroundedSource = internalMutation({
  args: {
    artistId: v.id("artists"),
    artistName: v.string(),
    title: v.string(),
    url: v.string(),
    excerpt: v.string(),
  },
  handler: async (ctx, { artistId, artistName, title, url, excerpt }) => {
    const publication = detectPublicationFromUrl(url);

    const reviewId = await ctx.db.insert("reviews", {
      publication,
      sourceType: "grounded_search",
      title,
      url,
      excerpt: excerpt.substring(0, 500),
      fullText: excerpt,
      primaryArtistId: artistId,
      primaryArtistName: artistName,
      nerProcessed: false,
      createdAt: Date.now(),
    });

    await ctx.db.insert("enrichmentJobs", {
      targetType: "review",
      targetId: reviewId.toString(),
      targetName: `Grounded: ${artistName} - ${title}`,
      step: "ner_extraction",
      priority: "normal",
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      scheduledAt: Date.now(),
      createdAt: Date.now(),
    });
  },
});

function detectPublicationFromUrl(url: string): any {
  const domainMap: Record<string, string> = {
    "pitchfork.com": "pitchfork",
    "npr.org": "npr",
    "thequietus.com": "the_quietus",
    "residentadvisor.net": "resident_advisor",
    "bandcamp.com": "bandcamp_daily",
    "thewirecuk.com": "the_wire",
    "thefader.com": "the_fader",
    "stereogum.com": "stereogum",
    "okayplayer.com": "okayplayer",
    "thevinylfactory.com": "the_vinyl_factory",
    "factmag.com": "fact_mag",
    "xlr8r.com": "xlr8r",
    "djmag.com": "dj_mag",
    "aquariumdrunkard.com": "aquarium_drunkard",
    "tinymixtapes.com": "tiny_mix_tapes",
    "theguardian.com": "the_guardian",
    "nytimes.com": "nyt",
    "genius.com": "genius",
    "waxpoetics.com": "wax_poetics",
    "crackmagazine.net": "crack_magazine",
    "clashmusic.com": "clash_music",
    "loudandquiet.com": "loud_and_quiet",
    "passionweiss.com": "passion_of_the_weiss",
  };

  for (const [domain, pub] of Object.entries(domainMap)) {
    if (url.includes(domain)) return pub;
  }
  return "other";
}

// ═══════════════════════════════════════════════════════════════
//  SHARED UTILITIES: Connection creation + Fuzzy artist matching
//  Used by MB rels, Discogs rels, Wikipedia, NER, Gemini grounding
// ═══════════════════════════════════════════════════════════════

// Base weights per connection type
const CONNECTION_BASE_WEIGHTS: Record<string, number> = {
  collaboration: 0.7,
  shared_member: 0.5,
  review_comention: 0.3,
  same_label: 0.2,
  sample: 0.6,
  show_notes: 0.2,
  manual: 0.5,
  playlist_adjacent: 1.0,
};

const EVIDENCE_CAP = 20;

export const createOrStrengthenConnection = internalMutation({
  args: {
    artistAId: v.id("artists"),
    artistBId: v.id("artists"),
    connectionType: v.string(),
    weight: v.optional(v.number()),
    evidence: v.optional(
      v.object({
        type: v.string(),
        source: v.string(),
        excerpt: v.optional(v.string()),
        url: v.optional(v.string()),
        date: v.optional(v.string()),
      })
    ),
    reviewId: v.optional(v.id("reviews")),
  },
  handler: async (ctx, args) => {
    const { artistAId, artistBId, connectionType, evidence, reviewId } = args;

    // Self-edge prevention
    if (artistAId === artistBId) return null;

    // Direction normalization: smaller ID = source
    const [sourceId, targetId] =
      artistAId.toString() < artistBId.toString()
        ? [artistAId, artistBId]
        : [artistBId, artistAId];

    const baseWeight = args.weight ?? CONNECTION_BASE_WEIGHTS[connectionType] ?? 0.3;
    const now = Date.now();

    // Check for existing edge
    const existing = await ctx.db
      .query("artistConnections")
      .withIndex("by_pair", (q) =>
        q.eq("sourceArtistId", sourceId).eq("targetArtistId", targetId)
      )
      .first();

    if (existing) {
      // Upsert: add type if new, append evidence, increment weight
      const updatedTypes = existing.connectionTypes.includes(connectionType as any)
        ? existing.connectionTypes
        : [...existing.connectionTypes, connectionType as any];

      const currentEvidence = existing.evidence || [];
      const updatedEvidence = evidence && currentEvidence.length < EVIDENCE_CAP
        ? [...currentEvidence, evidence]
        : currentEvidence;

      const updates: Record<string, any> = {
        connectionTypes: updatedTypes,
        evidence: updatedEvidence,
        weight: existing.weight + baseWeight,
        updatedAt: now,
      };

      // Track co-mention specifics
      if (connectionType === "review_comention") {
        updates.coMentionCount = (existing.coMentionCount || 0) + 1;
        if (reviewId) {
          updates.reviewIds = [...(existing.reviewIds || []), reviewId];
        }
      }

      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    // Create new edge
    const newEdge: Record<string, any> = {
      sourceArtistId: sourceId,
      targetArtistId: targetId,
      weight: baseWeight,
      connectionTypes: [connectionType],
      evidence: evidence ? [evidence] : [],
      createdAt: now,
      updatedAt: now,
    };

    if (connectionType === "review_comention") {
      newEdge.coMentionCount = 1;
      if (reviewId) newEdge.reviewIds = [reviewId];
    }

    return await ctx.db.insert("artistConnections", newEdge as any);
  },
});

// Fuzzy artist lookup: exact match → search index → nameVariants/aliases
export const findArtistByNameFuzzy = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const normalized = name.trim();
    if (!normalized) return null;

    // 1. Exact match on by_name index
    const exact = await ctx.db
      .query("artists")
      .withIndex("by_name", (q) => q.eq("name", normalized))
      .first();
    if (exact) return exact;

    // 2. Case-insensitive via search index
    const searchResults = await ctx.db
      .query("artists")
      .withSearchIndex("search_artists", (q) => q.search("name", normalized))
      .take(10);

    // Check nameVariants and aliases for matches
    const lowerName = normalized.toLowerCase();
    for (const artist of searchResults) {
      if (artist.name.toLowerCase() === lowerName) return artist;

      const variants = artist.nameVariants || [];
      if (variants.some((v: string) => v.toLowerCase() === lowerName)) return artist;

      const aliases = artist.aliases || [];
      if (aliases.some((a: string) => a.toLowerCase() === lowerName)) return artist;
    }

    // 3. Return top search result if name is a close prefix match
    if (searchResults.length > 0) {
      const top = searchResults[0];
      if (
        top.name.toLowerCase().startsWith(lowerName) ||
        lowerName.startsWith(top.name.toLowerCase())
      ) {
        return top;
      }
    }

    return null;
  },
});

// Get a review by ID (used by NER extraction)
export const getReview = internalQuery({
  args: { reviewId: v.id("reviews") },
  handler: async (ctx, { reviewId }) => ctx.db.get(reviewId),
});

// Get unprocessed reviews for NER
export const getUnprocessedReviews = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("reviews")
      .withIndex("by_nerProcessed", (q) => q.eq("nerProcessed", false))
      .take(limit);
  },
});

// Update review after NER processing
export const updateReviewNer = internalMutation({
  args: {
    reviewId: v.id("reviews"),
    mentionedArtistIds: v.array(v.id("artists")),
    mentionedArtistNames: v.array(v.string()),
  },
  handler: async (ctx, { reviewId, mentionedArtistIds, mentionedArtistNames }) => {
    await ctx.db.patch(reviewId, {
      mentionedArtistIds,
      mentionedArtistNames,
      nerProcessed: true,
      nerProcessedAt: Date.now(),
    });
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

// ═══════════════════════════════════════════════════════════════
//  NER: Extract artist mentions from text (Stell-R methodology)
//  Ported from crate-cli extractArtistMentions()
// ═══════════════════════════════════════════════════════════════

// False positives: common non-artist strings that match Title Case
const NER_FALSE_POSITIVES = new Set([
  "The New York Times", "The Guardian", "The Wire", "Rolling Stone",
  "The Fader", "Pitchfork", "NPR", "BBC", "The Record", "Sound On Sound",
  "The Vinyl Factory", "Resident Advisor", "Bandcamp Daily",
  "Record Store Day", "Album Of The Year", "Song Of The Year",
  "Best New Music", "Record Of The Year", "Music Video",
  "Grammy Award", "Mercury Prize", "North America", "South America",
  "United States", "United Kingdom", "New York", "Los Angeles",
  "San Francisco", "New Orleans", "South London", "East London",
  "West Africa", "East Africa", "South Africa", "North Africa",
  "World Music", "Electronic Music", "Hip Hop", "Rhythm And Blues",
  "The Album", "The Song", "The Track", "The Record", "The Band",
  "The Group", "The Duo", "The Producer", "Last Year", "Next Year",
  "This Year", "First Album", "Second Album", "Third Album",
  "Best Songs", "Best Albums", "Best Tracks", "Best Music",
  "West African", "Could We Be Here", "Neo Soul",
  "The London", "The Berlin", "The Paris", "The Chicago",
]);

// Influence phrase families (5 families from Stell-R paper)
const INFLUENCE_PHRASES = [
  /influenced\s+by/i,
  /in\s+the\s+(?:vein|tradition|spirit)\s+of/i,
  /sounds?\s+like/i,
  /owes?\s+(?:a\s+)?(?:debt|lot)\s+to/i,
  /following\s+in\s+the\s+footsteps?\s+of/i,
  /reminiscent\s+of/i,
  /echoes?\s+(?:of\s+)?/i,
  /channeling/i,
  /paying\s+(?:homage|tribute)\s+to/i,
  /inspired\s+by/i,
  /draws?\s+(?:from|on|inspiration)/i,
  /heirs?\s+(?:to|of)/i,
  /descendants?\s+of/i,
  /in\s+the\s+mold\s+of/i,
];

interface ArtistMention {
  name: string;
  isInfluenceContext: boolean;
  context?: string;
}

function extractArtistMentions(text: string, primaryArtistName: string): ArtistMention[] {
  const mentions: ArtistMention[] = [];
  const seenNames = new Set<string>();
  const primaryLower = primaryArtistName.toLowerCase();

  function addMention(name: string, isInfluenceContext: boolean, context: string) {
    const trimName = name.trim().replace(/'s$/, ""); // strip possessives
    if (
      trimName.length >= 4 &&
      !NER_FALSE_POSITIVES.has(trimName) &&
      trimName.toLowerCase() !== primaryLower &&
      !seenNames.has(trimName.toLowerCase())
    ) {
      seenNames.add(trimName.toLowerCase());
      mentions.push({ name: trimName, isInfluenceContext, context });
    }
  }

  // Split text into sentences for context
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const isInfluenceContext = INFLUENCE_PHRASES.some((re) => re.test(trimmed));
    let match;

    // Pattern 1: Title Case names (2-5 words) with article connectors
    // Catches: "Fela Kuti", "Sons of Kemet", "Queens of the Stone Age", "The Roots"
    // Does NOT join across "and"/"," — those separate different artists
    const titleCaseRegex = /\b((?:The\s+)?[A-Z][a-z]+(?:(?:\s+(?:of|the|de|van|von|del|la|el|al)\s+(?:the\s+)?[A-Z][a-z]+)|\s+[A-Z][a-z]+){1,4})\b/g;
    while ((match = titleCaseRegex.exec(trimmed)) !== null) {
      const ctx = trimmed.substring(
        Math.max(0, match.index - 50),
        Math.min(trimmed.length, match.index + match[1].length + 50)
      );
      addMention(match[1], isInfluenceContext, ctx);
    }

    // Pattern 2: ALL-CAPS words (3+ chars) — "DOOM", "JPEGMAFIA"
    const allCapsRegex = /\b([A-Z]{3,})\b/g;
    while ((match = allCapsRegex.exec(trimmed)) !== null) {
      const name = match[1];
      if (!CAPS_STOPWORDS.has(name)) {
        const ctx = trimmed.substring(
          Math.max(0, match.index - 50),
          Math.min(trimmed.length, match.index + name.length + 50)
        );
        addMention(name, isInfluenceContext, ctx);
      }
    }

    // Pattern 3: ALL-CAPS + Title Case — "DJ Shadow", "MF DOOM", "DJ Premier"
    const mixedRegex = /\b([A-Z]{2,3}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
    while ((match = mixedRegex.exec(trimmed)) !== null) {
      const ctx = trimmed.substring(
        Math.max(0, match.index - 50),
        Math.min(trimmed.length, match.index + match[1].length + 50)
      );
      addMention(match[1], isInfluenceContext, ctx);
    }
  }

  // Sort: influence-context mentions first
  mentions.sort((a, b) => {
    if (a.isInfluenceContext && !b.isInfluenceContext) return -1;
    if (!a.isInfluenceContext && b.isInfluenceContext) return 1;
    return 0;
  });

  return mentions;
}

const CAPS_STOPWORDS = new Set([
  "THE", "AND", "FOR", "BUT", "NOT", "ALL", "HAS", "HAD", "HIS", "HER",
  "WAS", "ARE", "ITS", "OUR", "WHO", "HOW", "NEW", "OLD", "OWN", "OUT",
  "ONE", "TWO", "GET", "GOT", "CAN", "MAY", "USE", "WAY", "DAY", "MAN",
  "NOW", "RUN", "SET", "TRY", "TOP", "END", "BIG", "LET", "SAY",
  "NPR", "BBC", "DIY", "NYC", "USA", "LED", "NEO",
]);

// ═══════════════════════════════════════════════════════════════
//  ON-DEMAND YOUTUBE TRACK MATCH
//  Called from frontend when user clicks play on a track without
//  a youtubeVideoId. Searches YouTube once, caches result forever.
// ═══════════════════════════════════════════════════════════════

export const matchTrackYoutube = action({
  args: { trackId: v.id("tracks") },
  handler: async (ctx, { trackId }): Promise<{ youtubeVideoId: string | null }> => {
    const track = await ctx.runQuery(internal.enrichment.getTrack, { trackId });
    if (!track) return { youtubeVideoId: null };

    // Already matched — return cached result
    if (track.youtubeVideoId) return { youtubeVideoId: track.youtubeVideoId };

    const query = `${track.artistName} ${track.title}`;
    let videoId: string | null = null;

    // Primary: YouTube InnerTube API (no quota, no API key needed)
    try {
      const resp = await fetch(
        "https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00" } },
            query,
          }),
        }
      );
      if (resp.ok) {
        const text = await resp.text();
        const match = text.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
        videoId = match?.[1] ?? null;
      }
    } catch {
      // Fall through to API fallback
    }

    // Fallback: YouTube Data API v3 (if key set and quota available)
    if (!videoId) {
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (apiKey) {
        try {
          const resp = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=1&key=${apiKey}`
          );
          if (resp.ok) {
            const data = await resp.json();
            videoId = data.items?.[0]?.id?.videoId ?? null;
          }
        } catch { /* non-critical */ }
      }
    }

    if (videoId) {
      await ctx.runMutation(internal.enrichment.updateTrackField, {
        trackId,
        field: "youtubeVideoId",
        value: videoId,
      });
      return { youtubeVideoId: videoId };
    }

    return { youtubeVideoId: null };
  },
});
