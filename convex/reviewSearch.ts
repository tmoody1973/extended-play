// convex/reviewSearch.ts
// Agent tool: search music publications for review context during conversation
// Uses Exa AI for semantic search across music journalism
// Results are saved to the reviews table — corpus grows through conversation

import { v } from "convex/values";
import { action, internalAction, internalMutation } from "./_generated/server";
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
              maxCharacters: 5000,
              includeHtmlTags: false,
            },
            highlights: {
              query: "artist influences, collaborations, musical connections, and related musicians",
              numSentences: 5,
              highlightsPerUrl: 3,
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
        const highlights = result.highlights?.join(" ") || "";
        const rawText = result.text || "";
        const cleanedText = cleanExtractedText(rawText);

        // Use cleaned text if it's real article content, otherwise fall back to highlights
        const useCleanedText = isArticleContent(cleanedText);
        const fullText = useCleanedText ? cleanedText : (highlights || cleanedText);
        const excerpt = highlights || cleanedText.substring(0, 500);

        const processed = {
          title: result.title,
          url: result.url,
          publication,
          excerpt,
          fullText,
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
            fullText,
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
          include_raw_content: "markdown",
          chunks_per_source: 3,
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
        const rawContent = result.raw_content || "";
        const excerpt = result.content || "";

        processedResults.push({
          title: result.title,
          url: result.url,
          publication,
          excerpt,
          fullText: rawContent.length > excerpt.length ? rawContent.substring(0, 5000) : undefined,
          score: result.score,
        });

        if (saveToCorpus && excerpt.length > 50) {
          const fullText = rawContent.length > excerpt.length
            ? rawContent.substring(0, 5000)
            : undefined;
          await ctx.runMutation(internal.reviewSearch.saveSearchResult, {
            publication,
            title: result.title,
            url: result.url,
            excerpt,
            fullText,
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
//  PUBLIC: Trigger corpus seeding for an artist (agent-callable)
// ═══════════════════════════════════════════════════════════════

export const triggerCorpusSeed = action({
  args: {
    artistName: v.string(),
    useGeminiGrounding: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    status: string;
    message: string;
    artistName?: string;
  }> => {
    // Look up artist by name
    const artist = await ctx.runQuery(internal.enrichment.findArtistByNameFuzzy, {
      name: args.artistName,
    }) as { _id: any; name: string } | null;

    if (!artist) {
      return {
        status: "not_found",
        message: `No artist found matching "${args.artistName}"`,
      };
    }

    // Trigger review corpus seeding (Exa + Tavily)
    await ctx.runAction(internal.reviewSearch.seedCorpusForArtist, {
      artistId: artist._id,
    });

    // Also trigger Gemini Grounding corpus seeding if requested (default: true)
    const useGrounding = args.useGeminiGrounding !== false;
    let groundingMessage = "";
    if (useGrounding) {
      try {
        await ctx.runAction(internal.geminiGrounding.seedCorpusWithGrounding, {
          artistId: artist._id,
        });
        groundingMessage = " + Gemini Grounding search";
      } catch (e: any) {
        groundingMessage = ` (Gemini Grounding skipped: ${e.message})`;
      }
    }

    return {
      status: "success",
      message: `Corpus seeding triggered for ${artist.name}: Exa/Tavily review search${groundingMessage}. NER extraction queued for new sources.`,
      artistName: artist.name,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
//  CORPUS SEEDING: Search Exa + Tavily for artist reviews
//  Queued by enrichment pipeline after Layer 2
// ═══════════════════════════════════════════════════════════════

export const seedCorpusForArtist = internalAction({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    const artist = await ctx.runQuery(internal.enrichment.getArtist, { artistId });
    if (!artist) return;

    try {
      // Search Exa for 3-5 reviews
      const exaResult = await ctx.runAction(internal.reviewSearch.searchReviewsInternal, {
        query: `${artist.name} music review interview`,
        artistNames: [artist.name],
        maxResults: 5,
      });

      let totalSaved = exaResult.savedCount || 0;

      // If Exa returned < 2, fallback to Tavily
      if ((exaResult.resultCount || 0) < 2) {
        const tavilyResult = await ctx.runAction(internal.reviewSearch.searchReviewsTavilyInternal, {
          query: `${artist.name} music review feature`,
          artistNames: [artist.name],
          maxResults: 3,
        });
        totalSaved += tavilyResult.savedCount || 0;
      }

      // Queue NER for any newly saved reviews
      const unprocessed = await ctx.runQuery(internal.enrichment.getUnprocessedReviews, {
        limit: 10,
      });

      for (const review of unprocessed) {
        if (review.primaryArtistName === artist.name) {
          await ctx.runMutation(internal.enrichment.queueEnrichmentJobs, {
            targetType: "review",
            targetId: review._id,
            targetName: `Review: ${artist.name} - ${review.title || "untitled"}`,
            steps: ["ner_extraction"],
            priority: "normal",
          });
        }
      }

      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "review_corpus_seed",
          status: "success" as const,
          timestamp: Date.now(),
          details: `${totalSaved} reviews saved for ${artist.name}`,
        },
      });
    } catch (error: any) {
      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "review_corpus_seed",
          status: "failed" as const,
          timestamp: Date.now(),
          details: error.message,
        },
      });
    }
  },
});

// Internal Exa search (callable from other actions)
// Uses neural search + inline contents with influence-focused highlights
export const searchReviewsInternal = internalAction({
  args: {
    query: v.string(),
    artistNames: v.optional(v.array(v.string())),
    maxResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.maxResults || 5;

    let searchQuery = args.query;
    if (args.artistNames?.length) {
      searchQuery = `${args.artistNames.join(" ")} ${args.query}`;
    }

    try {
      const exaResponse = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.EXA_API_KEY!,
        },
        body: JSON.stringify({
          query: searchQuery,
          type: "neural",
          useAutoprompt: true,
          numResults: maxResults,
          includeDomains: ALL_DOMAINS,
          contents: {
            text: {
              maxCharacters: 5000,
              includeHtmlTags: false,
            },
            highlights: {
              query: "artist influences, collaborations, musical connections, and related musicians",
              numSentences: 5,
              highlightsPerUrl: 3,
            },
          },
        }),
      });

      if (!exaResponse.ok) throw new Error(`Exa API error: ${exaResponse.status}`);

      const exaData = await exaResponse.json();
      const results = exaData.results || [];

      let savedCount = 0;
      for (const result of results) {
        const publication = detectPublication(result.url);
        const highlights = result.highlights?.join(" ") || "";
        const rawText = result.text || "";
        const cleanedText = cleanExtractedText(rawText);

        // Use cleaned text if real article, otherwise fall back to highlights
        const useCleanedText = isArticleContent(cleanedText);
        const fullText = useCleanedText ? cleanedText : (highlights || cleanedText);
        const excerpt = highlights.length > 50
          ? highlights
          : cleanedText.substring(0, 500);

        if (excerpt.length > 50) {
          await ctx.runMutation(internal.reviewSearch.saveSearchResult, {
            publication,
            title: result.title,
            url: result.url,
            excerpt,
            fullText,
            publishDate: result.publishedDate,
            artistNames: args.artistNames,
          });
          savedCount++;
        }
      }

      return { resultCount: results.length, savedCount };
    } catch (error: any) {
      return { resultCount: 0, savedCount: 0, error: error.message };
    }
  },
});

