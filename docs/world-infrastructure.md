# MAGNET V2 world infrastructure

Task 005A expands the arena from 4,800 × 3,200 to 15,360 × 10,000 world units, exactly ten times the area. The comparison baseline is `main` at `a8c395c60cc5e5b6014fffe1becd00408a9abbb7`. The player starts at (7,680, 5,000). The existing 460-unit movement speed, player and bot radii, growth up to 4×, magnetic reach and camera smoothing and mass zoom apply across the larger arena.

## Shared region management

`src/regions.ts` partitions the arena into 16 columns and 11 rows of 960-unit regions. This size aligns with the 80-unit grid and 480-unit reference marks. The bottom row is 400 units tall. IDs use row-major order, including at partial edges. Each loaded full region has 43 logical scrap sites at the Task 004 reference density. Each region in the partial row has 18. The world seed, stable site ID, refresh epoch and collection revision determine a site's position and color. The order in which different regions are first loaded has no effect on their sites.

A site is a logical record that may hold one of the pool's reusable slots. There are 1,500 allocated slots and 720 active at stable simulation checkpoints. Waking a site binds a slot and advances its generation. A piece dragged over a region line keeps the same resource ID and generation. When an offscreen site sleeps, it keeps the piece's last coordinates and color while its region is cached. Returning quickly lets those sites wake at the saved coordinates. A real collection advances the site's revision and generates a new position in its original region. The attraction resolver still determines the winner using the signed surface gap and stable participant IDs. Only the accepted collection pays, in a batch, at +1 mass. Slot relocation has no payout or visual effect.

### Selection and replenishment

- All five magnets contribute one interest each. A site is scored by its nearest interest. The camera supplies another score using squared distance to the view plus the square of 620 world units. The camera score prefetches the route around the player while allowing distant bots to retain resources of their own. Overlapping interests use the same sites and pool.
- A plan runs about every 0.2 seconds, or when available reserves run out. It ranks the 176 region bounds and loads enough nearby candidates to fill the open budget, seeking 160 more offers as a reserve. The search gathers these offers independently of existing unprotected slots. Equal ranks use site IDs. Live unprotected sites get a 160-unit distance preference to reduce churn.
- A live piece within the view plus 160 units, or within any pull field plus 160 units, stays active. The next frame's visible piece bounds are therefore protected. Ordinary activations require clearance of the current view by 32 units plus the piece radius, and they exclude every magnet's current reach and contact radius. A regular pickup can use a safe reserve candidate without replanning.
- If an unusually large view leaves too few buffered sites, the planner checks offscreen sites using just the piece radius. If the view consumes all legal offscreen choices, the fallback stages a field-safe piece in view to keep the budget exact. The full-world viewport test exercises this conflict. All five benchmark seeds and the browser travel runs used zero visible fallbacks.
- The cache holds at most 80 regions and 3,440 site records. A dormant entry expires after 30 seconds without activity. At capacity, the oldest unused dormant entry can evict earlier, with stable region ID tie-breaking. Eviction increments the region's entry in a fixed 176-element epoch table, making refresh reproducible. Active sites and regions involved in the current plan are protected. Theme changes redraw art and leave sites intact. Viewport changes update interest and culling.

At the old average of 46.875 pieces per million units², 720 pieces can supply 15.36 million units² at once. The new map has 153.6 million units². Uniformly spreading the budget would yield 4.6875 pieces per million units². The shared interest rule concentrates the budget where magnets can reach it and near the player's next view. A stationary camera can show the local effects of depletion. An instantaneous jump into a far area would also skip the offscreen prefetch that normal travel receives. The separated fixture below gives the new positions one plan of prefetch before moving the camera.

### Simulation order

`ArenaModel.step` validates the delta, lets the bots choose or continue routes from the current active scrap, moves all five magnets and resolves attraction and batched mass. Growth re-clamps positions at their physical radius. The scene then advances the camera with the current player mass, calls `ArenaModel.replenish` with its new bounds and renders the reconciled state. Streaming occurs after claims for the step have been resolved, so new bindings enter attraction on the following step. The renderer-independent benchmark and tests use the same phase order.

## Navigation, boundaries and rendering

The bot anchors translate by (+5,280, +3,400). Copper starts around (8,340, 4,920), Spark around (6,260, 5,940), Drift around (9,090, 4,010) and Orbit around (6,340, 4,230). Existing seeded jitter keeps the opening spawns separated and Copper stays the nearest competitor. Copper and Spark build the same 240-unit density cells from live slots only when a decision needs them. A decision clears only previously occupied cells and searches at most seven by seven candidate cells around the bot, using the existing 720-unit radius, scoring, 2.3-second decisions and 1.5-second commitment. Drift and Orbit keep their seeded waypoint policy and use the expanded world limits.

The arena floor uses one Phaser Graphics object and clips grid dots and reference marks to a rectangle around the current view. Its limits snap outward to 240-unit increments and clamp to the arena, so it reuses the geometry during small pans. Whole reference marks use the original world coordinates across cache changes. Theme changes invalidate the rectangle's colors. The border stroke is gone. The camera still constrains its view to the world, and the matching background covers the canvas. The simulation still clamps growing player and bot centers by physical radius. Scrap and live pickup glints draw only when they intersect the view, through the existing bounded graphics and effect buffers.

