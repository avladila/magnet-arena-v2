# MAGNET RC4 verification

RC4 extends `f22c9e3` on the existing PR. Arena and Endless use twenty participants. Training has the player and a single practice magnet. The arena dimensions, growth curve, natural resource mix and payouts, input gestures, and attack geometry carry forward from RC3.

## Combat and salvage

RC3 removed a fraction of the detachable shell. Most of that mass represented very little diameter near the 12× cap. Its 145-unit debris throw landed inside a giant's body or pull field. RC4 sets a target diameter, inverts the growth curve, rounds to the nearest integer mass, and then applies the combat core. The simulation updates mass and radius together. The visible shell changes stage immediately and eases down over 280 ms.

The diameter reduction interpolates between 8%, 12%, 25%, 40%, and 50% at scales 1×, 2×, 4×, 8×, and 12×. A smaller attacker adds up to five percentage points. An ordinary hit stays within the 50% target before mass rounding. The table shows exact model results with representative integer starting masses.

| Defender scale | Starting mass | Remaining mass with 12× attacker | Remaining mass with 1× attacker |
| --- | ---: | ---: | ---: |
| 1× | 20 | 20 | 20 |
| 2× | 101 | 76 | 71 |
| 4× | 451 | 245 | 211 |
| 8× | 1,901 | 661 | 551 |
| 12× | 4,352 | 1,051 | 1,051 |
| 12× with excess mass | 8,900 | 1,051 | 1,051 |

The combat core is one quarter of peak lifetime mass, rounded down and bounded to 20–250 mass. Environmental hazards retain their lifetime core without a cap. Each damaging theft starts a 1.5-second guard against further theft. A guarded-only pulse costs 35 energy and has its own ring, tone, and feedback. A direct core-only contact retains the 100-energy hit cost and has its own result statistic. Aim assistance and bot selection skip guarded targets. Simultaneous hits use one pre-hit snapshot. The strongest ordinary request limits total loss, and stable participant IDs resolve rounding when credit is distributed proportionally. Brittle amplifies the strongest request by 25% before the core limit and has a separate impact label.

A theft throws up to 24 pieces. Each piece carries integer mass and keeps its original victim and contributing attackers through pending capacity and expiry. Landing begins at the greatest of 145 world units, the original radius plus 40, and the new pull reach plus 35. The front fan carries 65% of the mass in open space. Walls use nearby legal angles with varied distances. Combined hits orient the fan toward contributors in proportion to damage credited. Fragments land after 0.55 seconds and expire ten seconds after detachment. Rivals can contest them on landing, and the original victim becomes eligible five seconds after landing, including for direct contact. Environmental debris uses its existing eligibility and throw.

The paired replay uses the same stationary mass-4,352 defender, mass-20 attacker, and start positions. Playback uses the real game physics and release control. Natural pickups are disabled in this fixture to attribute all mass changes to the attack. The attacker and third competitor steer toward the debris during the replay.

| Replay measurement | RC3 | RC4 |
| --- | ---: | ---: |
| Mass detached | 1,044 | 3,301 |
| Defender's new radius | 314.66 | 179.98 |
| Debris pieces | 8 | 24 |
| Landing distances | 145 | 400–488 |
| Returned to defender during capture | 1,044 | 0 |
| Collected by attacker during capture | 0 | 1,753 |
| Collected by third competitor during capture | 0 | 145 |

In RC3 the giant had regained its original radius by the first samples after landing. RC4's guard and outward flight are visible in the clip. The temporary lock also has a unit test that places the original victim directly on a landed piece just before expiry of the restriction. [Before-and-after recording](evidence/rc4/combat-comparison.webm) · [Matched screenshots](evidence/rc4/combat-comparison.webp) · [Impact and fracture](evidence/rc4/giant-impact.webp) · [Salvage contest](evidence/rc4/salvage-contest.webp) · [RC3 trace](evidence/rc4/combat-before.json) · [RC4 trace](evidence/rc4/combat-after.json)

## Population, AI and interface

