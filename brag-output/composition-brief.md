# Hyperframes Composition Brief: Webloom

## Objective
Create a short launch-style brag video for Webloom — a deadpan 2016 Series A launch video whose full press-release gravitas is aimed at one input field.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 21 seconds

## Source Material
- Project root: `/Users/surajkumar/Desktop/Webloom`
- Primary files read: `README.md`, `apps/web/index.html`, `apps/web/src/index.css`, `apps/web/tailwind.config.js`, `apps/web/src/App.tsx`, `apps/web/src/components/Layout.tsx`, `apps/web/src/components/Navbar.tsx`, `apps/web/src/pages/Dashboard.tsx`, `apps/web/src/pages/NewLead.tsx`, `apps/web/src/pages/LeadDetail.tsx`, `apps/web/src/pages/GeneratedSites.tsx`
- Product name: Webloom
- Tagline / strongest claim: "Research a real business. Understand its brand. Generate its website." (README) / "Turn local businesses into intelligence." (Dashboard headline)
- Key UI or visual moment to recreate: the Analyse page — URL field with MapPin icon typing out a Google Maps URL, cursor clicking **Analyse Business**, button flipping to **Analysing...** — followed by the "Analysis status" 7-step checklist resolving one line at a time, and the lead workspace's conic-gradient opportunity score ring.
- Copy that must appear verbatim:
  - ANNOUNCING *(tone word only — not a product claim)*
  - Turn local businesses into intelligence.
  - Webloom
  - Analysis
  - https://maps.google.com/place/...
  - Paste a Google Maps link for any business
  - Analyse Business → Analysing...
  - Start with a Google Maps URL
  - Running the intelligence pipeline
  - Reading business location
  - Resolving business identity
  - Gathering business information
  - Reconciling sources
  - Building Business DNA
  - Calculating opportunity score
  - Preparing analysis
  - Complete
  - Lead workspace
  - Local business
  - Opportunity
  - Business analysis → DNA → score → website → outreach
  - Website ready
  - Research a real business. Understand its brand. Generate its website.
  - Launch video shot before the website finished building. This can take a minute.

## Creative Direction
- Tone preset: `yc-parody`
- Creative direction: "fake Series A launch from 2016" (user-provided — preserve verbatim)
- Interpretation: 2016 launch-video sincerity — press-release typography, announce cadence, giant kinetic type, hard cuts, total seriousness. The joke lives in the form, never in winking copy. Restrained SFX (2-4 cues), no ironic stings, no chaotic energy.
- Angle: Full Series A launch gravitas deployed on a single input field. Express the "Series A" entirely through form — announce eyebrow, faux gravitas, tiny legal-disclaimer gag. **No invented funding figures, user counts, logos, or company claims** (grounding law): the faux "logo wall" moment, if used, must be built from the real pipeline strip copy (Discover sources · Extract intelligence · Validate evidence · Generate insights).
- Hook: `ANNOUNCING` eyebrow, then "Turn local businesses into intelligence." slamming in at 1.60s.
- Outro / punchline: logo lockup + README tagline + the tiny disclaimer "Launch video shot before the website finished building. This can take a minute."
- Avoid:
  - Generic SaaS language ("streamline your workflow" and anything the project never wrote)
  - Abstract filler visuals, color-wash scenes, particle fields
  - Unrelated visual redesign — the recreated UI must match the source design system

