# MAGNET V2 release verification

## Repository

| Item | Value |
| --- | --- |
| Repository | `avladila/magnet-arena-v2` |
| Verified starting commit | `387503692a410fc1ab0111f893376f1c19521077`, confirmed against GitHub `main` |
| Implementation branch | `feat/magnet-v2-complete-game` |
| Implementation revision | Branch tip, printed by `git rev-parse HEAD` |
| Publication | Published for review through the GitHub connector. The source title image is a full-resolution WebP copy. The local implementation commit retains the original PNG. |

## Integrated game

- Arena runs a three-second countdown and a 300-second simulation clock. The result snapshot uses current mass, peak mass and resource mass, with shared places for exact ties. Endless has a manual session end and uses the same rules.
- The 720-resource region manager supplies ordinary scrap, gold and energy. Collection uses participant-owned authoritative size and generation-safe payout. Magnetic Theft arms on press and locks its bearing on release. The warning checks live target geometry. Damage respects each participant’s lifetime core and becomes neutral airborne salvage.
- Flux Spikes discharge on qualifying contact. Heat degrades remote attraction, water and acid corrode the shell, and cryogenic zones can cause brittleness. The minimap shows districts, a public Salvage Signal and opponents inside the current camera view.
- Copper, Spark, Drift and Orbit use the existing Collector and Roamer behaviors with local tactical pursuit, attack timing, signal choices and hazard avoidance. Hard adds value-weighted route scoring and warning-cone evasion. Difficulty leaves physical rules and payout rates identical.
- Menu, replay, pause, onboarding, live ranking, settings and result breakdown use DOM controls. Records and preferences use validated local storage. Music and effects have separate levels. The tutorial uses a fixed seed, staged resources and a passive rival.
- The [asset inventory](assets.md) identifies the original title artwork, magnet atlas, runtime vector artwork, animation inventory, soundtrack and generation commands.

## Automated and browser verification

| Check | Result |
| --- | --- |
| Baseline `npm ci --cache /tmp/magnet-npm` and `npm test` | Node 24.22.1, 92 passed, zero failed |
| Final `npm test` | 103 passed, zero failed |
| Final `npm run typecheck` and `npm run build` | Passed. Vite emitted its large-chunk advisory for the Phaser bundle. |
| `npm exec -- tsx scripts/measure-competition.ts` | Existing seeded measurement ran to completion. |
| `npm exec -- tsx scripts/simulate-matches.ts` | 36 complete 300-second matches across three difficulties and six control strategies, with the same seed and strategy pairs at each difficulty. |
| Chromium production preview | Title, help, settings, muting, Arena countdown, keyboard steering and pickup, map, pause and resume, emulated touch tap, orientation resize, Endless results and immediate replay. |
| Chromium instrumented development preview | Completed tutorial from movement through charged theft and salvage. Verified simultaneous emulated joystick and attack pointers, attack-thumb directional override and one release resolution. Exercised each hazard with staged positioning and gameplay-rule assertions. |
| Full-duration Chromium Arena | With normal difficulty and repeating WASD movement, finished fifth with 1,694 mass, reached results and replayed at 20 mass and 5:00. Zero uncaught page errors. This run preceded the switch to Canvas. The current Canvas build also passed a controlled 300-second simulation deadline and immediate replay in Chromium. |

The full-duration software-WebGL run took 329 wall seconds including startup, and recorded 3,190 browser animation callbacks over 325 seconds. Separate 15-second headless measurements at 1024 × 768 saw a median interval of 33.4 ms and p95 of 66.7 ms with software WebGL, and a median and p95 of 16.7 ms using the Canvas fallback. Canvas is now the default. The rebuilt preview recorded 863 frames in a 15-second sample, with 16.7 ms median and 16.8 ms p95 frame intervals. Chromium layout checks passed at 320 × 568, 390 × 844, 568 × 320, 820 × 390, 768 × 1024, 1440 × 900 and 1920 × 1080. These measurements describe this headless browser and host.

### Screenshots

