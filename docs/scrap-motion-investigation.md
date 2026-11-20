# Scrap motion and rendering investigation

Task 006A started from `main` at `387503692a410fc1ab0111f893376f1c19521077`, the requested Task 005B merge. The diagnostic implementation is `1e7a387e92ed9baff721cd5c27639720c63d05f7` on `fix/scrap-motion-diagnostics-v2`. [Baseline CI](https://github.com/avladila/magnet-arena-v2/actions/runs/44765527241) · [Diagnostic commit](https://github.com/avladila/magnet-arena-v2/commit/1e7a387e92ed9baff721cd5c27639720c63d05f7)

**The reported software streak was not reproduced.** In the isolated frames, ordinary scrap occupied only the current square. Camera following moved pieces on screen while their world coordinates stayed fixed. A separate stationary-camera test confirmed that attraction moves pieces in world space. The pickup test demonstrated a third effect, a short expanding ring that can overlap a neighboring square. These findings explain measurable motion and overlap. Which effect the player saw as a tail remains unresolved.

## Reproduction

The harness starts a loopback Vite server and selects Canvas or WebGL, fixes the seed at 2026 and allows the test to step the game at a fixed interval. This development-server transform and the framebuffer recorder are confined to `scripts/scrap-motion`. The normal production build is byte-for-byte identical to the baseline build.

Run the following from the repository after `npm ci`, with Chromium installed. The Playwright dependency lives in a temporary directory.

```sh
scrap_tools=$(mktemp -d)
npm install --prefix "$scrap_tools" --no-save playwright-core@1.65.1
SCRAP_PLAYWRIGHT_MODULE="$scrap_tools/node_modules/playwright-core" \
  CHROMIUM_EXECUTABLE=/usr/bin/chromium \
  SCRAP_OUTPUT_DIR=/tmp/magnet-scrap-motion \
  node scripts/scrap-motion/run.mjs
```

`report.json` and the per-configuration `measurements.json` contain world and CSS screen coordinates, camera centers and zooms, player velocity, per-step displacement, draw dimensions and command counts, glint counts, renderer information and timings. PNGs are saved alongside them. Use `SCRAP_CASE=desktop-1` to reproduce the illustrated probes or `SCRAP_PROFILE=0` to run the fixed-step checks without the live profiles. [Runner](../scripts/scrap-motion/run.mjs) · [Fixtures](../scripts/scrap-motion/fixture.ts)

For the isolated probes, the harness hides the floor and magnet art and reads the framebuffer against a uniform theme background. It reads the full motion path within each capture window, including the former locations of the square. A pixel counts as changed if any RGB channel differs from the background by more than two values. The expected coverage has a one-backing-pixel margin for sampling and antialiasing. Each probe also checks that removing the square or expiring the ring restores the background. The full-scene cases retain the production floor, magnets, halo, attraction, glints, camera and streaming. They check per-frame commands and use individual frame captures to inspect the composite.

## Coverage

Every row ran on Chromium 156 with both Canvas and ANGLE SwiftShader WebGL. The portrait and landscape rows use mobile viewport emulation at the listed DPR. Fixed simulation rates and the real-time profiler are separate measurements.

| Configuration | CSS viewport | DPR | Fixed steps | Theme | Reduced motion | Starting mass |
| --- | --- | ---: | ---: | --- | --- | ---: |
| `desktop-1` | 1280×800 | 1 | 60 Hz | Light | Off | 20 |
| `desktop-2` | 1280×800 | 2 | 30 Hz | Dark | On | 400 |
| `portrait-2` | 390×844 | 2 | 60 Hz | Dark | Off | 2,000 |
| `portrait-3` | 390×844 | 3 | 120 Hz | Light | On | 4,352, at the 12× cap |
| `landscape-1` | 844×390 | 1 | 120 Hz | Dark | On | 400 |
| `landscape-3` | 844×390 | 3 | 30 Hz | Light | Off | 4,352, at the 12× cap |

| Scenario | Observation |
| --- | --- |
| A · Static camera and scrap | The outside-field piece held its world and screen coordinates. Its raster coverage remained stable. |
| B · Moving camera, fixed world scrap | Steering and camera following translated the square on screen. Its world position stayed fixed and its previous positions returned to the background. |
| C · Fixed camera, moving scrap | The attraction integrator moved the piece toward the stationary magnet. The first pull frames contained a square at each current position. |
| D · Camera and scrap moving | The full scene steered, turned and stopped. The tracked piece moved before collection and a fixed piece still drifted on screen briefly after the player stopped as the camera settled. Each render drew the expected number of active, viewport-eligible pieces. |
| E · Pickup effects | Two squares became a neighboring square and a pickup ring. With the neighbor hidden, the ring remained on its own at 110 ms. The probe was clear at 230 ms. |
| F · Larger magnets | All four starting masses passed the isolated and full-scene checks. At 12× and phone zoom 0.248, a 7-unit square projects to about 1.74 CSS px. The represented shape stayed square. |

Across the 12 configurations, 548 ordinary-scrap frames had zero detected pixels outside the expected bounds. There were 632 isolated frames in total, including cleanup and glint controls, plus 840 full-scene frames. Canvas and WebGL produced identical world, camera and screen coordinate traces at matched settings. Draw-command counts tracked visible piece counts regardless of movement. Full-scene runs kept 720 active slots and reported zero duplicate activations.

## Measured motion and captures

| Case | World position or change | CSS screen x and displacement |
| --- | --- | --- |
| A · Desktop at 60 Hz | (7,728, 5,182), fixed | 692.80, fixed |
| B · Desktop at 60 Hz | (8,004, 5,182), fixed. Camera moved 114.62 world units right. | 751.44 → 625.36 over 250 ms. First step moved −8.37 px. |
| C · Desktop at 60 Hz | x 7,794.00 → 7,744.01. Camera stayed fixed. | 765.40 → 710.41 over 116.7 ms. |
| B · 12× portrait at 120 Hz | (8,004, 5,614.53), fixed | 220.57 → 192.16 over 250 ms. First step moved −0.94 px. |
| C · 12× portrait at 120 Hz | x 8,226.53 → 8,185.59. Camera stayed fixed. | 330.51 → 320.36 over 116.7 ms. |

The desktop square's predicted width was 7.70 CSS px at zoom 1.10. For B at DPR 1, Canvas covered 8–9 by 9 backing pixels and WebGL covered 8–9 by 8. That small change in edge coverage follows fractional pixel placement. Neither capture showed a displaced copy. At 110 ms, the desktop glint alone covered about 22 × 22 backing pixels. It is visually larger than the ordinary square and stays centered on the pickup. [Consecutive camera and pull frames](assets/scrap-motion/camera-and-pull.png) · [Pickup overlap and expiry](assets/scrap-motion/pickup-glint.png) · [Full scene at giant portrait zoom](assets/scrap-motion/giant-portrait.png)

## Rendering path and interpretation

- `ParticleView.render` clears its ordinary graphics before drawing one 7 × 7 rectangle with one 3 × 2 highlight per eligible slot. Each visible piece contributes 16 entries to the graphics command buffer. Culling uses the view bounds and the physical scrap radius. Ordinary commands do not retain a previous position. [Particle renderer](../src/particle-view.ts)
- `ArenaScene.update` applies movement and collection first, then uses the new camera bounds for replenishment and rendering. `ArenaCamera.toScreen` projects `world − camera center` with uniform zoom. The Phaser camera uses a matching zoom per backing axis to account for DPR. The floor uses the same camera and world-anchored geometry. Production uses Phaser `AUTO`, with per-frame clear enabled, preserved drawing buffer disabled and default antialiasing. The CSS displays the sized canvas without a blur filter. [Scene and camera](../src/main.ts) · [Projection](../src/view.ts) · [Floor](../src/art.ts)
- The attraction step moves a selected active slot toward its winning magnet. Collection ends that lifetime before respawn, generations guard stale claims, and normal streaming protects positions inside the view. The one-frame drawing count matches the slot set and retains no prior slot position. [Attraction](../src/attraction.ts) · [Slot ownership](../src/particles.ts) · [Region streaming](../src/regions.ts)
- Collection events feed a separate graphics layer at depth 1. It clears before redrawing up to 20 rings and their lifetime is 0.22 seconds. Each ring expands from radius 5 toward 13 while fading. The light and dark palettes supply both scrap and glint colors. The growing magnet's halo and milestone pulse are separate from this effect. [Scrap and glints](../src/particle-view.ts) · [Themes](../src/theme.ts) · [Growth feedback](../src/growth-feedback.ts)

Successive compact squares at high contrast can produce a motion impression, particularly when the camera moves a square by more than its width in one step or the frame interval is uneven. The captured positions support this explanation. The screenshots do not identify the user's perception. Browser compositor presentation and physical-display persistence remain possible contributors. An actual phone comparison is required to distinguish them.

## Live frame pacing

The profiles used eight seconds of continuous steering and normal collection in the instrumented scene without framebuffer readbacks. The host was a Linux Xeon Platinum 8573C. Numbers are p95 with maximum in parentheses, in milliseconds. Renderer CPU timing spans the Phaser clear, scene draw and submission calls. It does not measure asynchronous graphics completion or display time. Visible pieces are median and peak.

| Renderer and view | FPS | Frame interval | Renderer CPU | Scrap prep CPU | Visible pieces | Player pickups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Canvas desktop DPR 1 | 58.3 | 16.8 (116.6) | 0.8 (3.3) | 0.2 (0.9) | 37 / 46 | 47 |
| Canvas giant portrait DPR 3 | 59.5 | 16.8 (50.0) | 1.3 (9.2) | 0.1 (1.6) | 182 / 213 | 236 |
| Canvas giant landscape DPR 3 | 59.9 | 16.8 (33.3) | 1.1 (4.9) | 0.1 (1.8) | 146 / 228 | 225 |
| SwiftShader WebGL desktop DPR 1 | 17.2 | 99.9 (133.3) | 11.5 (29.2) | 0.3 (5.1) | 39 / 46 | 19 |
| SwiftShader WebGL giant portrait DPR 3 | 6.3 | 183.4 (333.3) | 10.7 (48.7) | 0.4 (2.7) | 149 / 172 | 51 |
| SwiftShader WebGL giant landscape DPR 3 | 6.2 | 316.7 (333.3) | 14.8 (67.7) | 0.5 (1.9) | 200 / 228 | 51 |

The scene retained nine Graphics objects in all six profiles. Canvas logged 29–41 minor garbage collections and up to one major collection per run, with a longest event of 3.26 ms. Software WebGL logged 72–94 minor events and zero major events, with a longest event of 9.80 ms. The difference between forced-GC snapshots ranged from +861 to +1,075 KiB on Canvas and −445 to +1,699 KiB on WebGL. These snapshots include the instrumentation and resource caches. CPU timings and the trace did not isolate the observed frame stalls to ordinary scrap. Native GPU performance and physical-phone frame pacing remain unmeasured.

## Verification and recommendation

- `npm ci`, `npm test` (**94 passed, zero failed**), `npm run typecheck`, `npm run build` and `actionlint` passed. Vite retained the existing chunk-size warning. The archived base build and this branch's build were byte-identical.
- `npm exec -- tsx scripts/measure-competition.ts --json`, `npm exec -- tsx scripts/measure-world.ts --json` and `npm exec -- tsx scripts/measure-growth.ts --json` passed. The 10, 25 and 13 runs, respectively, matched the base simulation results apart from timing measurements.
- `node scripts/scrap-motion/run.mjs` passed all 12 browser configurations and the six live profiles. The two added Node tests cover world position and dimensions during camera travel, per-frame clear and culling, and the glint buffer, recoloring and expiry. Existing tests cover theme changes, reduced motion, deterministic streaming and single-owner collection.

Keep the current production rendering. For the next visual decision, repeat the same straight sweep, turn and stop on the phone where the effect was reported. Pair an on-device screen recording with slow-motion footage of the physical display. Record the browser, refresh rate, orientation, theme and approximate magnet size, and compare a pass outside attraction with a pickup-heavy pass. If pickup overlap obscures scrap, evaluate a subtler pickup-only cue first. If the effect follows ordinary movement with clear recorded frames, use the physical-device comparison to decide whether it calls for any visual change.

Draft PR creation and hosted CI lookup require a GitHub connection with API access. [Open a draft PR against `main`](https://github.com/avladila/magnet-arena-v2/compare/main...fix/scrap-motion-diagnostics-v2?expand=1) · [Branch CI workflow](https://github.com/avladila/magnet-arena-v2/actions/workflows/ci.yml?query=branch%3Afix%2Fscrap-motion-diagnostics-v2)
