"use node";

// Gemini Grounding enrichment — runs in Node.js runtime
// Uses Vertex AI SDK which requires Node.js built-ins (fs, crypto, etc.)

import { v } from "convex/values";
import { internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";

// Layer 2b: Gemini Grounding — Fill metadata gaps via Google Search
export const enrichArtistWithGrounding = internalAction({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    const artist = await ctx.runQuery(internal.enrichment.getArtist, { artistId });
    if (!artist) return;

    // Only ground if missing key metadata
    if (artist.bio && artist.genres && artist.genres.length > 0) return;

    const { VertexAI } = require("@google-cloud/vertexai");
    const vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT || "extended-play-488702",
      location: "us-central1",
    });
    const model = vertexAI.getGenerativeModel({ model: "gemini-3.0-pro" });

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Research the musician/band "${artist.name}" and extract structured metadata. If this is an obscure or unknown artist, provide your best assessment based on available information. Return valid JSON only.`,
            },
          ],
        },
      ],
      tools: [{ googleSearchRetrieval: {} }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            bio: { type: "STRING" },
            genres: { type: "ARRAY", items: { type: "STRING" } },
            relatedArtists: { type: "ARRAY", items: { type: "STRING" } },
            country: { type: "STRING" },
            activeYearBegin: { type: "INTEGER" },
            activeYearEnd: { type: "INTEGER" },
          },
        },
      },
    });

    const text = response.response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "gemini_grounding",
          status: "failed",
          timestamp: Date.now(),
          details: "No response from Gemini",
        },
      });
      return;
    }

    const metadata = JSON.parse(text);

    // Merge: only fill gaps, don't overwrite existing data
    const updates: Record<string, any> = {};
    if (!artist.bio && metadata.bio) updates.bio = metadata.bio;
    if ((!artist.genres || artist.genres.length === 0) && metadata.genres?.length > 0) {
      updates.genres = metadata.genres;
    } else if (artist.genres && metadata.genres?.length > 0) {
      updates.genres = [...new Set([...artist.genres, ...metadata.genres])];
    }
    if (!artist.country && metadata.country) updates.country = metadata.country;
    if (!artist.activeYearBegin && metadata.activeYearBegin) {
      updates.activeYearBegin = metadata.activeYearBegin;
    }
    if (!artist.activeYearEnd && metadata.activeYearEnd) {
      updates.activeYearEnd = metadata.activeYearEnd;
    }

    await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
      artistId,
      updates,
      logEntry: {
        step: "gemini_grounding",
        status: "success",
        timestamp: Date.now(),
        details: `Enhanced via Google Search grounding (${Object.keys(updates).length} fields)`,
      },
    });
  },
});

// ═══════════════════════════════════════════════════════════════
//  CORPUS SEEDING: Find interviews, features, profiles via Grounding
//  Extracts grounded sources → saves to reviews table → queues NER
// ═══════════════════════════════════════════════════════════════

export const seedCorpusWithGrounding = internalAction({
  args: { artistId: v.id("artists") },
  handler: async (ctx, { artistId }) => {
    const artist = await ctx.runQuery(internal.enrichment.getArtist, { artistId });
    if (!artist) return;

    try {
      const { VertexAI } = require("@google-cloud/vertexai");
      const vertexAI = new VertexAI({
        project: process.env.GOOGLE_CLOUD_PROJECT || "extended-play-488702",
        location: "us-central1",
      });
      const model = vertexAI.getGenerativeModel({ model: "gemini-3.0-pro" });

      const response = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Find interviews, features, and profiles discussing the musical influences, collaborations, and artistic connections of ${artist.name}. Include specific artist names mentioned as influences. Return JSON with: sources (array of {title, url, excerpt}), relatedArtists (array of artist name strings found in sources).`,
              },
            ],
          },
        ],
        tools: [{ google_search: {} }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              sources: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    title: { type: "STRING" },
                    url: { type: "STRING" },
                    excerpt: { type: "STRING" },
                  },
                },
              },
              relatedArtists: { type: "ARRAY", items: { type: "STRING" } },
            },
          },
        },
      });

      const text = response.response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
          artistId,
          updates: {},
          logEntry: {
            step: "gemini_corpus_seed",
            status: "failed",
            timestamp: Date.now(),
            details: "No response from Gemini",
          },
        });
        return;
      }

      const result = JSON.parse(text);
      const sources = result.sources || [];
      const relatedArtists = result.relatedArtists || [];

      // Also extract from grounding metadata if available
      const groundingChunks =
        response.response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

      // Save each grounded source to reviews table
      let savedCount = 0;
      const allSources = [
        ...sources.map((s: any) => ({ title: s.title, url: s.url, excerpt: s.excerpt })),
        ...groundingChunks
          .filter((c: any) => c.web?.uri)
          .map((c: any) => ({ title: c.web.title || "", url: c.web.uri, excerpt: "" })),
      ];

      for (const source of allSources) {
        if (!source.url || !source.excerpt && !source.title) continue;

        await ctx.runMutation(internal.enrichment.saveGroundedSource, {
          artistId,
          artistName: artist.name,
          title: source.title,
          url: source.url,
          excerpt: source.excerpt || source.title || "",
        });
        savedCount++;
      }

      // Create direct edges for relatedArtists from Gemini's structured response
      let edgesCreated = 0;
      for (const relatedName of relatedArtists) {
        const relatedArtist = await ctx.runQuery(
          internal.enrichment.findArtistByNameFuzzy,
          { name: relatedName }
        );
        if (relatedArtist && relatedArtist._id !== artistId) {
          await ctx.runMutation(internal.enrichment.createOrStrengthenConnection, {
            artistAId: artistId,
            artistBId: relatedArtist._id,
            connectionType: "collaboration",
            evidence: {
              type: "review",
              source: "Gemini Grounding",
              excerpt: `${relatedName} identified as connected to ${artist.name} via grounded search`,
            },
          });
          edgesCreated++;
        }
      }

      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "gemini_corpus_seed",
          status: "success",
          timestamp: Date.now(),
          details: `${savedCount} sources saved, ${edgesCreated} edges from ${relatedArtists.length} related artists`,
        },
      });
    } catch (error: any) {
      await ctx.runMutation(internal.enrichment.updateArtistEnrichment, {
        artistId,
        updates: {},
        logEntry: {
          step: "gemini_corpus_seed",
          status: "failed",
          timestamp: Date.now(),
          details: error.message,
        },
      });
    }
  },
});

// Batch starter: enqueue artists missing bios/genres for Gemini Grounding
export const enrichArtistsWithGrounding = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }): Promise<{ queued: number }> => {
    const identified = await ctx.runQuery(internal.enrichment.getArtistsByStatus, {
      status: "identified",
      limit,
    });
    const metadata = await ctx.runQuery(internal.enrichment.getArtistsByStatus, {
      status: "metadata",
      limit,
    });

    const candidates = [...identified, ...metadata].filter(
      (a) => !a.bio || !a.genres || a.genres.length === 0
    );

    for (const artist of candidates) {
      await ctx.runMutation(internal.enrichment.queueEnrichmentJobs, {
        targetType: "artist",
        targetId: artist._id,
        targetName: artist.name,
        steps: ["gemini_grounding"],
        priority: "low",
      });
    }

    return { queued: candidates.length };
  },
});