Six seeded spawn areas sit near the player and thirteen cover the rest of the arena. Two near spawns place rivals along different opening sightlines for desktop and mobile. The full roster uses five Collectors, four Hunters, three Chargers, three Scavengers, two Roamers, and two Opportunists. Names, accents, starting districts, and all six shell stages come from the same roster data and art generator. [Roster and shells](evidence/rc4/roster.webp)

Bots use the existing route planner and commitment. Hunters weigh projected salvage and the rankings, Chargers weight local energy, and Scavengers prefer landed fragments they can claim. Large bots may commit to an escape route when a nearby charged rival could cost them substantial diameter. In the populated model, all 45 staged heat, overlap, and wall passes completed across five masses and three difficulties. There were zero turns sharper than 90° within a quarter-second and zero avoidance-side switches. The separate heat, cold, water, acid, Flux, pursuit, and dense-scrap fixtures also completed with zero such turns. [Population navigation matrix](evidence/rc4/navigation-after.jsonl) · [Hazard and pursuit fixtures](evidence/rc4/navigation-fixtures.jsonl)

The desktop HUD shows five leaders and the human row when needed. Mobile shows the leader and current player. The rankings control expands to all twenty, and results have a scrollable list with the player highlighted. In the live opening capture, steerable natural play brought Spark and Bolt on screen together about two seconds into the selected route. [Desktop opening](evidence/rc4/desktop-opening.webp) · [Nearby competitors](evidence/rc4/nearby-competitors.webp) · [Mobile portrait and landscape](evidence/rc4/mobile-gameplay.webp) · [Final ranking and results](evidence/rc4/results.webp)

## Paired matches

Each column uses the same 18 five-minute seed, difficulty, and strategy combinations. The five-participant column ran the actual RC3 commit. Both twenty-participant columns use the final roster, spawns, and resource budget. The middle column uses the old damage and debris rules for comparison. An encounter starts when a rival enters a 500-world-unit surface gap. Recovery time measures regain of pre-hit mass among wounds that recovered before the next hit or match end.

| Mean per match unless noted | RC3 · 5 | RC3 combat · 20 | RC4 combat · 20 |
| --- | ---: | ---: | ---: |
| Encounters per minute | 2.21 | 7.01 | 7.07 |
| Encounters in first minute | 1.94 | 6.78 | 6.56 |
| First-minute seconds without a close rival | 56.8 | 48.9 | 49.5 |
| Match seconds without a close rival | 272.9 | 226.6 | 241.1 |
| Time to first pulse | 57.2 s | 21.3 s | 21.3 s |
| Pulses | 12.5 | 90.4 | 74.5 |
| Pulses recorded as hits | 11.7 | 84.0 | 64.2 |
| Damaging events | 11.8 | 87.2 | 65.8 |
| Mass detached per damaging event | 232 | 227 | 1,860 |
| Diameter lost per damaging event | 4.3% | 4.2% | 37.1% |
| Giant diameter loss, including brittle | 0.6% | 1.1% | 50.9% |
| Return to pre-hit mass, completed recoveries | 2.3 s | 2.8 s | 28.2 s |
| Player rank changes | 14.2 | 50.9 | 83.9 |
| Natural resources within 800 units per participant | 67.5 | 68.9 | 72.2 |
| Samples with fewer than ten nearby resources | 0.53% | 0.56% | 0.53% |
| Bot hazard contact samples | 99 | 360 | 343 |
| Share of pulses from the busiest attacker | 36.9% | 8.1% | 9.3% |

All 199 RC4 giant hits in the sample contributed to the diameter mean. Attacking magnets recovered 85.4% of all RC4 detached mass by their own claims, and victims reclaimed 0.6% after the lock. Third-party collection remains possible, as seen in the matched replay. Bot samples at mass 35 or below were under 1% in all configurations. Scavenging and combat increased rank changes substantially, but the scripted player won zero matches in all three columns. RC4 mean placements were 11.83 on Easy, 13.67 on Normal, and 11.17 on Hard. The sample shows too little separation among difficulties to validate human balance. A narrow encounter radius still leaves long quiet stretches even with the larger roster. [RC3 match records](evidence/rc4/matches-baseline.jsonl) · [Population-only records](evidence/rc4/matches-population.jsonl) · [Full RC4 records](evidence/rc4/matches-impact.jsonl)

