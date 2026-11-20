# Giant magnet growth

Task 005B uses the Task 005A merge on `main` at `48032b1bf46c10571d7419cc0ae26c65c0bccece`. The implementation commit is `42afd2633b8d73924f95c92bdd64ce33ca4568c1` on `feat/giant-growth-v2`. [Base commit](https://github.com/avladila/magnet-arena-v2/commit/48032b1bf46c10571d7419cc0ae26c65c0bccece) · [Implementation commit](https://github.com/avladila/magnet-arena-v2/commit/42afd2633b8d73924f95c92bdd64ce33ca4568c1)

Review targets `main`. The cloud proxy returns HTTP 403 for the GitHub API, so PR publication and the hosted CI result require GitHub access. [Open the pull request](https://github.com/avladila/magnet-arena-v2/compare/main...feat/giant-growth-v2?expand=1) · [Branch CI workflow](https://github.com/avladila/magnet-arena-v2/actions/workflows/ci.yml?query=branch%3Afeat%2Fgiant-growth-v2)

## Experimental tuning

The player and all four bots start at mass 20. The shared scale is `min(12, 1 + 0.8 × (sqrt(mass / 20) − 1))`, and the physical radius is `30 × scale`. The coefficient increases early gains from the 005A value of 0.32. The square root reduces each additional unit of radius gained per pickup, and the cap is reached continuously at mass 4,351.25, or at 4,352 with one-mass pickups. These values are centralized in `src/config.ts` for playtesting. Motion remains 460 world units per second and each ordinary pickup still adds one mass.

Through 4× scale, the center-based reach remains `min(230, 118 × sqrt(scale))`. Above 4× it is `30 × scale + 110 × sqrt(scale / 4)`. The 110-unit margin comes from the original 230-unit reach minus the 120-unit radius at 4×, so the two curves meet at 230. At 12×, the field reaches 550.53 units and extends 185.53 units past the 365-unit scrap contact threshold. The furthest legal corner scrap is `sqrt(2) × (360 − 5)`, or 502.05 units from the nearest giant center. The existing pull integrator still runs from 300 to 700 units per second. Contact, ownership, batched mass and radius-based clamping use the same authoritative geometry for all five magnets.

### Camera and visible footprint

The existing 120-mass transition, exponents of −0.075 and −0.17, and 0.58 minimum multiplier still produce the mass-based zoom. Target zoom takes the lesser of that zoom and `0.70 × shorter viewport side / field diameter`. The arena coverage floor applies last, so the view stays inside the arena even if an extreme aspect ratio needs a larger zoom. The target is continuous and uses the existing exponential smoothing and screen-to-world projection. At ordinary desktop and phone sizes the field constraint leaves early framing in place. At the cap the field spans 70% of the shorter side and the body spans about 46%.

The player backing and each bot accent rim set the outer artwork radius to 30 before visual scaling. Their familiar colors, horseshoe shapes and shadows remain, with the shadows drawn inside the physical circle. Rendering uses the existing eased scale. The player halo eases toward actual reach and stays at least one scrap radius clear of the body. The 50, 100, 200 and 400 pulses start outside the body and obey reduced motion. Bot labels retain a constant CSS size, prefer space above the body and try below when the first spot is blocked. They yield to bodies and existing labels when both positions are occupied.

### Before and after at the same mass

World radii and reach are in units. The last three columns are the settled radius of the visible player rim in CSS pixels. The 005A pale rim was 33 units at 1×, and the 005B rim is 30. The values use the respective art radii and camera zooms. The opening zooms remain 1.10 on desktop and 0.65 on both phone layouts. At the cap they are 0.509, 0.203 and 0.248 respectively.

| Mass | World radius 005A → 005B | 005B scale | 005B reach | Desktop 1280×800 | Portrait 320×680 | Landscape 844×390 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 30.0 → 30.0 | 1.00× | 118.0 | 36.3 → 33.0 | 21.5 → 19.5 | 21.5 → 19.5 |
| 100 | 41.9 → 59.7 | 1.99× | 166.4 | 44.9 → 58.2 | 26.5 → 34.4 | 26.5 → 34.4 |
| 400 | 63.3 → 113.3 | 3.78× | 229.4 | 54.6 → 88.8 | 32.3 → 52.5 | 32.3 → 52.5 |
| 800 | 81.1 → 157.8 | 5.26× | 283.9 | 62.2 → 109.9 | 36.7 → 62.2 | 36.7 → 64.9 |
| 2,000 | 116.4 → 246.0 | 8.20× | 403.5 | 81.7 → 156.9 | 48.3 → 68.3 | 48.3 → 83.2 |
| 4,000 | 120.0 → 345.4 | 11.51× | 532.0 | 84.2 → 181.8 | 49.8 → 72.7 | 49.8 → 88.6 |
| 4,352 | 120.0 → 360.0 | 12.00× | 550.5 | 84.2 → 183.1 | 49.8 → 73.2 | 49.8 → 89.3 |

## Seeded simulations

`npm exec -- tsx scripts/measure-competition.ts --json` and `npm exec -- tsx scripts/measure-world.ts --json` ran before implementation and were repeated on 005B. `npm exec -- tsx scripts/measure-growth.ts --json` adds camera samples, per-minute pickup, mass, radius and screen-diameter changes, milestone times, field and streaming checks, and timing. The same growth sampler ran against an archive of the base sources. The longer runs use a 320 × 680 camera and report projected radii for the normalized, eased body. The 005A player rim would read 10% larger on that projection. Values for bots use the player's zoom and can change as the player camera zooms, even after a bot reaches its own physical cap.

### Five 60-second competition routes

Five-magnet results are in player, Copper, Spark, Drift, Orbit order. Each starts at mass 20.

| Seed | Solo player pickups 005A → 005B | Five-magnet pickups 005A → 005B |
| ---: | ---: | --- |
| 2026 | 254 → 330 | 256 / 513 / 526 / 412 / 433 → 328 / 678 / 735 / 511 / 603 |
| 3881 | 238 → 291 | 261 / 506 / 488 / 426 / 440 → 317 / 716 / 676 / 570 / 564 |
| 912 | 170 → 203 | 186 / 499 / 551 / 405 / 414 → 223 / 676 / 773 / 539 / 546 |
| 1549 | 170 → 212 | 157 / 485 / 473 / 405 / 354 → 207 / 683 / 644 / 568 / 483 |
| 6021 | 165 → 208 | 166 / 536 / 535 / 419 / 469 → 207 / 653 / 735 / 556 / 582 |

Median competitive mass at 60 seconds went from 206 / 526 / 546 / 432 / 453 to 243 / 698 / 755 / 576 / 584. Median 005B scales were 2.99× / 4.93× / 5.12× / 4.49× / 4.53×. The same routes logged four contested pickups on 005B and zero on the baseline. The larger field makes every magnet more productive, and the Collectors still lead these routes. The existing route, steering and payout code drives both strategies.

### Longer runs and step sensitivity

Simulation events and milestone times are deterministic at a fixed seed, input and step rate. At different step rates, waypoint arrival and bot replanning can fall on different steps, as can batched claims. The 60 Hz comparison shows the solo and competing sweep seed 2026, a short repeated square on seed 3881, a perimeter run from an opening mass of 2,000 on seed 912, and one ten-minute sweep on seed 1549.

| Scenario | 005A pickups at 60 Hz | 005B pickups at 60 Hz | 005B player pickups at 30 / 60 / 120 Hz |
| --- | --- | --- | --- |
| Fresh lanes, 180 s, solo | 1,530 | 2,666 | 2,673 / 2,666 / 2,661 |
| Fresh lanes, 180 s, competing | 1,602 / 1,874 / 1,868 / 1,484 / 1,639 | 2,747 / 3,047 / 3,305 / 2,623 / 2,588 | 2,791 / 2,747 / 2,731 |
| Sparse revisits, 120 s | 22 / 1,220 / 1,047 / 877 / 903 | 31 / 1,808 / 1,749 / 1,302 / 1,460 | 34 / 31 / 34 |
| Grown at the perimeter, 115 s | 946 / 1,535 / 1,519 / 1,253 / 1,120 | 1,855 / 3,086 / 3,096 / 2,765 / 2,544 | 2,036 / 1,855 / 1,929 |
| Ten-minute lanes | 5,984 / 7,294 / 7,064 / 6,014 / 5,934 | 12,058 / 15,869 / 15,878 / 13,791 / 13,563 | 60 Hz only |

On the ten-minute 005B run, the player reached 2× at 11.95 s, 4× at 48.05 s, 8× at 143.53 s and 12× at 262.03 s. The five cap times were **262.03 / 215.67 / 217.78 / 246.10 / 256.23 seconds**. The same route reached the 005A 4× cap at 235.47 / 196.65 / 207.30 / 239.20 / 249.32 seconds. On the grown perimeter fixture, all four bots reached 12× between 84.93 and 107.98 seconds across the three rates. The player was at 11.31–11.56× when the 115-second case ended.

| Minute in the ten-minute route | Player pickups and mass gain 005A → 005B | Player radius gained 005A → 005B | Player screen diameter gained 005A → 005B, CSS px |
| ---: | ---: | ---: | ---: |
| 1 | 442 → 596 | 36.5 → 109.2 | 21.2 → 80.9 |
| 2 | 544 → 860 | 21.9 → 73.0 | 9.9 → 12.8 |
| 3 | 589 → 1,099 | 17.6 → 66.1 | 10.0 → 7.2 |
| 4 | 593 → 1,238 | 13.9 → 59.1 | 10.5 → 5.0 |
| 5 | 644 → 1,444 | 0 → 22.6 | 0 → 1.6 |
| 6 | 631 → 1,420 | 0 → 0 | 0 → 0 |

The ten-minute player gained physical radius more slowly each minute even as pickup rate rose through minute five. Other runs show that diminishing returns per mass still allow faster gains during some intervals. At 30 Hz on the fresh competitive route, minute two to three went from 75.21 to 75.37 units of player radius per minute. In the 60 Hz grown perimeter run, the player's radius gain rate rose from 48.15 to 49.15 units per minute between the first minute and the final 55 seconds. Orbit's rate on the 60 Hz fresh competitive route rose from 69.61 to 71.91 units per minute in minutes two and three. The perimeter player totals varied by about 10% between rates and contested pickups ranged from 2 to 182 as bot paths diverged. The stationary attraction tests verify that splitting a pull into shorter steps gives the same result.

## Shared scrap and density

The arena remains 15,360 × 10,000 with one 720-active, 1,500-slot pool, the same site density and the same replanning and cache timings. The region planner already excludes each magnet's current reach and uses that reach plus its existing retention buffer. The wider field therefore affects the positions eligible for activation through the same rules. The post-growth tests and sampler check every rebound slot against all five current fields and compare visible slot generations before and after replenishment. Existing floor culling covers the wider view with the same cache.

Each pair is the median number of scrap centers in fixed 800 × 800 and 1,200 × 1,200 world-unit windows. Five seeds supply the original and updated samples.

| Scenario | Player 005A → 005B | Collectors 005A → 005B | Roamers 005A → 005B |
| --- | --- | --- | --- |
| Opening | 30/69 → 30/69 | 25/65 → 25/65 | 25.5/61.5 → 25.5/61.5 |
| Ordinary travel | 24/58 → 23/57 | 26/63 → 25/63 | 26/63 → 25/62 |
| Return | 25/61.5 → 23/58 | 25.5/64 → 24/62 | 24.5/61 → 22/60 |
| Clustered and idle player | 14/44.5 → 13/43 | 26/63 → 25/63 | 25/61.5 → 24/60.5 |
| Separated edge starts | 29/64 → 29/64 | 28/64.5 → 28/64.5 | 28/64 → 28/64 |
| Separated edge travel | 29/66 → 29/66 | 26/64 → 25/63 | 26/62 → 24/62 |
| Corner arrival | 23/59 → 20/54 | 25/63.5 → 23/64 | 25/61 → 23.5/63 |

The 25 original world runs retained 720 active of 1,500 on every checked step on both versions. They peaked at 80 cached regions and 3,440 site records. Both versions logged zero duplicate or visible fallback activations. Total slot activations increased from 109,780 to 115,749, with genuine collections increasing from 15,513 to 19,206.

Each version of the growth sampler checked 160,950 frames across 13 runs. The 005B case logged zero new visible slot bindings, zero activations in a participant field and zero duplicate activations. Cache and slot budgets stayed within the same limits. The ten-minute run logged 15,033 / 15,361 / 13,227 / 12,734 offscreen pickups for the four bots. Its median 1,200-unit window count around the player fell from 55 to 23 while the player collected roughly twice as much. In the high-mass perimeter case at 60 Hz, the equivalent count fell from 58 to 29. Long giant runs can clear nearby visible scrap more quickly even though opening supply stays steady.

## Local verification and performance

- Node 22.23.5 passed `npm ci`, `npm test` (**92 passed, 0 failed**), `npm run typecheck` and `npm run build`. Vite retained the existing 500 kB chunk-size warning. JavaScript built to 1,238.91 kB, or 343.62 kB gzipped.
- Both existing benchmark commands and the new growth benchmark completed. `actionlint` passed.
- Across the growth runs, model p95 ranged from 0.013–0.059 ms on 005A to 0.026–0.112 ms on 005B. Streaming p95 ranged from 0.002–0.490 ms to 0.002–0.652 ms. These are ranges of per-run measurements on the cloud Linux host. The number of plans per second remained 4.43–4.90. Slot activations, including collections, ranged from about 102–243/s before and 112–346/s after.

Playwright tested the production build in Chromium 156. The desktop player reached mass 33 through ordinary pickups while its rendered radius grew from 33 to 38.8 CSS px. With a max-scale fixture, mouse steering slid the giant along the right wall at exactly x = 15,000. Pixel analysis measured a 183 px rim radius in both Canvas and SwiftShader WebGL and the floor reached the world edge. SwiftShader needed a longer wait for the giant fixture to settle. In 320 × 680 portrait and 844 × 390 landscape at DPR 3, the visible giant radius was about 73 and 89 CSS px. A floating joystick drag traveled 2,219 units across four regions, a second finger toggled the theme, and release and orientation changes stopped the drag. A landscape tap reached its projected world destination. Visible bot labels cleared the player and one another. The reduced-motion fixture suppressed the mass-50 pulse while the halo remained visible. Monitoring across desktop Canvas, desktop WebGL and mobile travel covered 735 frames with zero visible streaming changes.

The following eight-second software Canvas profiles used continuous joystick movement at 12× with all four bots also at their cap. All four bots were visible at times. Values are p95, with the maximum in parentheses, in milliseconds. Scene timing includes preparation of graphics. The renderer column measures the CPU call to Canvas.

| Emulated viewport | fps | Frame interval | Scene update | Model | Streaming | Floor | Halo | Canvas render |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 320 × 680 portrait | 59.8 | 16.8 (33.3) | 1.2 (4.0) | 0.2 (1.6) | 0.8 (3.1) | 0.1 (0.5) | 0.1 (0.3) | 1.3 (3.8) |
| 844 × 390 landscape | 60.0 | 16.7 (16.8) | 1.0 (5.9) | 0.2 (1.7) | 0.7 (5.6) | 0.1 (0.5) | 0.1 (0.2) | 0.8 (2.5) |

The post-GC JavaScript heap increased by +407 KiB in portrait and +466 KiB in landscape during the short runs. Both profiles kept 720 pieces active and recorded zero frame intervals over 33.5 ms. Physical-device GPU performance, thermals and prolonged frame pacing still need measurement.

## Remaining playtest questions

- The 12× cap arrived at 4:22 for the player on the ten-minute route. Mass kept rising after the visible size plateau, so the desired time to cap and the reward of continued collection need player feedback.
- Copper and Spark reached the cap about 44–46 seconds before the player on that route. In the sparse revisit, the player collected only 31 pieces in two minutes at 60 Hz while the Collectors collected 1,808 and 1,749. The size gap on routes with little fresh scrap warrants an explicit fairness check before approving the values.
- Giant magnets cover more of the screen near smaller magnets and can occupy the same space. Crowded labels use the existing collision checks and temporarily disappear when safe positions are occupied. Verify that the player stays easy to identify when giants pass through its position.

### Physical-phone checklist before merge

1. Start fresh rounds on a physical phone and compare the body with the floor markings and bots at masses 20, 100, 400, 800, 2,000, 4,000 and the cap. Record when the visible growth is rewarding and when it feels finished.
2. Play both a fresh route and a short retraced route for several minutes. Record player and bot masses, time to reach representative sizes and the cap, and whether Collector size or cleared patches make recovery feel unlikely.
3. In portrait and landscape, steer a giant by touch, use tap-to-move, toggle both themes during play and rotate while dragging. Check that touch release, the HUD and names remain legible and predictable.
4. Guide the giant along walls and into all corners. Look for body clipping, heading jumps, empty strips and scrap that fails to pull from the corner.
5. Enable reduced motion and confirm that the existing milestone pulses are suppressed. Record phone model, browser, orientation and repeated frame drops or heating during sustained giant play.