## Density measurements

The Task 004 baseline was captured before changing the simulation. `npm exec -- tsx scripts/measure-world.ts --json` repeats five seeds at 30 Hz (`2026`, `3881`, `912`, `1549`, `6021`). These numbers use an identical sampler on the baseline and updated code. Each pair gives median piece centers in 800 × 800 and 1,200 × 1,200 world-unit windows. Windows shift inward at an edge to keep their area. Travel uses a 36-second center-relative route, including revisits. The clustered and separated fixtures start in forced locations and run for 24 seconds. Corner arrival samples the last two seconds of real diagonal travel from the spawn and the first second in the corner. Time to that corner differs by map size. Bot samples at that checkpoint are around the bots' actual positions.

| Scenario and checkpoint | Player baseline → 005A | Collectors baseline → 005A | Roamers baseline → 005A |
| --- | --- | --- | --- |
| Opening | 26 / 63 → 30 / 69 | 27.5 / 65.5 → 25 / 65 | 30 / 64 → 25.5 / 61.5 |
| Ordinary travel | 21 / 54 → 24 / 58 | 23 / 55 → 26 / 63 | 22 / 56 → 26 / 63 |
| Late route and return | 16 / 51 → 25 / 61.5 | 19 / 48.5 → 25.5 / 64 | 13 / 36.5 → 24.5 / 61 |
| Clustered start, idle player | 14 / 39.5 → 14 / 44.5 | 26.5 / 62 → 26 / 63 | 20.5 / 53 → 25 / 61.5 |
| Separated edge starts after prefetch | 33 / 64 → 29 / 64 | 27.5 / 61.5 → 28 / 64.5 | 33.5 / 72.5 → 28 / 64 |
| Separated, 24-second samples | 23 / 63 → 29 / 66 | 26 / 62 → 26 / 64 | 22 / 56.5 → 26 / 62 |
| Corner arrival | 23 / 53 → 23 / 59 | 23 / 53.5 → 25 / 63.5 | 23.5 / 61 → 25 / 61 |

Opening, ordinary travel and corner arrival stayed inside the proposed ±20% band for all three cohorts. Late-route medians rose above the band as local replenishment supplied areas the baseline depleted. The clustered Roamer and separated player 800-unit medians were also above the band by 22% and 26%, respectively. Wide windows stayed close between versions in both fixtures. Overlap uses the same shared site layout as independent travel. These are scripted counts. How the changes feel during a round remains a playtest question.

## Competition and mass progression

`npm exec -- tsx scripts/measure-competition.ts --json` follows five timed 60-second routes at 30 Hz. The updated script offsets each original world target by (+5,280, +3,400) and keeps the distances and timing. Solo and five-magnet runs start with the same seeded scrap within each version. The world generator and bot paths differ between versions, so pickup changes include the effects of route and resource availability.

| Seed | Solo player pickups baseline → 005A | Five-magnet pickups baseline → 005A | First bot in desktop / portrait view, baseline → 005A (s) |
| --- | ---: | --- | --- |
| 2026 | 252 → 254 | 279 / 535 / 581 / 280 / 398 → 256 / 513 / 526 / 412 / 433 | 4.70 / 3.90 → 0.40 / 0.67 |
| 3881 | 252 → 238 | 196 / 505 / 488 / 421 / 243 → 261 / 506 / 488 / 426 / 440 | 1.53 / 1.57 → 1.53 / 1.70 |
| 912 | 168 → 170 | 160 / 545 / 570 / 229 / 377 → 186 / 499 / 551 / 405 / 414 | 0.50 / 0.77 → 25.90 / 13.87 |
| 1549 | 166 → 170 | 93 / 576 / 489 / 255 / 388 → 157 / 485 / 473 / 405 / 354 | 1.57 / 1.87 → 0.93 / 1.77 |
| 6021 | 160 → 165 | 116 / 447 / 511 / 386 / 265 → 166 / 536 / 535 / 419 / 469 | 1.83 / 2.17 → 3.70 / 2.17 |

The participant order is player, Copper, Spark, Drift, Orbit. Each starts at mass 20. Median mass in the five-magnet runs progressed as follows.

| Time | Baseline | 005A |
| ---: | --- | --- |
| 10 s | 50 / 93 / 95 / 70 / 68 | 47 / 90 / 98 / 79 / 76 |
| 20 s | 60 / 175 / 182 / 133 / 124 | 75 / 168 / 176 / 141 / 140 |
| 40 s | 121 / 349 / 361 / 202 / 274 | 147 / 341 / 352 / 275 / 292 |
| 60 s | 180 / 555 / 531 / 300 / 397 | 206 / 526 / 546 / 432 / 453 |

All four bots moved throughout the measured minutes. Collectors still led in median mass and Roamers gained more with fresh territory. First appearance was a median 1.53 s on desktop and 1.77 s in portrait, with the delayed seed 912 encounter shown above. The baseline recorded 16 contested pickups on these routes and the expansion recorded zero. These runs provide sparse overlap evidence. The deterministic cross-region and shared arbitration tests exercise simultaneous claims directly.

