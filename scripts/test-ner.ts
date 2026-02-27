// Quick test for NER extraction logic
// Run: npx tsx scripts/test-ner.ts

// ── Copy of NER logic from enrichment.ts (pure functions, no Convex deps) ──

const NER_FALSE_POSITIVES = new Set([
  "The New York Times", "The Guardian", "The Wire", "Rolling Stone",
  "The Fader", "Pitchfork", "NPR", "BBC", "The Record", "Sound On Sound",
  "The Vinyl Factory", "Resident Advisor", "Bandcamp Daily",
  "Record Store Day", "Album Of The Year", "Song Of The Year",
  "Best New Music", "Record Of The Year", "Music Video",
  "Grammy Award", "Mercury Prize", "North America", "South America",
  "United States", "United Kingdom", "New York", "Los Angeles",
  "San Francisco", "New Orleans", "South London", "East London",
  "West Africa", "East Africa", "South Africa", "North Africa",
  "World Music", "Electronic Music", "Hip Hop", "Rhythm And Blues",
  "The Album", "The Song", "The Track", "The Record", "The Band",
  "The Group", "The Duo", "The Producer", "Last Year", "Next Year",
  "This Year", "First Album", "Second Album", "Third Album",
  "Best Songs", "Best Albums", "Best Tracks", "Best Music",
  "West African", "Could We Be Here", "Neo Soul",
  "The London", "The Berlin", "The Paris", "The Chicago",
]);

const CAPS_STOPWORDS = new Set([
  "THE", "AND", "FOR", "BUT", "NOT", "ALL", "HAS", "HAD", "HIS", "HER",
  "WAS", "ARE", "ITS", "OUR", "WHO", "HOW", "NEW", "OLD", "OWN", "OUT",
  "ONE", "TWO", "GET", "GOT", "CAN", "MAY", "USE", "WAY", "DAY", "MAN",
  "NOW", "RUN", "SET", "TRY", "TOP", "END", "BIG", "LET", "SAY",
  "NPR", "BBC", "DIY", "NYC", "USA", "LED", "NEO",
]);

const INFLUENCE_PHRASES = [
  /influenced\s+by/i,
  /in\s+the\s+(?:vein|tradition|spirit)\s+of/i,
  /sounds?\s+like/i,
  /owes?\s+(?:a\s+)?(?:debt|lot)\s+to/i,
  /following\s+in\s+the\s+footsteps?\s+of/i,
  /reminiscent\s+of/i,
  /echoes?\s+(?:of\s+)?/i,
  /channeling/i,
  /paying\s+(?:homage|tribute)\s+to/i,
  /inspired\s+by/i,
  /draws?\s+(?:from|on|inspiration)/i,
  /heirs?\s+(?:to|of)/i,
  /descendants?\s+of/i,
  /in\s+the\s+mold\s+of/i,
];

interface ArtistMention {
  name: string;
  isInfluenceContext: boolean;
  context?: string;
}