// Internal Tavily search (callable from other actions)
// Uses advanced depth with raw_content in markdown + 3 chunks per source
export const searchReviewsTavilyInternal = internalAction({
  args: {
    query: v.string(),
    artistNames: v.optional(v.array(v.string())),
    maxResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.maxResults || 5;

    let searchQuery = args.query;
    if (args.artistNames?.length) {
      searchQuery = `${args.artistNames.join(" ")} music review influences collaborations ${args.query}`;
    }

    try {
      const tavilyResponse = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: searchQuery,
          search_depth: "advanced",
          include_domains: ALL_DOMAINS,
          max_results: maxResults,
          include_raw_content: "markdown",
          chunks_per_source: 3,
        }),
      });

      if (!tavilyResponse.ok) throw new Error(`Tavily API error: ${tavilyResponse.status}`);

      const tavilyData = await tavilyResponse.json();
      const results = tavilyData.results || [];

      let savedCount = 0;
      for (const result of results) {
        const publication = detectPublication(result.url);
        // Use raw_content (markdown) for full NER text, content for excerpt
        const rawContent = result.raw_content || "";
        const excerpt = result.content || "";
        const fullText = rawContent.length > excerpt.length
          ? rawContent.substring(0, 5000)
          : undefined;

        if (excerpt.length > 50) {
          await ctx.runMutation(internal.reviewSearch.saveSearchResult, {
            publication,
            title: result.title,
            url: result.url,
            excerpt,
            fullText,
            publishDate: undefined,
            artistNames: args.artistNames,
          });
          savedCount++;
        }
      }

      return { resultCount: results.length, savedCount };
    } catch (error: any) {
      return { resultCount: 0, savedCount: 0, error: error.message };
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
    // Check for duplicate by exact URL match
    if (args.url) {
      const existing = await ctx.db
        .query("reviews")
        .withIndex("by_url", (q) => q.eq("url", args.url!))
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

// Strip HTML boilerplate, nav chrome, SVG data, and other non-article content
function cleanExtractedText(raw: string): string {
  let text = raw;

  // Remove SVG/XML data URLs and inline SVG
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  text = text.replace(/data:image\/svg\+xml[^)\s"]*/g, "");
  text = text.replace(/%3Csvg[\s\S]*?%3C\/svg%3E/gi, "");

  // Remove base64 encoded images
  text = text.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/gi, "");

  // Remove HTML tags (Exa sometimes leaks raw HTML despite includeHtmlTags: false)
  text = text.replace(/<[^>]+>/g, " ");

  // Remove CSS-like content blocks
  text = text.replace(/\{[^}]*(?:color|font|margin|padding|display|background)[^}]*\}/gi, "");

  // Remove common boilerplate patterns
  text = text.replace(/\[!(X|Facebook|Twitter|Instagram|YouTube).*?\]/g, "");
  text = text.replace(/\[!\[.*?\]\(.*?\)\]/g, ""); // markdown image links
  text = text.replace(/!\[.*?\]\([^)]{100,}\)/g, ""); // markdown images with long URLs
  text = text.replace(/\[(?:SUBSCRIBE|MAILING LIST|BOOK OUR STUDIO|Support Today|Cookie Notice|Privacy Policy|Terms of service|Sign Up|Newsletter|Follow Us)\]/gi, "");
  text = text.replace(/\[Design and build by.*?\]/gi, "");

  // Remove nav-like repeated bracket links (e.g. [Read] [Cover Stories] [Album Reviews])
  text = text.replace(/(\[[\w\s]+\]\s*\n?\s*-?\s*){4,}/g, "");

  // Remove lines that are just URLs or markdown link syntax
  text = text.replace(/^https?:\/\/\S+$/gm, "");
  text = text.replace(/^\[.*?\]\s*$/gm, "");

  // Remove URL-encoded noise (common in Exa extractions)
  text = text.replace(/%[0-9A-F]{2}(?:%[0-9A-F]{2}){10,}/gi, "");

  // Collapse excessive whitespace
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{3,}/g, " ");
  text = text.trim();

  return text;
}

// Check if text looks like article content vs boilerplate
function isArticleContent(text: string): boolean {
  if (text.length < 100) return false;

  // Count sentences (rough heuristic: period followed by space+capital or end)
  const sentences = text.match(/[.!?]\s+[A-Z]/g)?.length || 0;
  // Count boilerplate signals
  const boilerplate = (text.match(/\[.*?\]/g)?.length || 0)
    + (text.match(/svg|xmlns|viewBox|data:image/gi)?.length || 0)
    + (text.match(/cookie|privacy|subscribe|newsletter|sign.?up/gi)?.length || 0);

  // Good article has many sentences, few boilerplate markers
  return sentences >= 3 && boilerplate < sentences;
}
