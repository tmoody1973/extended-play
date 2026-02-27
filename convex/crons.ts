// convex/crons.ts
// Scheduled jobs for background enrichment processing

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Process enrichment queue every 15 seconds
crons.interval(
  "process enrichment queue",
  { seconds: 15 },
  internal.enrichment.processEnrichmentQueue,
  { batchSize: 10 } // Moderate batch — respects MusicBrainz 1req/s, Discogs 60/min
);

export default crons;
