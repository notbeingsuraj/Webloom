# Brag Plan: Webloom

## What is this app?

Webloom is an AI-native platform that turns a single Google Maps business URL into researched business intelligence — verified identity, Brand DNA, an opportunity score — and a generated website for that business.

## The angle

A deadpan **2016 Series A launch video**: full press-release typography, "ANNOUNCING" energy, logo-wall gravitas — all deployed on top of one input field. The joke is the mismatch: the most overproduced launch format in startup history, applied verbatim to "paste a Google Maps URL." The Series A is expressed entirely through *form* (announce cadence, giant kinetic type, faux-logo wall built from the real pipeline strip, tiny legal-disclaimer gag) — **no invented funding figures, user counts, or company claims**, per the grounding law.

## Hook (first 2-3 seconds)

Letterspaced `ANNOUNCING` eyebrow over black, then the real dashboard headline slams in on the beat: **"Turn local businesses into intelligence."** Earned by delivering it with total 2016 sincerity.

## Key moments (the middle)

- The Analyse page rebuilt exactly: the URL field types out `https://maps.google.com/place/...` with real keystrokes, cursor clicks **Analyse Business**, button flips to **Analysing...**.
- The 7-stage "Analysis status" checklist ticking through one line per beat — Reading business location → Resolving business identity → … → Calculating opportunity score — colored stage dots, check + strike-through as each completes.
- The opportunity score ring (conic-gradient, real UI) counting up on the lead workspace card.

## Outro / punchline

Logo lockup (gradient `W` tile + Webloom) under the real README tagline, with a tiny 2016-style disclaimer: "Launch video shot before the website finished building. This can take a minute."

## User flow worth showing

Paste Google Maps URL → watch the intelligence pipeline run its 7 stages → lead workspace with opportunity score + generated website. The centerpiece scenes (2-4) are the working app, not landing-page copy.

## Tone

- Preset: `yc-parody`
- Creative direction: "fake Series A launch from 2016" (user-provided — preserved verbatim in brief)
- Interpretation: structured, earnest delivery of absurd launch-video gravitas; hard cuts, press-release typography, restrained SFX (2-4 cues), the joke never winks. Music warm and business-y, never ironic.

## Format: landscape — 1920x1080
## Duration: 21s

## Visual identity (from the project)

- Background: `#0F111A` (dark token `hsl(226 28% 8%)`; index.html theme-color `#09090B`)
- Accent (primary blue): `hsl(217 91% 62%)` ≈ `#468AF6`
- Secondary accents (real semantic palette): AI violet `#9C6CEF`, creative pink `#EE77A6`, verified green `#34D399`, opportunity orange `#FB923C`, warning amber `#FBBF24`
- Text: `hsl(220 25% 96%)` ≈ `#F2F4F7`; muted `hsl(223 12% 62%)`
- Display font: **Sora**; Body font: **Inter** (Google Fonts link in `index.html`)
- Strongest visual element: the blue→violet→pink gradient `W` tile and the conic-gradient opportunity score ring; second: the mesh card surfaces (`wl-card wl-mesh`) and colored pipeline dots.

## Share copy (draft)

We built Webloom to solve one problem, completely seriously: a Google Maps URL should turn into a researched, scored, branded website. Paste the URL — it resolves the business, builds the Business DNA, scores the opportunity, and generates the site. Yes, the launch video is from 2016.

## Audio direction

- Role: warm corporate bed with sparse professional accents
- Music: `happy-beats-business-moves-vol-11-by-ende-dot-app.mp3` (114.84 BPM, warm/business-y — preset recommended for `yc-parody`)
- Music treatment: start 0.0s at volume 0.30, 0.4s fade-in, fade out over the final 1.2s under the logo lockup
- Music cue guidance: preset at `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-11-by-ende-dot-app.music-cues.json`
  - Strong-cue locks: **1.60s** headline slam, **12.65s** transition into the score reveal, **17.91s** cut to outro/logo
  - Beat-grid: 7 checklist steps snap to consecutive beats from **7.91s** (7.91, 8.44, 8.96, 9.50, 10.01, 10.54, 11.06) — each line stays on screen, so the last holds ≥1.5s
  - Button click at 5.80s (strong cue) as a small-alignment moment, not a major lock
  - Restraint note: `yc-parody` — no more than 3 strong-cue locks, quiet cues, nothing ironic
- Audio-reactive treatment: subtle; radial background mesh and score-ring glow breathe with bass/treble. No waveform, equalizer, or particle visuals.
- SFX posture: sparse — randomized keyboard keys during URL typing, one mouse click on Analyse Business, light drop on checklist first/last item only, one soft bell on the score landing
- Audio-coupled moments: URL typing (keystroke SFX), button click at 5.80s, 7-step beat-grid sequence, score count-up, final logo
- Restraint rule: audio must never undercut the deadpan delivery — no comedic stings, no extra hits during the checklist middle

## Storyboard

