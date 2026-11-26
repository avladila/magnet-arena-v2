# MAGNET RC2 verification

## Phase 0 · Audit

Base `318656d` from GitHub main. RC1 shipped playable competition and original art and audio. Gaps confirmed in the implementation:

- A–C. Four shell stages, runtime-drawn world objects, and no standalone logo exports. The prior title illustration looks like a separate 3D scene from the actual game.
- D–F. Six effects with separate music/effects settings, working selective vibration, and a tutorial that explains hazards in text. The music has usable rhythm but no shared sonic-logo definition.
- G–H. No committed browser suite, 30-minute soak or restart test. Existing balance evidence covers 36 runs.
- I–J. Vite places Phaser in the main chunk. Chromium has evidence. Firefox and WebKit remain unverified.

The old environment is legible but uses different materials and contrast from the title, and stage art lacks bilateral details. Preserve the model, pool and input rules while bringing the presentation under one palette.

## Changes by phase

| Phase | Files and evidence |
| --- | --- |
| 1 · Brand | `docs/brand.md`, `brand/tokens.json`, `src/brand.ts`, theme wiring and `tests/brand.test.ts`. [Baseline contact sheet](evidence/rc2/baseline.webp). |
| 2 · Safety net | `playwright.config.ts`, `e2e/game.spec.ts`, `tests/endurance.test.ts`. Initial Chromium suite passed three checks. The deterministic soak ran for 30 simulated minutes. |
| 3 · Art | `scripts/generate-brand-art.py`, the two atlas pairs, Pole Pair icons, social and hero images, locally licensed Open Sans, and `docs/assets.md`. [Atlases](evidence/rc2/atlas-contact.webp) · [Scale comparison](evidence/rc2/scale-contact.webp). |
| 4 · Effects | `src/workshop-particles.ts`, `src/particle-view.ts`, `src/growth-feedback.ts`, and the competition view. Pooled sprites use symmetric bursts; High adds pull streaks. The segmented field and readable hazard and theft telegraphs retain the same game geometry. |
| 5 · Audio and onboarding | `src/audio.ts`, `src/progress.ts`, `src/session-ui.ts`, `src/tutorial.ts`, the generated score, and Playwright training checks. Master volume governs the effects bus and music. Real contact at five stations advances training. |
| 6 · Balance | `src/competition-config.ts` and `scripts/simulate-matches.ts`. Normal route reconsideration moved from 2.85 to 3.65 seconds. No world, growth, input, combat, or payout constants changed. |
| 7 · Bundle | `vite.config.ts` and `src/result-stats.ts`. Phaser builds into a separate chunk and result statistics are loaded when play begins. This avoids a fetch after a five-minute match if a newer build removes old hashed assets. |
| 8 · Evidence | `docs/evidence/rc2/` contains source contact sheets, raw model results, and actual Chromium captures. |

## Matched-seed comparison

`MAGNET_TRIALS=126 npm exec -- tsx scripts/simulate-matches.ts` ran once before and once after the decision change. Each run covered 42 matches per difficulty, seven runs for each of six strategies. Bots' combat activity and tighter planning made Normal unusually strong in the sample. The longer decision interval tests whether slightly less frequent resource retargeting opens opportunities for the scripted player.

| Difficulty | Player wins before | Player wins after | Mean player rank before / after | Bot hits before / after |
| --- | ---: | ---: | ---: | ---: |
| Easy | 16/42 | 16/42 | 2.64 / 2.64 | 194 / 194 |
| Normal | 1/42 | 3/42 | 3.48 / 3.48 | 351 / 355 |
| Hard | 5/42 | 5/42 | 3.48 / 3.48 | 307 / 307 |

The result improved Normal's win count by two. Mean rank stayed flat, and Hard still had a higher scripted win rate than Normal. Treat the change as provisional pending human playtests. See [before](evidence/rc2/matches-before.jsonl) and [after](evidence/rc2/matches-after.jsonl).

## Verification and review

```sh
npm ci
npm test
npm run typecheck
npm run build
PW_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e -- --project=chromium --workers=1
npm run preview
```

- Baseline had 103 unit tests. The final suite adds five brand and endurance tests for 108 total. The 30-minute soak checks energy, legal bounds, the 1,500-slot pool, debris limits, and world mass plus detached and expired mass.
- Nine Chromium checks pass. Coverage includes nine viewport sizes in both themes, master mute after hide and resume, tutorial completion, one attack from two simultaneous pointers, accelerated complete Arena, and Endless results and replay. The 50-replay run retained one game canvas and 477,344 more bytes of JavaScript heap after forced collection. An instrumented saturation check reached exactly 600, 300 and 120 active decorative sprites for High, Balanced and Low, and cleared the pool in reduced motion.
- A frozen production build completed a real-time five-minute Chromium Arena match with an idle player, showed all result details, and restarted at 5:00 after Play Again. It placed fifth at 20 mass. The first attempt reached results but lost its lazy chunk during a concurrent rebuild. Loading the details at match start and using a frozen preview resolved this in the rerun.
- A split production build reduced application JavaScript from about 1,274 kB to about 80 kB. The 1,208 kB Phaser chunk still loads with gameplay and triggers Vite's size advisory. Result statistics add a lazy chunk below 1 kB.
- A headless Canvas sample in Chromium 156.0.8078.79 on three allocated AMD EPYC 9V74 CPUs recorded 714 animation callbacks over 12 seconds at 1366 × 768, with 16.7 ms median and p95. A second capture while build and verification activity overlapped recorded 672 callbacks, 16.7 ms median, and 33.3 ms p95. These are scheduler timings on the cloud host, without a physical-device GPU or thermal test.
- Playwright's Firefox and WebKit downloads returned HTTP 403 with `Domain forbidden` on the configured mirrors. On a machine with download access, run `npx playwright install --with-deps firefox webkit`, then `npm run test:e2e -- --project=firefox --project=webkit`.

[Title](evidence/rc2/title-light.jpg) · [Light arena](evidence/rc2/arena-light.jpg) · [Dark arena](evidence/rc2/arena-dark.jpg) · [Light portrait](evidence/rc2/portrait-light.jpg) · [Dark portrait](evidence/rc2/portrait-dark.jpg) · [Light landscape](evidence/rc2/landscape-light.jpg) · [Dark landscape](evidence/rc2/landscape-dark.jpg) · [Endless results](evidence/rc2/endless-results-dark.jpg) · [Arena results](evidence/rc2/arena-results.jpg).

## Open release gates

- The contact sheets show both themes, all atlas frames, and close and zoomed-out samples. A complete per-asset grayscale, squint, and silhouette signoff remains open. Some older styling still uses scoped legacy tokens, and not every presentation measurement comes from the shared grid and motion tokens.
- Mirrored victory confetti, bespoke heat shimmer, and richer landmark tile variants remain open. The runtime has pooled bursts and atlas-defined trails but does not implement every VFX variant in the brief.
- Test physical touch behavior separately. Rotate during a drag, move the attack thumb through and outside the override zone, release attack while steering, and watch for accidental pause touches or lost captures. Confirm settings and mute after hiding and reopening the tab. Play Arena and Endless long enough to assess thumb comfort, temperature, battery, and frame pacing.
