// convex/schema.ts
// Rhythm Lab Radio: The Extended Experience
// Full database schema — playlists, artists, tracks, knowledge graph, enrichment pipeline

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ═══════════════════════════════════════════════════════════════
  //  EPISODES & PLAYLISTS — The Primary Graph Seed
  // ═══════════════════════════════════════════════════════════════

  // Each Rhythm Lab Radio episode with its playlist
  episodes: defineTable({
    title: v.string(), // "Rhythm Lab Radio — Episode 412"
    slug: v.string(), // "episode-412"
    airDate: v.string(), // ISO date "2025-02-14"
    airDateTimestamp: v.number(), // Unix ms for sorting/filtering
    description: v.optional(v.string()), // Show notes / episode description
    showNotesHtml: v.optional(v.string()), // Raw HTML of show notes for NER
    showNotesPlaintext: v.optional(v.string()), // Cleaned plaintext for NER pipeline
    sourceUrl: v.optional(v.string()), // Mixcloud / podcast URL
    sourceType: v.optional(
      v.union(
        v.literal("mixcloud"),
        v.literal("soundcloud"),
        v.literal("podcast_rss"),
        v.literal("manual")
      )
    ),
    coverImageUrl: v.optional(v.string()), // Episode artwork from source
    generatedCoverUrl: v.optional(v.string()), // Nano Banana generated cover
    trackCount: v.number(), // Number of tracks in episode
    season: v.optional(v.string()), // Optional season/year grouping
    tags: v.optional(v.array(v.string())), // Genre tags, themes
    enrichmentStatus: v.union(
      v.literal("raw"), // Just title + tracklist
      v.literal("notes_parsed"), // Show notes NER complete
      v.literal("tracks_linked"), // All tracks matched to artist records
      v.literal("complete") // Full enrichment done
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_airDate", ["airDateTimestamp"])
    .index("by_slug", ["slug"])
    .index("by_enrichmentStatus", ["enrichmentStatus"])
    .searchIndex("search_episodes", {
      searchField: "title",
      filterFields: ["enrichmentStatus"],
    }),

  // ═══════════════════════════════════════════════════════════════
  //  ARTISTS — The Graph Nodes
  // ═══════════════════════════════════════════════════════════════

  artists: defineTable({
    // --- Identity ---
    name: v.string(), // Canonical name
    sortName: v.optional(v.string()), // "Coltrane, John"
    nameVariants: v.optional(v.array(v.string())), // Alt names for NER matching
    disambiguation: v.optional(v.string()), // "UK electronic duo" vs solo artist

    // --- External IDs (populated during enrichment) ---
    musicbrainzId: v.optional(v.string()), // MBID — the universal key
    discogsId: v.optional(v.number()), // Discogs artist ID
    discogsResourceUrl: v.optional(v.string()),
    geniusId: v.optional(v.number()), // Genius artist ID
    geniusUrl: v.optional(v.string()),
    wikidataId: v.optional(v.string()), // For Wikimedia Commons photos
    spotifyId: v.optional(v.string()), // For playlist export matching
    appleMusicId: v.optional(v.string()),
    youtubeMusicChannelId: v.optional(v.string()),
    bandcampUrl: v.optional(v.string()),

    // --- Images (multiple sources, prioritized) ---
    images: v.optional(
      v.object({
        // Primary artist photo (displayed on graph nodes, cards)
        primary: v.optional(
          v.object({
            url: v.string(),
            source: v.union(
              v.literal("discogs"),
              v.literal("wikimedia"),
              v.literal("fanart_tv"),
              v.literal("musicbrainz"),
              v.literal("genius"),
              v.literal("manual")
            ),
            width: v.optional(v.number()),
            height: v.optional(v.number()),
            attribution: v.optional(v.string()), // License / credit
          })
        ),
        // Thumbnail for graph nodes (64x64 or 128x128)
        thumbnail: v.optional(
          v.object({
            url: v.string(),
            source: v.string(),
          })
        ),
        // All available images from all sources
        all: v.optional(
          v.array(
            v.object({
              url: v.string(),
              source: v.string(),
              width: v.optional(v.number()),
              height: v.optional(v.number()),
              type: v.optional(v.string()), // "photo", "logo", "banner"
            })
          )
        ),
        // Fanart.tv specific (high-quality artist images)
        fanartBackground: v.optional(v.string()), // HD artist background
        fanartLogo: v.optional(v.string()), // HD artist logo
      })
    ),

    // --- Biographical ---
    country: v.optional(v.string()), // "US", "UK", "NG"
    city: v.optional(v.string()), // "Milwaukee", "Lagos", "London"
    activeYearBegin: v.optional(v.number()),
    activeYearEnd: v.optional(v.number()), // null if still active
    medianReleaseYear: v.optional(v.number()), // From Stell-R methodology
    genres: v.optional(v.array(v.string())), // From MusicBrainz tags
    bio: v.optional(v.string()), // Short bio from Genius or Discogs
    members: v.optional(v.array(v.string())), // Band members (names)

    // --- Sonic Profile (averaged across top tracks) ---
    sonicProfile: v.optional(
      v.object({
        acousticness: v.number(),
        danceability: v.number(),
        energy: v.number(),
        instrumentalness: v.number(),
        liveness: v.number(),
        loudness: v.number(),
        speechiness: v.number(),
        tempo: v.number(),
        valence: v.number(),
        key: v.optional(v.number()), // 0-11, Pitch Class
        mode: v.optional(v.number()), // 0 = minor, 1 = major
      })
    ),
    sonicProfileSource: v.optional(v.string()), // "reccobeats" | "acousticbrainz"
    sonicProfileTrackCount: v.optional(v.number()), // How many tracks averaged

    // --- Graph Metrics (computed during graph finalization) ---
    communityId: v.optional(v.number()), // Leiden community index
    communityLabel: v.optional(v.string()), // "Afrobeat/Highlife", "UK Jazz"
    bridgeScore: v.optional(v.number()), // Betweenness centrality
    influenceScore: v.optional(v.number()), // PageRank or weighted degree
    connectionCount: v.optional(v.number()), // Total edges
    isBridgeArtist: v.optional(v.boolean()), // Top decile betweenness

    // --- Enrichment Tracking ---
    enrichmentStatus: v.union(
      v.literal("stub"), // Just a name from a playlist
      v.literal("identified"), // MusicBrainz ID matched
      v.literal("metadata"), // Core metadata populated
      v.literal("images"), // Images fetched
      v.literal("sonic"), // Sonic profile computed
      v.literal("complete") // All enrichment done
    ),
    enrichmentLog: v.optional(
      v.array(
        v.object({
          step: v.string(), // "musicbrainz_lookup", "discogs_fetch", etc.
          status: v.union(v.literal("success"), v.literal("failed"), v.literal("skipped")),
          timestamp: v.number(),
          details: v.optional(v.string()), // Error message or notes
        })
      )
    ),
    lastEnrichedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_musicbrainzId", ["musicbrainzId"])
    .index("by_discogsId", ["discogsId"])
    .index("by_enrichmentStatus", ["enrichmentStatus"])
    .index("by_communityId", ["communityId"])
    .index("by_bridgeScore", ["bridgeScore"])
    .searchIndex("search_artists", {
      searchField: "name",
      filterFields: ["enrichmentStatus", "communityId"],
    }),

  // ═══════════════════════════════════════════════════════════════
  //  TRACKS — Individual Songs Within Episodes
  // ═══════════════════════════════════════════════════════════════

  tracks: defineTable({
    // --- Core ---
    title: v.string(), // Track title
    artistId: v.id("artists"), // Link to canonical artist record
    artistName: v.string(), // Denormalized for display
    episodeId: v.id("episodes"), // Which episode this track appeared in
    position: v.number(), // Order in the episode playlist (1-indexed)

    // --- Album Info ---
    albumTitle: v.optional(v.string()),
    albumYear: v.optional(v.number()),
    albumMusicbrainzId: v.optional(v.string()), // Release group MBID
    albumDiscogsId: v.optional(v.number()),
    label: v.optional(v.string()), // Record label

    // --- Album Artwork ---
    albumArt: v.optional(
      v.object({
        // Cover Art Archive (primary source, free, high quality)
        coverArtArchiveUrl: v.optional(v.string()), // From CAA via MBID
        coverArtArchiveThumb: v.optional(v.string()), // 250px thumbnail
        // Discogs (fallback)
        discogsImageUrl: v.optional(v.string()),
        // Best available (resolved by enrichment pipeline)
        primaryUrl: v.optional(v.string()),
        primarySource: v.optional(v.string()),
      })
    ),

    // --- External IDs ---
    musicbrainzRecordingId: v.optional(v.string()),
    isrc: v.optional(v.string()), // International Standard Recording Code
    geniusSongId: v.optional(v.number()),
    geniusSongUrl: v.optional(v.string()),
    youtubeVideoId: v.optional(v.string()), // Best match music video
    youtubeVideoTitle: v.optional(v.string()),
    spotifyTrackId: v.optional(v.string()),
    appleMusicTrackId: v.optional(v.string()),

    // --- Sonic Features (track-level, contributes to artist profile) ---
    sonicFeatures: v.optional(
      v.object({
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
      })
    ),
    sonicFeaturesSource: v.optional(v.string()),

    // --- Enrichment ---
    enrichmentStatus: v.union(
      v.literal("raw"), // Just title + artist name from playlist
      v.literal("matched"), // Matched to MusicBrainz recording
      v.literal("artwork"), // Album art fetched
      v.literal("sonic"), // Sonic features fetched
      v.literal("complete") // All enrichment done
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_episodeId", ["episodeId"])
    .index("by_artistId", ["artistId"])
    .index("by_position", ["episodeId", "position"])
    .index("by_enrichmentStatus", ["enrichmentStatus"])
    .index("by_albumMusicbrainzId", ["albumMusicbrainzId"])
    .searchIndex("search_tracks", {
      searchField: "title",
      filterFields: ["enrichmentStatus"],
    }),

  // ═══════════════════════════════════════════════════════════════
  //  ARTIST CONNECTIONS — The Graph Edges
  // ═══════════════════════════════════════════════════════════════

  artistConnections: defineTable({
    sourceArtistId: v.id("artists"),
    targetArtistId: v.id("artists"),

    // --- Edge Properties ---
    weight: v.number(), // Combined weight (higher = stronger connection)
    sonicDistance: v.optional(v.number()), // Weighted Euclidean from Stell-R paper

    // --- Connection Types (multiple types can coexist on one edge) ---
    connectionTypes: v.array(
      v.union(
        v.literal("playlist_adjacent"), // Appeared sequentially in a playlist
        v.literal("review_comention"), // Co-mentioned in a music review
        v.literal("collaboration"), // Credited on same release
        v.literal("sample"), // Sampling relationship
        v.literal("same_label"), // Shared record label
        v.literal("shared_member"), // Band member overlap
        v.literal("show_notes"), // Mentioned together in Rhythm Lab show notes
        v.literal("manual") // Manually added curatorial connection
      )
    ),

    // --- Evidence (for narration grounding) ---
    evidence: v.optional(
      v.array(
        v.object({
          type: v.string(), // "playlist", "review", "credits"
          source: v.string(), // "Rhythm Lab Ep 412", "Pitchfork", "Discogs"
          excerpt: v.optional(v.string()), // Quote for agent narration
          url: v.optional(v.string()), // Link to source
          date: v.optional(v.string()), // When this evidence was published
        })
      )
    ),

    // --- Playlist adjacency specifics ---
    playlistAdjacentCount: v.optional(v.number()), // How many times sequential
    episodeIds: v.optional(v.array(v.id("episodes"))), // Which episodes

    // --- Review co-mention specifics ---
    coMentionCount: v.optional(v.number()), // From Stell-R NER pipeline
    reviewIds: v.optional(v.array(v.id("reviews"))), // Which reviews

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source", ["sourceArtistId"])
    .index("by_target", ["targetArtistId"])
    .index("by_pair", ["sourceArtistId", "targetArtistId"])
    .index("by_weight", ["weight"]),

  // ═══════════════════════════════════════════════════════════════
  //  REVIEWS — Music Journalism Corpus for NER
  // ═══════════════════════════════════════════════════════════════

  reviews: defineTable({
    // --- Source ---
    publication: v.union(
      // Tier 0: Your own writing (highest signal)
      v.literal("rhythm_lab"), // Show notes, blog posts
      v.literal("the_intersection"), // Newsletter
      // Tier 1: Major music journalism
      v.literal("npr"),
      v.literal("pitchfork"),
      v.literal("the_quietus"),
      v.literal("genius"),
      v.literal("the_guardian"),
      v.literal("nyt"),
      v.literal("the_wire"),
      // Tier 2: Genre-specialist
      v.literal("resident_advisor"),
      v.literal("bandcamp_daily"),
      v.literal("the_fader"),
      v.literal("okayplayer"),
      v.literal("stereogum"),
      v.literal("the_vinyl_factory"),
      v.literal("fact_mag"),
      v.literal("xlr8r"),
      v.literal("dj_mag"),
      v.literal("aquarium_drunkard"),
      v.literal("tiny_mix_tapes"),
      // Tier 3: Community / blog
      v.literal("passion_of_the_weiss"),
      v.literal("wax_poetics"),
      v.literal("crack_magazine"),
      v.literal("clash_music"),
      v.literal("loud_and_quiet"),
      v.literal("other")
    ),
    author: v.optional(v.string()),
    title: v.optional(v.string()), // Review headline
    url: v.optional(v.string()),
    publishDate: v.optional(v.string()),

    // --- Content ---
    fullText: v.optional(v.string()), // Full review text (for NER)
    excerpt: v.string(), // Key paragraph(s) for narration grounding
    rating: v.optional(v.number()), // Pitchfork score, etc.

    // --- The artist this review is primarily about ---
    primaryArtistId: v.optional(v.id("artists")),
    primaryArtistName: v.optional(v.string()),
    albumTitle: v.optional(v.string()),

    // --- NER Results ---
    mentionedArtistIds: v.optional(v.array(v.id("artists"))), // All artists found by NER
    mentionedArtistNames: v.optional(v.array(v.string())), // Names before resolution
    nerProcessed: v.boolean(), // Whether NER has been run
    nerProcessedAt: v.optional(v.number()),

    createdAt: v.number(),
  })
    .index("by_publication", ["publication"])
    .index("by_primaryArtist", ["primaryArtistId"])
    .index("by_nerProcessed", ["nerProcessed"])
    .searchIndex("search_reviews", {
      searchField: "excerpt",
      filterFields: ["publication", "nerProcessed"],
    }),

  // ═══════════════════════════════════════════════════════════════
  //  COMMUNITIES — Leiden-detected Genre Clusters
  // ═══════════════════════════════════════════════════════════════

  communities: defineTable({
    communityIndex: v.number(), // 0, 1, 2, ... from Leiden
    label: v.string(), // "Afrobeat / Highlife", "UK Jazz Scene"
    description: v.optional(v.string()), // Curatorially-written description
    color: v.string(), // Hex color for graph visualization
    artistCount: v.number(),
    topArtistIds: v.optional(v.array(v.id("artists"))), // Top 5 by influence
    bridgeArtistIds: v.optional(v.array(v.id("artists"))), // Bridge artists in this community
    avgSonicProfile: v.optional(
      v.object({
        acousticness: v.number(),
        danceability: v.number(),
        energy: v.number(),
        instrumentalness: v.number(),
        liveness: v.number(),
        loudness: v.number(),
        speechiness: v.number(),
        tempo: v.number(),
        valence: v.number(),
      })
    ),
    generatedArtworkUrl: v.optional(v.string()), // Nano Banana generated community visual
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_communityIndex", ["communityIndex"]),

  // ═══════════════════════════════════════════════════════════════
  //  USER PLAYLISTS — Built During Conversations
  // ═══════════════════════════════════════════════════════════════

  playlists: defineTable({
    // --- Identity ---
    title: v.string(),
    description: v.optional(v.string()),
    userId: v.optional(v.string()), // Anonymous or authenticated
    sessionId: v.optional(v.string()), // Conversation session that created it

    // --- Tracks ---
    trackIds: v.array(v.id("tracks")),
    trackOrder: v.array(v.number()), // Position overrides for custom ordering

    // --- Cover Art ---
    coverArt: v.optional(
      v.object({
        generatedUrl: v.optional(v.string()), // Nano Banana playlist cover
        prompt: v.optional(v.string()), // Prompt used to generate
        sourceTrackArtUrl: v.optional(v.string()), // Fallback: first track's album art
      })
    ),

    // --- Generation Context ---
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
        traversalAlgorithm: v.optional(v.string()), // "bfs", "dijkstra", "maxflow"
        constraints: v.optional(v.string()), // "progressively more electronic"
      })
    ),

    // --- Export Status ---
    exports: v.optional(
      v.array(
        v.object({
          platform: v.union(
            v.literal("spotify"),
            v.literal("apple_music"),
            v.literal("youtube_music"),
            v.literal("tidal"),
            v.literal("m3u"),
            v.literal("json")
          ),
          externalId: v.optional(v.string()), // Spotify playlist ID, etc.
          externalUrl: v.optional(v.string()),
          exportedAt: v.number(),
        })
      )
    ),

    // --- Social ---
    isPublic: v.boolean(),
    shareUrl: v.optional(v.string()),
    listenCount: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_sessionId", ["sessionId"])
    .index("by_public", ["isPublic", "createdAt"]),

  // ═══════════════════════════════════════════════════════════════
  //  CONVERSATIONS — Voice + Text Sessions
  // ═══════════════════════════════════════════════════════════════

  conversations: defineTable({
    userId: v.optional(v.string()),
    title: v.optional(v.string()), // Auto-generated from first query
    mode: v.union(
      v.literal("voice"), // Gemini Live
      v.literal("text"), // Text chat
      v.literal("hybrid") // Voice + text interleaved
    ),
    episodeId: v.optional(v.id("episodes")), // If exploring a specific episode
    activeArtistIds: v.optional(v.array(v.id("artists"))), // Artists discussed
    activePlaylistId: v.optional(v.id("playlists")), // Playlist being built

    // --- Gemini Live Session ---
    geminiSessionHandle: v.optional(v.string()), // For session resumption
    lastActivityAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_lastActivity", ["lastActivityAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(), // Text content (or transcript of voice)

    // --- Rich content attached to assistant messages ---
    attachments: v.optional(
      v.array(
        v.object({
          type: v.union(
            v.literal("influence_path"), // Graph traversal result
            v.literal("artist_card"), // Artist info card
            v.literal("album_art"), // Album artwork display
            v.literal("sonic_radar"), // Radar chart data
            v.literal("waveform"), // Waveform visualization
            v.literal("youtube_embed"), // YouTube video
            v.literal("generated_image"), // Nano Banana image
            v.literal("playlist_update"), // Playlist modification
            v.literal("review_excerpt") // Cited review text
          ),
          data: v.any(), // Type-specific payload
        })
      )
    ),

    // --- Voice specifics ---
    isVoice: v.optional(v.boolean()),
    audioTranscript: v.optional(v.string()), // If different from content

    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_time", ["conversationId", "createdAt"]),

  // ═══════════════════════════════════════════════════════════════
  //  ENRICHMENT JOBS — Pipeline Tracking
  // ═══════════════════════════════════════════════════════════════

  enrichmentJobs: defineTable({
    // --- What to enrich ---
    targetType: v.union(
      v.literal("artist"),
      v.literal("track"),
      v.literal("episode"),
      v.literal("review")
    ),
    targetId: v.string(), // Convex ID of the target record
    targetName: v.string(), // Human-readable name for logging

    // --- Job details ---
    step: v.union(
      v.literal("musicbrainz_lookup"),
      v.literal("discogs_fetch"),
      v.literal("genius_fetch"),
      v.literal("fanart_tv_fetch"),
      v.literal("wikimedia_fetch"),
      v.literal("cover_art_archive"),
      v.literal("reccobeats_fetch"),
      v.literal("acousticbrainz_fetch"),
      v.literal("youtube_match"),
      v.literal("ner_extraction"),
      v.literal("sonic_profile_compute"),
      v.literal("graph_metrics_compute")
    ),
    priority: v.union(
      v.literal("critical"), // Needed for current user conversation
      v.literal("high"), // Part of active episode enrichment
      v.literal("normal"), // Background enrichment
      v.literal("low") // Nice-to-have
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    attempts: v.number(),
    maxAttempts: v.number(),
    lastError: v.optional(v.string()),
    result: v.optional(v.any()), // Stored result for debugging

    scheduledAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status_priority", ["status", "priority"])
    .index("by_target", ["targetType", "targetId"])
    .index("by_step", ["step", "status"]),

  // ═══════════════════════════════════════════════════════════════
  //  GRAPH SNAPSHOTS — Serialized Graph State for Frontend
  // ═══════════════════════════════════════════════════════════════

  graphSnapshots: defineTable({
    version: v.number(),
    label: v.string(), // "v1-initial", "v2-post-enrichment"
    nodeCount: v.number(),
    edgeCount: v.number(),
    communityCount: v.number(),

    // --- Serialized graph data for D3 frontend ---
    // Stored as JSON strings to fit Convex value limits
    nodesJson: v.string(), // [{id, name, community, x, y, size, imageUrl}, ...]
    edgesJson: v.string(), // [{source, target, weight, type}, ...]
    communitiesJson: v.string(), // [{id, label, color, center}, ...]

    // --- Metrics ---
    modularity: v.optional(v.number()), // Graph modularity score
    avgClusteringCoefficient: v.optional(v.number()),

    isActive: v.boolean(), // Which snapshot the frontend should use
    createdAt: v.number(),
  })
    .index("by_active", ["isActive"])
    .index("by_version", ["version"]),
});