## Resources and performance

The competitive pool has 3,600 slots and an active target of 2,880, up from 1,500 and 720. Region site density stays fixed. Cache capacity rises from 80 to the 176 regions in the arena, based on participant interest. The matches peaked at 176 cached regions and recorded zero duplicate natural claims. RC4 match-end availability was 2,871–2,878 against the 2,880 target. Indexed natural attraction queries conservative field bounds using 240-unit cells and then resolve claims using the same signed gap test and ID tie rule. A twenty-participant regression compares the indexed result with a full scan through changes in position, size, heat, and cold.

Canvas creates pickup, orbit, and salvage sprites as they enter the view and reuses them. The following samples run the same input sequence for 8.2 seconds in live Endless. CPU time covers Phaser pre-step through post-render in headless Chromium 156. Median cadence was 16.6–16.7 ms. The mobile-sized Balanced run had a slower frame tail than the desktop or Low samples.

| Viewport and quality | CPU median RC3 → RC4 | CPU p95 RC3 → RC4 | Frame interval p95 RC3 → RC4 |
| --- | ---: | ---: | ---: |
| 1366 × 768 Balanced | 1.1 → 1.1 ms | 2.2 → 4.2 ms | 18.0 → 19.9 ms |
| 390 × 844 Balanced | 0.9 → 1.2 ms | 1.9 → 4.7 ms | 18.0 → 29.6 ms |
| 844 × 390 Low | 0.9 → 1.0 ms | 1.9 → 4.4 ms | 17.7 → 20.1 ms |

In the desktop sample the natural sprite pool peaked at 46 allocated pickups, down from 720 preallocated in RC3. The post-GC heap at the end of that sample was 10.35 → 10.78 MB. Across the match simulations, the average sampled model-step p95 including periodic replenishment was 0.44, 2.35, and 2.34 ms respectively. In a separate browser scene stress run with seven giants, simultaneous pulses, and preloaded salvage, capacity reached 1,024 active and 104 pending, with 1,009 visible shard sprites at peak. The simulated scene update p95 was 12.7 ms including graphics command generation. Replenishment was disabled in that fixture. Full frame timings are the live samples above. [RC3 profiles](evidence/rc4/profile-before.json) · [RC4 profiles](evidence/rc4/profile-after.json) · [Browser stress run](evidence/rc4/browser-stress.json)

## Verification

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e -- --project=chromium --workers=1
npm exec -- tsx scripts/measure-world.ts
npm exec -- tsx scripts/measure-growth.ts
npm exec -- tsx scripts/measure-competition.ts
npm exec -- tsx scripts/measure-navigation.ts --matrix
MAGNET_TRIALS=18 MAGNET_PARTICIPANTS=20 MAGNET_COMBAT=legacy npm exec -- tsx scripts/simulate-matches.ts
MAGNET_TRIALS=18 MAGNET_PARTICIPANTS=20 MAGNET_COMBAT=impact npm exec -- tsx scripts/simulate-matches.ts
```

All 135 unit and 12 Chromium tests passed, along with typecheck and production build. The 30-minute full-roster simulation covered mass conservation and expiry. Browser coverage included all five training hazards, two simultaneous touch pointers, Arena through the five-minute simulation and results, Endless, giant theft and guarded follow-up, rankings at desktop and mobile sizes, and fifty replays. The fifty-replay browser test retained about 1.44 MB after garbage collection. The world, growth, and collection diagnostics also ran on the RC3 commit and the final implementation.

Physical-device and human balance checks remain open. Measure sustained portrait and landscape play on phones, including a crowded fight in Balanced, the crowded frame tail, touch and haptic feel, and temperature and battery use. Firefox and WebKit were outside this Chromium run.