function extractArtistMentions(text: string, primaryArtistName: string): ArtistMention[] {
  const mentions: ArtistMention[] = [];
  const seenNames = new Set<string>();
  const primaryLower = primaryArtistName.toLowerCase();

  function addMention(name: string, isInfluenceContext: boolean, context: string) {
    const trimName = name.trim().replace(/'s$/, "");
    if (
      trimName.length >= 4 &&
      !NER_FALSE_POSITIVES.has(trimName) &&
      trimName.toLowerCase() !== primaryLower &&
      !seenNames.has(trimName.toLowerCase())
    ) {
      seenNames.add(trimName.toLowerCase());
      mentions.push({ name: trimName, isInfluenceContext, context });
    }
  }

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const isInfluenceContext = INFLUENCE_PHRASES.some((re) => re.test(trimmed));
    let match;

    // Pattern 1: Title Case names (2-5 words) with article connectors
    const titleCaseRegex = /\b((?:The\s+)?[A-Z][a-z]+(?:(?:\s+(?:of|the|de|van|von|del|la|el|al)\s+(?:the\s+)?[A-Z][a-z]+)|\s+[A-Z][a-z]+){1,4})\b/g;
    while ((match = titleCaseRegex.exec(trimmed)) !== null) {
      const ctx = trimmed.substring(
        Math.max(0, match.index - 50),
        Math.min(trimmed.length, match.index + match[1].length + 50)
      );
      addMention(match[1], isInfluenceContext, ctx);
    }

    // Pattern 2: ALL-CAPS words (3+ chars)
    const allCapsRegex = /\b([A-Z]{3,})\b/g;
    while ((match = allCapsRegex.exec(trimmed)) !== null) {
      const name = match[1];
      if (!CAPS_STOPWORDS.has(name)) {
        const ctx = trimmed.substring(
          Math.max(0, match.index - 50),
          Math.min(trimmed.length, match.index + name.length + 50)
        );
        addMention(name, isInfluenceContext, ctx);
      }
    }

    // Pattern 3: ALL-CAPS + Title Case — "DJ Shadow", "MF DOOM", "DJ Premier"
    const mixedRegex = /\b([A-Z]{2,3}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
    while ((match = mixedRegex.exec(trimmed)) !== null) {
      const ctx = trimmed.substring(
        Math.max(0, match.index - 50),
        Math.min(trimmed.length, match.index + match[1].length + 50)
      );
      addMention(match[1], isInfluenceContext, ctx);
    }
  }

  mentions.sort((a, b) => {
    if (a.isInfluenceContext && !b.isInfluenceContext) return -1;
    if (!a.isInfluenceContext && b.isInfluenceContext) return 1;
    return 0;
  });

  return mentions;
}

// ── Test Cases ──

console.log("=== NER Extraction Tests ===\n");

// Test 1: Pitchfork-style review with influence language
const test1 = `Kokoroko's debut full-length Could We Be Here is a warm, sprawling exploration of Afrobeat, jazz, and West African highlife. The London octet, led by trumpeter Sheila Maurice-Grey, sounds like a modern descendant of Fela Kuti's Africa 70, channeling the spirit of Tony Allen's polyrhythmic drumming while drawing from the lush arrangements of Mulatu Astatke. There are echoes of Ezra Collective and Sons of Kemet in the horn arrangements, and the quieter moments recall the introspection of Nubya Garcia. The album also owes a debt to Ebo Taylor and Pat Thomas, whose highlife innovations paved the way for this generation of UK jazz musicians.`;

const results1 = extractArtistMentions(test1, "Kokoroko");
console.log("Test 1: Kokoroko review (Pitchfork-style)");
console.log(`  Found ${results1.length} mentions`);
const expected1 = ["Fela Kuti", "Tony Allen", "Mulatu Astatke", "Ezra Collective", "Sons of Kemet", "Nubya Garcia", "Ebo Taylor", "Pat Thomas"];
for (const m of results1) {
  const isExpected = expected1.some(e => m.name.includes(e) || e.includes(m.name));
  console.log(`  ${m.isInfluenceContext ? "🔥" : "  "} ${m.name} ${isExpected ? "✅" : "⚠️"}`);
}
const found1 = expected1.filter(e => results1.some(m => m.name.includes(e) || e.includes(m.name)));
console.log(`  Coverage: ${found1.length}/${expected1.length} expected artists found`);
console.log(`  Missing: ${expected1.filter(e => !found1.includes(e)).join(", ") || "none"}`);
console.log();

// Test 2: ALL-CAPS artists
const test2 = `JPEGMAFIA's latest continues his tradition of abrasive, sample-heavy production. His sound is influenced by Death Grips and MF DOOM, with lyrical nods to DOOM's complex rhyme schemes. The production draws from Aphex Twin and Oneohtrix Point Never, while his confrontational delivery reminds listeners of Danny Brown.`;

const results2 = extractArtistMentions(test2, "JPEGMAFIA");
console.log("Test 2: JPEGMAFIA review (ALL-CAPS + mixed)");
console.log(`  Found ${results2.length} mentions`);
const expected2 = ["Death Grips", "MF DOOM", "DOOM", "Aphex Twin", "Oneohtrix Point Never", "Danny Brown"];
for (const m of results2) {
  const isExpected = expected2.some(e => m.name.includes(e) || e.includes(m.name));
  console.log(`  ${m.isInfluenceContext ? "🔥" : "  "} ${m.name} ${isExpected ? "✅" : "⚠️"}`);
}
const found2 = expected2.filter(e => results2.some(m => m.name.includes(e) || e.includes(m.name)));
console.log(`  Coverage: ${found2.length}/${expected2.length} expected artists found`);
console.log(`  Missing: ${expected2.filter(e => !found2.includes(e)).join(", ") || "none"}`);
console.log();

// Test 3: DJ Shadow / trip-hop
const test3 = `DJ Shadow's Endtroducing remains a landmark of sample-based music. Released in 1996, the album drew from an impossibly wide palette, from Björk to Metallica, from David Axelrod to Tangerine Dream. Shadow was inspired by the crate-digging ethos of DJ Premier and Pete Rock, and the ambient textures of Brian Eno. Critics noted similarities to Portishead and Massive Attack, placing Shadow firmly in the trip-hop canon alongside Tricky and Morcheeba.`;

const results3 = extractArtistMentions(test3, "DJ Shadow");
console.log("Test 3: DJ Shadow review (classic trip-hop)");
console.log(`  Found ${results3.length} mentions`);
const expected3 = ["David Axelrod", "Tangerine Dream", "DJ Premier", "Pete Rock", "Brian Eno", "Massive Attack"];
for (const m of results3) {
  const isExpected = expected3.some(e => m.name.includes(e) || e.includes(m.name));
  console.log(`  ${m.isInfluenceContext ? "🔥" : "  "} ${m.name} ${isExpected ? "✅" : "⚠️"}`);
}
const found3 = expected3.filter(e => results3.some(m => m.name.includes(e) || e.includes(m.name)));
console.log(`  Coverage: ${found3.length}/${expected3.length} expected artists found`);
console.log(`  Missing: ${expected3.filter(e => !found3.includes(e)).join(", ") || "none"}`);
console.log();

// Test 4: False positive resistance
const test4 = `The album was reviewed by The New York Times, The Guardian, and Pitchfork. It won the Grammy Award for Best New Music at the ceremony in Los Angeles. NPR called it Album Of The Year in their Best Songs of 2024 roundup from South London.`;

const results4 = extractArtistMentions(test4, "Test Artist");
console.log("Test 4: False positive resistance (publications, awards, places)");
console.log(`  Found ${results4.length} mentions (should be 0)`);
for (const m of results4) {
  console.log(`  ⚠️  FALSE POSITIVE: ${m.name}`);
}
console.log();

// Test 5: Wikipedia-style associated acts
const test5 = `Erykah Badu is an American singer, songwriter, and actress. Often referred to as the Queen of Neo Soul, she is influenced by Billie Holiday, Nina Simone, and Chaka Khan. Her collaborators include The Roots, Common, and Andre Benjamin of Outkast. Badu's music is reminiscent of Stevie Wonder and Marvin Gaye, with production that draws from J Dilla and Madlib.`;

const results5 = extractArtistMentions(test5, "Erykah Badu");
console.log("Test 5: Erykah Badu (Wikipedia-style)");
console.log(`  Found ${results5.length} mentions`);
const expected5 = ["Billie Holiday", "Nina Simone", "Chaka Khan", "The Roots", "Andre Benjamin", "Stevie Wonder", "Marvin Gaye"];
for (const m of results5) {
  const isExpected = expected5.some(e => m.name.includes(e) || e.includes(m.name));
  console.log(`  ${m.isInfluenceContext ? "🔥" : "  "} ${m.name} ${isExpected ? "✅" : "⚠️"}`);
}
const found5 = expected5.filter(e => results5.some(m => m.name.includes(e) || e.includes(m.name)));
console.log(`  Coverage: ${found5.length}/${expected5.length} expected artists found`);
console.log(`  Missing: ${expected5.filter(e => !found5.includes(e)).join(", ") || "none"}`);
console.log();

// Summary
const allFound = [...found1, ...found2, ...found3, ...found5];
const allExpected = [...expected1, ...expected2, ...expected3, ...expected5];
const falsePositives = results4.length;
const totalMentions = results1.length + results2.length + results3.length + results5.length;
const influenceCount = [...results1, ...results2, ...results3, ...results5].filter(m => m.isInfluenceContext).length;

console.log("=== Summary ===");
console.log(`Total mentions extracted: ${totalMentions}`);
console.log(`Influence-context mentions: ${influenceCount}`);
console.log(`Expected artist coverage: ${allFound.length}/${allExpected.length} (${Math.round(allFound.length/allExpected.length*100)}%)`);
console.log(`False positives in test 4: ${falsePositives}`);
console.log(`Pass: ${allFound.length >= 20 && falsePositives <= 2 ? "✅" : "❌"}`);
