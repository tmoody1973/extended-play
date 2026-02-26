// convex/reviewSearch.ts
// Agent tool: search music publications for review context during conversation
// Uses Exa AI for semantic search across music journalism
// Results are saved to the reviews table — corpus grows through conversation

import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════════════════════
//  PUBLICATION DOMAINS (from Crate CLI's 26 publications)
//  Grouped by tier for search filtering
// ═══════════════════════════════════════════════════════════════

const PUBLICATION_DOMAINS: Record<string, string[]> = {
  // Tier 1: Major music journalism (highest editorial quality)
  major: [
    "pitchfork.com",
    "npr.org/music",
    "theguardian.com/music",
    "nytimes.com/section/arts/music",
    "thewirecuk.com", // The Wire
  ],
  // Tier 2: Genre-specialist (deep knowledge in specific scenes)
  specialist: [
    "residentadvisor.net", // Electronic / club
    "bandcamp.com/daily", // Independent / underground
    "thefader.com", // Hip-hop, R&B, global
    "okayplayer.com", // Hip-hop, soul, Afrobeat
    "stereogum.com", // Indie, alternative
    "thevinylfactory.com", // Vinyl culture, experimental
    "factmag.com", // Electronic, bass
    "xlr8r.com", // Electronic, techno
    "djmag.com", // DJ / club culture
    "thequietus.com", // Avant-garde, experimental
    "aquariumdrunkard.com", // Psychedelia, folk, jazz
    "tinymixedtapes.com", // Experimental, noise
  ],
  // Tier 3: Community / blog (valuable for underground connections)
  community: [
    "passionweiss.com",
    "pfrankandwalters.com",
    "nodata-mag.com",
    "tinymixtapes.com",
    "waxpoetics.com",
    "selftitled.com",
    "crackmagazine.net",
    "clashmusic.com",
    "loudandquiet.com",
    "drownedinsound.com",
  ],
};

// All domains flattened for unrestricted search
const ALL_DOMAINS = Object.values(PUBLICATION_DOMAINS).flat();

// ═══════════════════════════════════════════════════════════════
//  EXA AI SEARCH — Semantic search across music journalism
//  Called by the agent when it needs review context for narration
// ═══════════════════════════════════════════════════════════════

export const searchReviews = action({
  args: {
    query: v.string(), // "Kokoroko Fela Kuti influence afrobeat"
    artistNames: v.optional(v.array(v.string())), // For targeted search
    publicationTier: v.optional(
      v.union(
        v.literal("major"),
        v.literal("specialist"),
        v.literal("community"),
        v.literal("all")
      )
    ),
    maxResults: v.optional(v.number()),
    saveToCorpus: v.optional(v.boolean()), // Save results to reviews table
  },
  handler: async (ctx, args) => {
    const tier = args.publicationTier || "all";
    const maxResults = args.maxResults || 5;
    const saveToCorpus = args.saveToCorpus !== false; // Default true

    // Build domain filter
    const domains =
      tier === "all"
        ? ALL_DOMAINS
        : PUBLICATION_DOMAINS[tier] || ALL_DOMAINS;

    // Build search query — combine user query with artist names for precision
    let searchQuery = args.query;
    if (args.artistNames && args.artistNames.length > 0) {
      searchQuery = `${args.artistNames.join(" ")} ${args.query}`;
    }

    try {
      // ── Exa AI Search ──
      const exaResponse = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.EXA_API_KEY!,
        },
        body: JSON.stringify({
          query: searchQuery,
          type: "neural", // Semantic search — finds conceptual matches
          useAutoprompt: true,
          numResults: maxResults,
          includeDomains: domains,
          contents: {
            text: {
              maxCharacters: 2000, // Get substantial excerpt
              includeHtmlTags: false,
            },
            highlights: {
              numSentences: 3, // Key sentences
              highlightsPerUrl: 2,
            },
          },
        }),
      });

      if (!exaResponse.ok) {
        const errorText = await exaResponse.text();
        throw new Error(`Exa API error: ${exaResponse.status} - ${errorText}`);
      }

      const exaData = await exaResponse.json();
      const results = exaData.results || [];

      // Process and optionally save each result
      const processedResults = [];

      for (const result of results) {
        const publication = detectPublication(result.url);
        const excerpt =
          result.highlights?.join(" ") ||
          result.text?.substring(0, 500) ||
          "";

        const processed = {
          title: result.title,
          url: result.url,
          publication,
          excerpt,
          fullText: result.text,
          publishDate: result.publishedDate,
          score: result.score,
        };

        processedResults.push(processed);

        // Save to corpus if enabled — grows the database through conversation
        if (saveToCorpus && excerpt.length > 50) {
          await ctx.runMutation(internal.reviewSearch.saveSearchResult, {
            publication,
            title: result.title,
            url: result.url,
            excerpt,
            fullText: result.text,
            publishDate: result.publishedDate,
            artistNames: args.artistNames,
          });
        }
      }

      return {
        status: "success",
        resultCount: processedResults.length,
        results: processedResults,
        query: searchQuery,
        savedToCorpus: saveToCorpus,
      };
    } catch (error: any) {
      return {
        status: "error",
        message: error.message,
        resultCount: 0,
        results: [],
      };
    }
  },
});