### Scene 1 — Announce card — 3.7s
Near-black bg with subtle blue/violet radial mesh. `ANNOUNCING` letterspaced eyebrow fades up (0.3s). Headline **"Turn local businesses into intelligence."** slams in at 1.60s (beat-locked), 6 words, holds to scene end (≥2.1s settled). Small `Webloom` wordmark + gradient `W` tile pops bottom-center at 2.9s.
Sequential/interaction: yes — eyebrow, then headline slam, then logo tile, staggered.
Audio intent: confident, sincere launch energy; music carries it.
Audio-coupled idea: headline slam lands on the strong cue at 1.60s.
Music: vol-11 bed.
Transition mood: hard → Scene 2

### Scene 2 — One field, one button — 4.2s
Recreation of the real Analyse page card: eyebrow `Analysis`, input with MapPin icon, hint "Paste a Google Maps link for any business". The URL **types out character by character** 3.8–5.6s (randomized keypress SFX), cursor moves to **Analyse Business** and clicks at 5.80s (mouse click SFX); button flips to spinner `Analysing...` and holds. Sidebar-style line "Start with a Google Maps URL" sits beside it.
Sequential/interaction: yes — typing, then simulated cursor click.
Audio intent: dry and procedural — the launch video treats pasting a URL like a moonshot.
Audio-coupled idea: per-character typing ticks; click at the strong cue 5.80s.
Music: vol-11 bed continues.
Transition mood: hard → Scene 3

### Scene 3 — The intelligence pipeline — 4.75s
Recreation of the "Analysis status" panel: `Running the intelligence pipeline` status line with pulsing dot, then all 7 steps resolve one per beat from 7.91s, each with its real color dot (blue, violet, pink, orange, green, amber, blue), green check + strike-through as complete, `Complete` sub-label. Every line stays on screen; last line lands 11.06s and holds to 12.65s (≥1.5s settled).
Sequential/interaction: yes — 7 steps one by one on the beat grid.
Audio intent: ticking, inevitable, slightly too serious for a checklist.
Audio-coupled idea: beat-grid sequence — light drop SFX on step 1 and step 7 only (accent first/last).
Music: vol-11 bed continues.
Transition mood: hard, beat-locked at 12.65s → Scene 4

### Scene 4 — The score — 5.25s
Lead workspace header card: eyebrow `Lead workspace`, business name **"Local business"** (the app's own fallback label — fictional stand-in, no real business), category chip, then the **opportunity score ring** counts up 0 → 78 with `Opportunity` label and `78/100` (fictional demo lead — stated stand-in). Below: real workflow line "Business analysis → DNA → score → website → outreach", then a `Website ready` chip with a mini generated-site card.
Sequential/interaction: yes — ring count-up, then workflow stages, then website card.
Audio intent: payoff — one soft bell when the ring lands, then let the bed breathe.
Audio-coupled idea: count-up ticks with the bed; soft `impactBell_heavy_000` at the ring landing.
Music: vol-11 bed continues.
Transition mood: clean crossfade → Scene 5

### Scene 5 — Logo lockup — 3.05s
Gradient `W` tile scales in with `Webloom` wordmark (18.1s), README tagline underneath: **"Research a real business. Understand its brand. Generate its website."** (9 words, holds ≥2.7s). Tiny disclaimer fades in at the bottom: "Launch video shot before the website finished building. This can take a minute." Music fades out under it.
Sequential/interaction: yes — tile, then wordmark, then tagline, then disclaimer.
Audio intent: warm landing; the joke lands quietly.
Audio-coupled idea: final soft logo accent at 17.91s (natural timing held for readability).
Music: vol-11 bed, fade-out over final 1.2s.
(No transition — end card)

**Music mood for this video:** warm, business-y, earnest (yc-parody bed)
**Audio summary:** One continuous warm corporate bed at low volume, three beat-locked reveals, one typing sequence, one click, one checklist rhythm, one bell — restrained enough to keep the deadpan delivery intact.

---

## Step 1 rubric (9 questions)

1. **What is the app?** Webloom converts a Google Maps business URL into researched business intelligence and a generated website.
2. **Funniest/most impressive claim?** "Turn local businesses into intelligence." — the fact that one URL input drives a seven-stage pipeline ending in a shipped website.
3. **Visual hook?** The blue→violet→pink gradient `W` tile and the conic-gradient opportunity score ring on a near-black mesh card.
4. **What to show from actual UI?** The Analyse page (URL field, Analyse Business button, Analysis status checklist) and the Lead workspace score chip.
5. **Shortest satisfying video?** 21 seconds — enough for announce → input → pipeline → score → logo.
6. **Tone?** Preset `yc-parody`; direction "fake Series A launch from 2016" (user-provided, preserved).
7. **Audio feel?** Warm corporate bed (vol-11) with sparse dry accents; typing ticks, one click, a 7-step beat rhythm, one bell.
8. **Share caption?** "We built Webloom to solve one problem, completely seriously: a Google Maps URL should turn into a researched, scored, branded website." (+1-2 supporting lines in share-copy.txt).
9. **User flow?** Paste Google Maps URL → intelligence pipeline runs 7 stages → lead workspace with score + generated website.