## Visual Identity
- Background: `#0F111A` (dark token `hsl(226 28% 8%)`); deepest black `#09090B` acceptable as vignette
- Text: `#F2F4F7` (`hsl(220 25% 96%)`); muted `hsl(223 12% 62%)`
- Accent: primary blue `hsl(217 91% 62%)` ≈ `#468AF6`; brand gradient blue → violet `#9C6CEF` → pink `#EE77A6` (the `W` tile: `from-primary via-ai to-creative`)
- Semantic dots (checklist, in order): `#3B82F6`, `#8B5CF6`, `#EC4899`, `#F97316`, `#10B981`, `#F59E0B`, `#3B82F6`
- Score ring: conic-gradient on `hsl(var(--primary))` over muted track
- Display font: **Sora**; Body font: **Inter** (project loads both from Google Fonts; prefer local font files if available, otherwise the project's own stylesheet link)
- Visual references from the project: gradient `W` tile, `wl-card wl-mesh` mesh card surfaces, colored pipeline dots, conic score ring, pill tabs, rounded-2xl cards with hairline borders

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Announce card — 3.7s — `ANNOUNCING` eyebrow, headline "Turn local businesses into intelligence." slams in beat-locked at 1.60s, Webloom tile pops at 2.9s
2. One field, one button — 4.2s — Analyse card: URL types out 3.8–5.6s, cursor clicks Analyse Business at 5.80s, flips to `Analysing...`
3. The intelligence pipeline — 4.75s — 7-step Analysis status checklist resolves one per beat from 7.91s (7.91/8.44/8.96/9.50/10.01/10.54/11.06), all lines stay on screen, last holds to 12.65s
4. The score — 5.25s — Lead workspace: "Local business" header, opportunity ring counts 0 → 78, workflow line, `Website ready` chip; cut at 17.91s
5. Logo lockup — 3.05s — gradient `W` tile + Webloom, README tagline (holds ≥2.7s), tiny disclaimer, music fades out

## Audio
- Audio role: warm bed with sparse professional accents
- Audio arc: continuous warm bed at 0.30, small lifts at the three locked reveals, fade out over the final 1.2s
- Music: `happy-beats-business-moves-vol-11-by-ende-dot-app.mp3` (copied into `composition/assets/music/`)
- Music treatment: start 0.0s, volume 0.30, 0.4s fade-in, 1.2s fade-out under the end card; never above 0.35
- Music cue guidance: bundled preset `assets/music/cues/happy-beats-business-moves-vol-11-by-ende-dot-app.music-cues.json` (copied into `composition/assets/music/cues/`); tempo 114.84 BPM. Strong-cue locks: **1.60s** headline slam, **12.65s** cut into the score scene, **17.91s** cut to logo. Beat-grid window for the checklist: 7.91 → 11.06s (consecutive beats, ±0.10s). Click at 5.80s is a small-alignment moment. Readability beats cues everywhere.
- Audio-reactive treatment: subtle; background radial mesh warmth and score-ring glow breathe with bass/treble. No waveform, equalizer, musical-note, or particle visuals. If extraction is unavailable, note it and skip — do not block the render.
- Audio-coupled moments:
  - URL typing — randomized `keyboard/keypress-*.wav` per character, 3.8–5.6s
  - Analyse Business click at 5.80s — `ui/mouseclick1`
  - Checklist sequence — light `interface/drop_*` on step 1 (7.91s) and step 7 (11.06s) only
  - Score ring landing (~14.3s) — soft `impact/impactBell_heavy_000` at restrained volume
  - Final logo at 17.91s — one quiet announcement accent
- SFX selection guidance: match motion exactly; low/medium high-frequency-risk files only; yc-parody restraint — total 4-6 SFX across the video, volumes 0.55–0.75
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md` (copied into `composition/assets/sfx/`)
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume based on the implemented animation.
- Audio files: music and selected SFX live in `composition/assets/` (already copied: music, cue preset, sfx-analysis, keyboard set, click/drop/bell candidates)

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project — scenes 2–4 are real UI recreations (Analyse form, Analysis status checklist, lead workspace score).
- Keep all text readable in the final render (short label ~0.8s settled; sentence ~0.3s/word).
- Keep the video within 15-25 seconds (planned: 21s).
- Include the planned music/SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints; ignore cues that hurt readability, scene pacing, or the product story. Major reveals may move toward nearby strong cues within ±0.15s; smaller entrances within ±0.10s; 3 strong-cue locks max.
- The 7 checklist lines are readable text — keep each line's fully-settled time ≥ its reading floor by holding completed lines on screen (they do not exit).
- Honor the music fade-in/out treatment.
- Consider the audio-reactive workflow for the background mesh and score ring; skip gracefully if extraction is unavailable.
- Use local assets for audio and any runtime/media dependencies when possible.
- Run `hyperframes check` before render — it is brag's single gate.
- Keep creation and rendering local. Remote or publishing workflows require a separate explicit user request.
