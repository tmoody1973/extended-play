// convex/crons.ts
// Scheduled jobs for background enrichment processing

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Fast pipeline: free APIs (images, metadata, IDs)
// 25 jobs × 5 concurrent × every 5s = ~300 jobs/min
crons.interval(
  "process enrichment queue",
  { seconds: 5 },
  internal.enrichment.processEnrichmentQueue,
  { batchSize: 25 }
);

// Slow pipeline: paid APIs (Gemini, Exa/Tavily corpus seeding)
// 3 jobs sequential × every 30s = ~6 jobs/min (respects rate limits)
crons.interval(
  "process corpus queue",
  { seconds: 30 },
  internal.enrichment.processCorpusQueue,
  { batchSize: 3 }
);

export default crons;
