# The Director's Cut — Final Hackathon Experience Polish

> **Goal:** Transform Extended Play from a functional prototype into a cinematic music discovery experience that maximizes hackathon scores in Live Agents (40% Multimodal UX) and Creative Storyteller (30% Demo) categories.

> **Deadline:** March 16, 2026 @ 5:00pm PDT (~24 hours)

> **Constraint:** No new tools, no new Convex mutations, no graph rewrite. Polish what exists.

---

## Design Decisions

### Core Insight

70% of the judging score is on EXPERIENCE (40% Multimodal UX + 30% Demo), not code. We don't need new features — we need existing features to feel like a show, not a dashboard.

### What We're Building

**1. Story Stream Glow-Up**

Three tiers of card presence:

| Tier | Card Type | Treatment |
|------|-----------|-----------|
| Hero | Scene images, artist cards with photos | Full-width, bleed to edges, big visuals, overlay text |
| Supporting | Evidence quotes, narration | Bordered, typographic emphasis, amber accent on pull quotes |
| Ambient | Activity indicators, metadata | Subtle, inline, doesn't break the flow |

- Entrance animations via Framer Motion — cards slide up and fade in with staggered timing
- Typing effect on narration cards — text reveals progressively
- Better spacing and visual rhythm between cards

**2. Guided First Experience**

Replace the plain "click anywhere" welcome overlay:

1. App loads → auto-connects to agent WebSocket
2. Cinematic welcome overlay with title + subtle animation
3. User clicks → overlay fades → curator greets by voice
4. Three clickable prompt suggestion cards appear in stream:
   - "Walk me through an episode"
   - "Surprise me"
   - Text input for artist name

**3. Agent Prompt — Director Sequencing**

Upgrade system prompt to choreograph narrative beats:

1. NARRATE — 1-2 sentences setting the scene (voice)
2. SHOW — call explore_artist or generate_scene_image
3. EVIDENCE — call search_reviews to ground the claim
4. CONNECT — call get_connections to reveal the path
5. LISTEN — pause for user reaction

Add "surprise me" flow — agent picks a non-obvious bridge artist and narrates a mini-documentary.

**4. Subtle Depth Effects (CSS only)**

- Parallax perspective on graph container
- Ambient glow/gradient behind graph
- Framer Motion layoutId transitions

### What We're NOT Doing

- No Three.js / 3D graph rewrite
- No new tools or Convex mutations
- No new card types
- No audio player changes
- No graph rendering changes
- No new agent architecture

### Implementation Priority

| Priority | Change | Est. Time | Impact |
|----------|--------|-----------|--------|
| 1 | Agent prompt upgrade (director sequencing + surprise flow) | 1h | Transforms conversation feel |
| 2 | Story stream card redesign (hero images, typography, spacing) | 3h | Makes stream look premium |
| 3 | Entrance animations (Framer Motion on cards) | 1.5h | Adds polish and pacing |
| 4 | Guided welcome flow (auto-connect + curator greeting + prompt cards) | 2h | Nails demo opening |
| 5 | Deploy + test full flows | 1.5h | Must work on deployed URL |

**Total: ~9 hours with buffer**
