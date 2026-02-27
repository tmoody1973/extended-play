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