## Simulation performance

On Node 22.23.5, the observed range of per-run 95th percentiles across the moving and fixture runs was 0.036–0.334 ms for baseline simulation and 0.046–0.208 ms for 005A simulation. Measured replenishment increased from 0.001–0.008 ms to 0.511–0.992 ms, measured separately from camera and simulation. These short CPU measurements vary by run and include JIT warmup. The 36-second seed 2026 route logged 173 plans, 7,684 slot activations including startup, 5,827 streaming deactivations, 1,137 actual collections and 82 cache evictions. Across all 25 runs the peak was 80 cached regions and 3,440 logical sites. Each steady-state sample had 720 active of 1,500 allocated slots, with zero duplicate activations and zero visible fallbacks.

## Browser verification

Playwright drove the production build in Chromium 156 on a Linux Xeon Platinum 8573C host. The desktop run used normal mouse steering to travel 3,402 units east, reverse and revisit three regions, then head south. It crossed six distinct regions, encountered Copper, and logged offscreen pickups by all four bots. The player grew from mass 20 to 80. Across 1,048 frames, streaming produced zero visible activations or removals. Separate near-wall fixtures steered by mouse into all four walls, with exact center clamping at the current radius. The sampled outer bands showed the theme background and existing floor geometry without a permanent outline or blank strip. The magnet's drawn rim and halo can clip at contact where the art extends beyond the physical radius. Resizing the desktop viewport from 1,040 × 740 to 1,320 × 540 kept the camera at the legal bottom edge.

The emulated phone used 390 × 844 portrait and 844 × 390 landscape at DPR 3. A continuous floating-joystick drag crossed four regions, switched themes with a second finger and stopped on release. Rotation during a fresh drag reset the joystick and bots kept moving. A landscape tap reached its projected world target. Across 498 monitored frames, streaming produced zero visible activations or removals. The landscape overlap fixture showed all four competitors and 28 scrap pieces. A separate SwiftShader WebGL smoke test crossed a region, collected scrap and switched to dark mode.

The eight-second software Canvas profiles used continuous real input and autonomous bots. Timings below are p95 with the observed maximum in parentheses, in milliseconds. Scene timing includes simulation and preparation of the floor and scrap graphics. Canvas renderer timing measures the renderer's CPU call. The frame interval includes scheduling and rendering.

| View | Observed fps | Frame interval | Scene update | Simulation | Streaming | Floor preparation | Canvas render |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop, DPR 1.5 | 59.9 | 16.7 (33.4) | 1.3 (3.1) | 0.3 (1.6) | 1.0 (2.8) | <0.1 (0.2) | 0.6 (2.2) |
| Portrait emulation, DPR 3 | 59.8 | 16.8 (33.3) | 1.8 (5.7) | 0.3 (2.2) | 1.2 (5.1) | <0.1 (0.8) | 0.7 (5.5) |
| Landscape emulation at 4× scale, DPR 3 | 59.8 | 16.8 (33.4) | 1.7 (5.8) | 0.2 (1.9) | 1.4 (4.6) | 0.1 (1.0) | 0.8 (7.5) |

The portrait and landscape rows are isolated reruns. An end-to-end pass recorded 133 ms frame intervals in both phone modes, including a 124 ms Canvas render call in portrait. The isolated reruns each recorded two intervals over 20 ms and zero over 33.5 ms. Streaming stayed below 5.2 ms in these phone profiles. After forced garbage collection, the isolated runs changed JavaScript heap by +320 KiB in portrait and −23 KiB in landscape. These short captures measure the cloud browser. Actual mobile GPU, thermals and long-session frame pacing require physical devices.

## Local verification

- `npm ci` passed on Node 22.23.5.
- `npm test` passed 79 of 79 tests. Coverage includes corner travel, live and dormant resource identity, stale generations, reentry, all five localities and offscreen bot collection.
- `npm run typecheck` passed with zero TypeScript errors.
- `npm run build` passed. Vite reported the same 500 kB chunk-size warning on both versions. The JavaScript bundle was 1,232.58 kB (341.55 kB gzip) on the baseline and 1,238.48 kB (343.47 kB gzip) on 005A.
- Both seeded benchmark commands and `actionlint` passed.

## Physical-phone playtest before merge

1. Travel continuously for a minute in portrait and landscape, reversing direction to revisit an area. Look at the lead edge for visible scrap changes unrelated to collection. Note depleted patches, dense clumps or hitches.
2. Find Copper early, take a different route in a fresh round and pay attention to how long you go between encounters. Compare player and bot growth in both shared and quieter routes.
3. Use tap-to-move, steer continuously with the floating joystick and toggle both themes with a second finger. Rotate while dragging and verify that touch releases and a fresh drag still work.
4. Reach each edge at small and larger sizes. Keep moving diagonally against a wall and check the magnet's heading, corner pickups, grid and background all the way to the edge.
5. Record the phone, browser, orientation, any repeated frame drops and the routes that produce them. Test Safari on an iPhone and Chrome on Android when hardware is available.