// ═══════════════════════════════════════════════════════════════
//  TAVILY FALLBACK — Broader web search when Exa misses
// ═══════════════════════════════════════════════════════════════

export const searchReviewsTavily = action({
  args: {
    query: v.string(),
    artistNames: v.optional(v.array(v.string())),
    maxResults: v.optional(v.number()),
    saveToCorpus: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.maxResults || 5;
    const saveToCorpus = args.saveToCorpus !== false;

    let searchQuery = args.query;
    if (args.artistNames?.length) {
      searchQuery = `${args.artistNames.join(" ")} music review ${args.query}`;
    }

    try {
      const tavilyResponse = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: searchQuery,
          search_depth: "advanced",
          include_domains: ALL_DOMAINS,
          max_results: maxResults,
          include_raw_content: false,
        }),
      });

      if (!tavilyResponse.ok) {
        throw new Error(`Tavily API error: ${tavilyResponse.status}`);
      }

      const tavilyData = await tavilyResponse.json();
      const results = tavilyData.results || [];

      const processedResults = [];

      for (const result of results) {
        const publication = detectPublication(result.url);
        const excerpt = result.content || "";

        processedResults.push({
          title: result.title,
          url: result.url,
          publication,
          excerpt,
          score: result.score,
        });

        if (saveToCorpus && excerpt.length > 50) {
          await ctx.runMutation(internal.reviewSearch.saveSearchResult, {
            publication,
            title: result.title,
            url: result.url,
            excerpt,
            publishDate: undefined,
            artistNames: args.artistNames,
          });
        }
      }

      return {
        status: "success",
        resultCount: processedResults.length,
        results: processedResults,
        query: searchQuery,
        savedToCorpus: saveToCorpus,
      };
    } catch (error: any) {
      return {
        status: "error",
        message: error.message,
        resultCount: 0,
        results: [],
      };
    }
  },
});

// ═══════════════════════════════════════════════════════════════
//  INTERNAL: Save search result to reviews table
// ═══════════════════════════════════════════════════════════════

export const saveSearchResult = internalMutation({
  args: {
    publication: v.string(),
    title: v.optional(v.string()),
    url: v.optional(v.string()),
    excerpt: v.string(),
    fullText: v.optional(v.string()),
    publishDate: v.optional(v.string()),
    artistNames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Check for duplicate by URL
    if (args.url) {
      const existing = await ctx.db
        .query("reviews")
        .withSearchIndex("search_reviews", (q) =>
          q.search("excerpt", args.url!)
        )
        .first();
      if (existing) return; // Already have this review
    }

    // Resolve primary artist if mentioned
    let primaryArtistId;
    let primaryArtistName;
    if (args.artistNames?.length) {
      primaryArtistName = args.artistNames[0];
      const artist = await ctx.db
        .query("artists")
        .withIndex("by_name", (q) => q.eq("name", primaryArtistName!))
        .first();
      primaryArtistId = artist?._id;
    }

    await ctx.db.insert("reviews", {
      publication: mapToPublicationType(args.publication),
      title: args.title,
      url: args.url,
      excerpt: args.excerpt,
      fullText: args.fullText,
      publishDate: args.publishDate,
      primaryArtistId,
      primaryArtistName,
      nerProcessed: false,
      createdAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function detectPublication(url: string): string {
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
  };

  for (const [domain, pub] of Object.entries(domainMap)) {
    if (url.includes(domain)) return pub;
  }
  return "other";
}

function mapToPublicationType(detected: string): any {
  const validTypes = [
    "npr", "pitchfork", "the_quietus", "rhythm_lab", "the_intersection",
    "genius", "resident_advisor", "bandcamp_daily", "the_wire", "the_fader",
    "stereogum", "tiny_mix_tapes", "aquarium_drunkard", "okayplayer",
    "the_vinyl_factory", "fact_mag", "dj_mag", "xlr8r", "other",
  ];
  return validTypes.includes(detected) ? detected : "other";
}
