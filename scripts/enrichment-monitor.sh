#!/bin/bash
# Enrichment pipeline monitor — run with: bash scripts/enrichment-monitor.sh
# Polls every 30s, shows per-step breakdown + artist progress

INTERVAL=${1:-30}

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Extended Play — Enrichment Pipeline Monitor            ║"
echo "║  Polling every ${INTERVAL}s  (Ctrl+C to stop)                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

while true; do
  RESULT=$(npx convex run queries:getEnrichmentMonitor '{}' 2>/dev/null)

  if [ $? -ne 0 ]; then
    echo "⚠  Query failed — retrying..."
    sleep "$INTERVAL"
    continue
  fi

  TIMESTAMP=$(date '+%H:%M:%S')

  # Parse with node for nice formatting
  echo "$RESULT" | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    const p = data.pipeline;
    const a = data.artists;

    console.log('─────────────────────────────────────────────────────');
    console.log('  ' + '$TIMESTAMP' + '  Pipeline: ' + p.queued + ' queued | ' + p.running + ' running | ' + p.failed + ' failed');
    console.log('');

    // Artist progress bar
    const total = a.stubs + a.identified + a.metadata + a.images + a.sonic + a.complete;
    const done = a.identified + a.metadata + a.images + a.sonic + a.complete;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar = '█'.repeat(Math.floor(pct / 2.5)) + '░'.repeat(40 - Math.floor(pct / 2.5));
    console.log('  Artists: [' + bar + '] ' + pct + '% (' + done + '/' + total + ')');
    console.log('    stub: ' + a.stubs + ' | identified: ' + a.identified + ' | metadata: ' + a.metadata + ' | images: ' + a.images + ' | sonic: ' + a.sonic + ' | complete: ' + a.complete);
    console.log('');

    // Step breakdown (only non-zero)
    const steps = data.steps;
    const stepNames = Object.keys(steps);
    if (stepNames.length > 0) {
      console.log('  Step Breakdown:');
      for (const s of stepNames) {
        const c = steps[s];
        const parts = [];
        if (c.queued) parts.push(c.queued + ' queued');
        if (c.running) parts.push(c.running + ' running');
        if (c.failed) parts.push(c.failed + ' FAILED');
        console.log('    ' + s.padEnd(24) + parts.join(' | '));
      }
    }

    // Failed samples
    if (data.failedSample.length > 0) {
      console.log('');
      console.log('  ⚠ Failed Jobs:');
      for (const f of data.failedSample) {
        console.log('    ' + f.step + ' — ' + f.name + ': ' + (f.error || 'unknown'));
      }
    }
    console.log('');
  "

  sleep "$INTERVAL"
done