| Flow | Evidence |
| --- | --- |
| Desktop | [Title](evidence/desktop-menu.jpg) · [Arena and map](evidence/desktop-arena.jpg) |
| Emulated mobile | [Portrait](evidence/mobile-portrait.jpg) · [Landscape](evidence/mobile-landscape.jpg) |
| Combat | [Tutorial theft aim](evidence/training-attack.jpg) |
| Hazards, staged for inspection | [Flux Spike](evidence/hazard-flux.jpg) · [Heat](evidence/hazard-heat.jpg) · [Water](evidence/hazard-water.jpg) · [Acid](evidence/hazard-acid.jpg) · [Cryogenic](evidence/hazard-cold.jpg) |
| Results | [Arena](evidence/arena-results.jpg) · [Endless](evidence/endless-results.jpg) |

## Balance

The existing 15,360 × 10,000 world, start mass of 20, speed of 460, starting radius of 30, 12× growth curve, 1,500-slot natural-resource capacity and 720 active target carry forward. Release values are in `src/competition-config.ts` and the associated collection, combat and AI modules. New defaults include the 94%/1%/5% site mix, 100 energy capacity, 260-unit theft gap, 180 ms warning, 100/35 energy hit/miss costs, and the specified four hazard families with five site variants.

The initial suite showed similar bot attack activity across difficulties and better player placement in the Hard sample. Tuning added resource-weighted routes and warning-cone evasion on Hard, narrowed pursuit and restricted signal detours. A matched-seed pass exposed that Easy bots still placed too well. Easy now pauses briefly to reconsider routes, along with shorter search and slower decisions. The final matched-seed means follow the intended difficulty order.

| Final 36-match measurement | Value |
| --- | --- |
| Winners | Spark 14, Copper 10, player 5, Orbit 4, Drift 3 |
| Idle player | 0 wins and fifth place at 20 mass in all six runs |
| Player wins by difficulty | Easy 4/12, Normal 1/12, Hard 0/12 |
| Mean player rank by difficulty | Easy 2.83, Normal 3.42, Hard 3.67 |
| Nearby rivals | Median of 3 distinct rivals within 500 surface units, range 1–4 |
| First intentional theft | 12 runs fired. Median of 61 seconds, range 8.5–160.5 seconds. |
| Theft resolutions | Scripted player 34 hits and 2 misses. Bots 253 hits. |
| Maximum scale | Player finished at 12× in 5 runs. |
| Natural resources | 716–720 active at match end. |
| Headless model runtime | 1.4–3.3 seconds per 300-second match, median 1.9 seconds on this host during concurrent verification. |

The simulation gates attacks on favorable geometry, which explains its high hit rate. It compares two examples of each of six strategies at each difficulty using the same seed and strategy pair. The [raw runs](evidence/seeded-matches.jsonl) include mass checkpoints, hazards, encounters and times.

## Open release gates

- Normal produced one player win in twelve sampled runs. Human playtesting and a larger seed sample are still needed to establish whether Normal is appropriately balanced.
- Firefox and WebKit installation was blocked by browser-download restrictions. Safari, Edge, physical iOS and Android, hardware GPU behavior, and longer multi-match endurance remain unverified.
- Remaining art review includes dedicated landmark and hazard-device animation, bespoke impact fracture animation, growth and resource legibility across the full zoom range, and mobile art review on hardware.
- The real-time browser match covered one five-minute run. It does not establish multi-hour endurance or mobile battery and temperature behavior.

## Review locally

1. Run `git switch feat/magnet-v2-complete-game`, then use Node 22.12+ or 24.x and run `npm ci`, `npm run build` and `npm run preview -- --host 0.0.0.0`. Open the preview address.
2. Start **Learn to Play**. Follow the prompts through neutral salvage recovery. Use **Play Arena** to verify the countdown, five-minute deadline, rank, results and **Play Again**. Try **Endless** and end it from Pause.
3. Open **Map** in Endless. Inspect each district while steering. Approach purple Flux hardware above and below mass 120, an orange furnace zone, a blue water zone, an acid basin and a frost field. Compare energy and mass behavior before, during and after contact. The screenshot set identifies each footprint.
4. From a physical phone on the same LAN, open the host’s LAN address and preview port. Test portrait and landscape, tap-to-move, a sustained floating joystick drag, holding Attack with a second finger, thumb override, releasing only the attack pointer, rotating during an armed gesture and replaying without a reload. Check thumb reach, browser chrome, frame pacing, temperature and battery during sustained play.
5. Run `npm test`, `npm run typecheck`, `npm run build` and `npm exec -- tsx scripts/simulate-matches.ts` to repeat the local checks.
