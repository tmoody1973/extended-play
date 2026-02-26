// convex/crons.ts
// Scheduled jobs for background enrichment processing

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Process enrichment queue every 30 seconds
crons.interval(
  "process enrichment queue",
  { seconds: 30 },
  internal.enrichment.processEnrichmentQueue,
  { batchSize: 5 } // Conservative batch to respect API rate limits
);

export default crons;
