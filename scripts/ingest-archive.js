#!/usr/bin/env node
// Bulk ingest Rhythm Lab Radio playlists from markdown archive
// Usage: node scripts/ingest-archive.js /path/to/archive/

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONVEX_HOST = 'keen-pika-956.convex.cloud';
const ARCHIVE_DIR = process.argv[2];

if (!ARCHIVE_DIR) {
  console.error('Usage: node scripts/ingest-archive.js /path/to/archive/');
  process.exit(1);
}

function callConvex(apiPath, fnPath, args) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ path: fnPath, args });
    const options = {
      hostname: CONVEX_HOST,
      path: apiPath,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function parsePlaylistMd(content, filename) {
  const lines = content.split('\n');
  const tracks = [];

  // Try to extract a date from filename (e.g., "4-24-15.md", "7-17-20.md", "11-27-15 Jazz Special.md")
  const dateMatch = filename.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  let airDate = null;
  if (dateMatch) {
    let [, month, day, year] = dateMatch;
    if (year.length === 2) {
      year = parseInt(year) > 50 ? '19' + year : '20' + year;
    }
    airDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Extract title from first line or filename
  let title = filename.replace('.md', '');
  if (lines[0] && (lines[0].startsWith('# ') || lines[0].match(/^\d{1,2}-\d{1,2}-\d{2,4}/))) {
    title = lines[0].replace(/^#\s*/, '').trim();
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '-break-' || trimmed.startsWith('**') || trimmed.startsWith('#')) continue;

    // Match: Artist - "Title" or Artist - "Title" feat. Guest
    // Also handle smart quotes
    const match = trimmed.match(/^(.+?)\s*[-–—]\s*["\u201c](.+?)["\u201d]\s*(feat\.?\s*.+)?$/i);
    if (match) {
      let trackTitle = match[2];
      if (match[3]) trackTitle += ' ' + match[3].trim();
      tracks.push({ title: trackTitle, artistName: match[1].trim() });
      continue;
    }

    // Fallback: Artist - Title (no quotes)
    const fallback = trimmed.match(/^(.+?)\s*[-–—]\s+(.+)$/);
    if (fallback && !trimmed.includes('http') && fallback[1].length > 1 && fallback[2].length > 1) {
      tracks.push({ title: fallback[2].trim().replace(/^[""]|[""]$/g, ''), artistName: fallback[1].trim() });
    }
  }

  if (tracks.length === 0) return null;

  const slug = 'rhythm-lab-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  return {
    title: 'Rhythm Lab Radio - ' + title,
    slug,
    airDate: airDate || '2020-01-01', // fallback date
    sourceType: 'manual',
    tracks,
  };
}

async function main() {
  const files = fs.readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.md'));
  console.log(`Found ${files.length} markdown files`);

  let ingested = 0;
  let skipped = 0;
  let failed = 0;
  let totalTracks = 0;

  // Process in batches of 5 to avoid overwhelming the API
  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5);
    const promises = batch.map(async (file) => {
      try {
        const content = fs.readFileSync(path.join(ARCHIVE_DIR, file), 'utf-8');
        const episode = parsePlaylistMd(content, file);

        if (!episode || episode.tracks.length < 3) {
          skipped++;
          return;
        }

        const result = await callConvex('/api/mutation', 'ingest:ingestEpisode', episode);

        if (result.status === 'success') {
          const val = result.value;
          if (val.status === 'already_exists') {
            skipped++;
          } else {
            ingested++;
            totalTracks += val.trackCount || episode.tracks.length;
          }
        } else {
          failed++;
          console.error(`  FAIL: ${file} — ${JSON.stringify(result).substring(0, 100)}`);
        }
      } catch (err) {
        failed++;
        console.error(`  ERROR: ${file} — ${err.message}`);
      }
    });

    await Promise.all(promises);

    if ((i + 5) % 50 === 0 || i + 5 >= files.length) {
      console.log(`Progress: ${Math.min(i + 5, files.length)}/${files.length} files — ${ingested} ingested, ${skipped} skipped, ${failed} failed, ${totalTracks} tracks`);
    }
  }

  console.log(`\nDone! ${ingested} episodes ingested, ${totalTracks} tracks, ${skipped} skipped, ${failed} failed`);
}

main().catch(console.error);
