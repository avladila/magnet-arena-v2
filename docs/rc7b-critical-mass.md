# MAGNET V2 RC7B · Critical Mass

Arena has a second way to win. Grow past Colossus, reach 12,000 current mass, and hold it through a three-second countdown. A rival can use Magnetic Theft to interrupt the claimant or leave the danger area and earn 1,000 match-only survival points. The five-minute mass ranking still decides games that run out of time.

RC7B extends the RC7A Living Faces head `4fcfdb312a9d0bd66204f36f57804b4cf489a749` on `feat/magnet-v2-rc2`. The verified `main` reference was `318656d50c9581201e4c1b873f0ae2ad33c91a64`. [Development pull request](https://github.com/avladila/magnet-arena-v2/pull/8) · [RC7A report](rc7a-living-faces.md)

## Rules and authority

| Setting | Default |
| --- | ---: |
| Colossus physical cap | 4,352 mass · 12× scale · 360 world-unit radius |
| Ultimate Form | 8,000 current mass |
| Unstable Form | 10,000 current mass |
| Severe instability | 11,000 current mass |
| Critical Mass | 12,000 current mass |
| Countdown | 3 seconds |
| Blast radius | 1,400 world units |
| Wave expansion | 0.8 seconds |
| Survivor award | 1,000 match points |
| Arena limit | 300 seconds |

All four overload stages use current mass and downgrade as soon as damage takes the magnet below a threshold. The six earlier growth stages still apply. Continued mass uses the original speed of 460 units/s and the same cap for body radius and attraction reach. Energy, the resource mix, hazards, and normal Magnetic Theft use their existing rules. Endless supports the golden Ultimate Form as a cosmetic milestone and can run indefinitely. Tutorial and older simulation callers use their original rules. [Configuration](../src/competition-config.ts)

`ArenaModel` owns a single `CriticalMass` controller for Arena. It progresses from play through countdown, commitment, expanding shockwave, and results. At 60 Hz, each ordinary step advances nonclaimant movement, salvage and theft, hazards, and resource collection before checking real mass and the clock. One qualifying actor claims the countdown. Current mass, peak mass, resource mass, and ascending stable participant ID decide ties in order. A fresh claimant begins with all three seconds. The clock starts decrementing on the next step. [ArenaModel](../src/arena-model.ts) · [Controller](../src/critical-mass.ts)

The claimant locks at its captured center, drops a held arm, and keeps collecting and taking damage. Energy and cooldown rules resume on interruption. A warning already released before the claim still resolves normally during the countdown. The controller records the theft credit that crossed the threshold if ordinary theft caused the final drop, or records hazard damage when hazards caused it. Another qualifier can claim immediately after an interruption. Pausing freezes the countdown and wave. Leaving or playing again creates a fresh session. [Theft and credit](../src/combat.ts) · [Match clock](../src/match.ts)

If the claimant falls below the threshold on the last valid step, the countdown is cancelled and the ordinary timeout applies. If the claimant still qualifies and the countdown expires on that step, the commitment wins and the full wave runs. An unfinished countdown expires with the match. [Fixed-step cases](../tests/critical-mass.test.ts)

## Shockwave and results

Commitment fixes the winner, center, time, and ranking statistics. Existing attacks, loot, streaming, hazards, and ordinary bot logic stop. The winner exits play as the detonator. Any remaining competitor can move at the normal speed until the filled wave touches their physical body. The same collision rule applies to guarded competitors, giants, and magnets behind scenery. Walls constrain movement and clip the painted boundary to the playable surface. Geometry is Euclidean and never wraps to the opposite side.

For elapsed wave time `t`, radius `r(t) = 1,400 × min(t ÷ 0.8, 1)`. Each step checks the moving body at every fraction `s ∈ [0,1]` using `|p₀ + s(p₁ − p₀) − c|² − (bodyRadius + r₀ + s(r₁ − r₀))²`. The quadratic reaches a hit if either endpoint or its interior minimum is at or below zero. The center is lethal from commitment. The final radius is exactly 1,400. Cosmetic fragments carry no mass. [Collision and commitment](../src/critical-mass.ts) · [Wave rendering](../src/critical-view.ts)

The immutable match result places the detonator first, survivors next, and destroyed competitors last. Each group keeps the normal current mass, peak mass, and resource mass ranking with tied places. Survival points are a separate per-match stat. The same result drives the winner, rankings, match statistics, and saved records. `magnet.progress.v1` accepts old saves and defaults the new records to zero. Each result updates progress once. Reset Progress also clears victories by detonation, survival totals, interruptions, and best destruction count. [Result snapshot](../src/match-result.ts) · [Progress](../src/progress.ts)

## Bots and presentation

Bots use the same threshold, lock, collision, and rewards. They compare a set of exits against their body radius, walls, and active hazards. Hunters take strong interruption opportunities. Chargers weigh the timing and whether a charged shot leaves an escape route, while opportunists require more retreat margin. Collectors, roamers, and scavengers prioritize escape. During the wave, survivors use the same steering speed as during ordinary play. Rivals outside the warning area and its buffer continue their ordinary plans until commitment. [Bot decisions](../src/critical-tactics.ts)

Twenty reinforced shell variants preserve each chassis, attachment, decal, and pose socket. Four new expressions coordinate the brows, eyes, and mouth. Ultimate Form looks confident, unstable looks nervous, severe instability tightens the face, and an anchored claimant panics. Following a visible overloaded rival uses the existing RC7A attention pass. The player keeps camera control, and the minimap reveals only the public claimant outside ordinary visibility. The warning uses the actual 1,400-unit circle, with an arrow and distance to its center when it is offscreen. The wave rim follows simulation radius in all graphics modes. Reduced motion keeps the core telegraphs and removes decorative shake, arc motion, and fragments. [Ultimate roster](evidence/rc7b/ultimate-roster.webp) · [Overload expressions](evidence/rc7b/overload-expressions.webp) · [Visual identity](brand.md)

The original Web Audio synthesizer plays separate cues for entering Ultimate Form, advancing through instability, the countdown beats, interruption, detonation, destruction, survival, and victory. The countdown bus stops when paused or interrupted. A low impact, filtered noise, and metal accents form the detonation alongside the white electrical core and mechanical debris. All cues respect the existing master and effects controls. [Cues](../src/audio.ts)

## Verification and regression

- RC7A baseline on the same host passed 167 unit tests, 15 Chromium tests, typecheck, and build. RC7B passed 190 unit tests and all 21 Chromium tests, plus clean dependency install, typecheck, and production build. The existing Phaser bundle size advisory still appears during build. [Checks](evidence/rc7b/checks.txt)
- Six archived RC5 five-minute input replays matched the freshly run RC7A baseline and RC7B with the mechanic disabled. That is 108,000 fixed steps and 186 identical checkpoints for movement, energy, growth, pickups, combat, salvage, hazards, activity, and standings. [Replay hashes](evidence/rc7b/replay-parity.json)
- The 11 navigation fixtures and 45-case navigation matrix matched byte for byte, as did all five seeded competition comparisons. The growth fixture data matched after removing wall-clock timing values. The standard 4,352-mass giant impact still yields 1,051 remaining mass and 3,301 detached across 24 pieces. [Diagnostic comparison](evidence/rc7b/regression.json)
- A browser check changed graphics and reduced motion while pausing a live claim, switched to the dark theme after resuming, and confirmed that leaving and restarting on Hard cleared the warning and minimap marker. [Checks](evidence/rc7b/checks.txt)

## Balance experiments

Every full match used the existing `GameplayPilot` at 60 Hz. One principal block paired the same 24 combinations on RC7A and RC7B using Easy, Normal, and Hard and one seed per strategy on each difficulty. The strategies were inactive, beginner, collector, energy, hunter, defensive, salvage, and balanced. The independent seed block used six pairs with inactive and balanced on all three difficulties. Six one-factor variant runs each used the three principal balanced configurations. The 78 full matches used the same paired-viewport schedule within each cohort. Fixtures used for recordings and positioning stress did not enter this sample. [Full-match rows](evidence/rc7b/full-matches.jsonl) · [Pilot](../scripts/measure-critical-mass.ts)

| Cohort | Detonations | Timeouts | Player/bot detonators | Avg time | Detonator mass min/avg/max | Interruptions/claims |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Principal RC7A | 0/24 | 24/24 | 0/0 | — | — | — |
| Principal RC7B | 18/24 (75%) | 6/24 (25%) | 2/16 | 266.5 s | 12,002 / 12,297 / 13,658 | 2/20 |
| Independent RC7A | 0/6 | 6/6 | 0/0 | — | — | — |
| Independent RC7B | 4/6 (67%) | 2/6 (33%) | 0/4 | 264.9 s | 12,006 / 12,926 / 14,162 | 0/4 |

The principal detonations caused one destruction and 341 survivals. At the start of the decisive claim, 36 of 37 competitors whose bodies were inside or touched the lethal circle survived, along with all 305 competitors outside it. The independent cohort had zero destructions and 76 survivals, including 6/6 initially inside and 70/70 outside. A centered blast circle covers roughly 4% of the arena before accounting for body radius. The principal matches averaged 2.1 opponents inside the circle at the decisive claim, with a range of 0–6. These samples show late claims and sparse blast casualties with normal bot escapes.

| Difficulty | Principal detonations out of 8 | Player detonations | Avg detonation time | Destroyed opponents |
| --- | ---: | ---: | ---: | ---: |
| Easy | 6 | 2 | 265.1 s | 0 |
| Normal | 6 | 0 | 258.7 s | 0 |
| Hard | 6 | 0 | 275.7 s | 1 |

| Strategy | Mean final rank in principal RC7A → RC7B |
| --- | ---: |
| Inactive | 20.0 → 20.0 |
| Beginner | 13.0 → 13.7 |
| Collector | 8.3 → 7.7 |
| Energy-focused | 7.0 → 13.0 |
| Hunter | 4.3 → 4.0 |
| Defensive | 4.0 → 5.0 |
| Salvage | 5.0 → 9.3 |
| Balanced | 9.0 → 2.7 |

Inactive players stayed last in all six RC7B stock matches in which they were sampled. The five inactive players whose matches detonated were outside the danger area and received the same survival award as active survivors. In controlled geometry an idle magnet inside the radius was destroyed. Staying away can secure the participation bonus, and the small sample gives no evidence that hiding yields competitive placement. Ordinary combat remained relevant in the principal cohort with 107 successful pilot hits versus 119 in the longer baseline matches. The natural cohort recorded two successful bot interruptions in the same Easy match. The player pilot attempted zero interruption shots. The RC5 quiet-period and difficulty limitations remain. Median principal time with no visible rival was 165.5 s at RC7A and 155.0 s at RC7B, across matches with different end times.

### One-factor comparisons

Each row has the same three balanced pilots and seeds. `Inside` and `Outside` count survivals among competitors at that distance when the decisive claim began. The stock row here is the matched balanced subset of the principal block.

| Variation | Detonations / timeouts | Player / bot | Avg time | Avg winning mass | Interrupted | Destroyed / survived | Inside | Outside |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| Stock 12,000 · 3 s · 1,400 | 2 / 1 | 1 / 1 | 254.3 s | 12,244 | 0 | 0 / 38 | 3/3 | 35/35 |
| 10,000 mass | 3 / 0 | 1 / 2 | 256.2 s | 10,410 | 0 | 1 / 56 | 5/6 | 51/51 |
| 15,000 mass | 2 / 1 | 0 / 2 | 283.2 s | 15,931 | 0 | 0 / 38 | 5/5 | 33/33 |
| 2-second warning | 2 / 1 | 1 / 1 | 253.3 s | 12,244 | 0 | 0 / 38 | 3/3 | 35/35 |
| 4-second warning | 2 / 1 | 1 / 1 | 255.3 s | 12,244 | 0 | 0 / 38 | 3/3 | 35/35 |
| 1,000-unit radius | 2 / 1 | 1 / 1 | 254.3 s | 12,244 | 0 | 0 / 38 | 3/3 | 35/35 |
| 1,800-unit radius | 2 / 1 | 1 / 1 | 254.3 s | 12,244 | 0 | 1 / 37 | 5/6 | 32/32 |

### Controlled escape and attack geometry

The staged series used 600 escape and eight interruption fixtures. At 460 units/s, the countdown alone covers up to 1,380 units. Actual survival also used normal movement during the wave and the body intersection test. With a reaction delay of 0.8 seconds in open terrain, 9/12 initially inside positions escaped at stock settings. The two-second variant gave 6/12, the four-second variant gave 12/12, the 1,000-unit variant gave 9/9, and the 1,800-unit variant gave 8/13. The set of positions initially inside depends on radius. Two body sizes and five reaction times were exercised. For a small magnet pinned directly against the wall, an escape route that turned away from the wall survived after a 0.8 s reaction delay, while holding the radial direction was fatal. Both body sizes failed the sampled corner positions at stock settings.

A charged Hunter interrupted from 520, 649, and 900 center units in 0.20 s, 0.20 s, and 0.75 s respectively. At the edge of theft range it held its position through the warning to keep the anchored claimant within range. A Hunter that charged too late or faced a claimant whose guard outlasted the warning escaped. At the near position the tested opportunist interrupted, while the Collector escaped. A valid hit also interrupted a 24,000-mass claimant because the ordinary diameter-based attack still reduced its core to 1,051. [Controlled rows](evidence/rc7b/staged-balance.jsonl) · [Fixture runner](../scripts/measure-critical-escape.ts)

Keep the proposed defaults for this prototype. Evaluate 1,800 units with a larger paired pilot and human sample if stock remains too sparse. This experiment added a casualty but left more initially exposed competitors, and staged results show that a larger area or shorter warning increases risk for slow reactions and trapped players. Check interruption opportunities near real salvage concentrations before choosing a release configuration. Final numbers and gameplay feel need product-owner approval.

## Performance

Same host and independent Chromium 156 sessions, Canvas renderer, two CPU quota. Frame work is measured between Phaser `prestep` and `postrender`. Frame interval is measured between consecutive renders. The matched stock samples use the same opening route and seed. Dense samples keep all 20 participants, seven or eight Ultimate magnets, and 1,024 live salvage pieces. Onscreen stress holds rivals in place to force real simultaneous destruction. Offscreen stress keeps the detonator out of the human viewport. Each cell lists the median and 95th percentile in milliseconds. [Raw measurements](evidence/rc7b/browser-performance.jsonl) · [Browser profiler](../scripts/measure-critical-browser.mjs)

| Scenario | RC7A work | RC7B work | RC7A interval | RC7B interval |
| --- | ---: | ---: | ---: | ---: |
| Desktop Balanced | 1.4 / 4.1 | 1.4 / 3.9 | 16.7 / 19.5 | 16.6 / 19.2 |
| Portrait Balanced | 1.1 / 3.7 | 1.3 / 3.9 | 16.6 / 19.5 | 16.7 / 19.6 |
| Landscape Low with reduced motion | 1.2 / 4.1 | 1.2 / 4.3 | 16.7 / 19.6 | 16.7 / 19.8 |
| Dense Low | 3.9 / 6.5 | 3.9 / 5.8 | 26.8 / 33.9 | 21.2 / 25.9 |
| Dense Balanced | 4.0 / 5.8 | 4.0 / 5.7 | 27.3 / 32.7 | 20.9 / 27.0 |
| Dense High | 3.6 / 5.3 | 3.8 / 5.6 | 19.5 / 23.3 | 21.0 / 27.4 |
| Dense High with reduced motion | 3.8 / 5.6 | 3.9 / 6.6 | 23.4 / 27.4 | 18.2 / 24.9 |

| RC7B endgame | Countdown work | Countdown interval | Wave work | Wave interval | Fragments allocated |
| --- | ---: | ---: | ---: | ---: | ---: |
| Onscreen Low | 4.3 / 6.8 | 28.2 / 34.4 | 1.3 / 4.0 | 16.7 / 19.4 | 66 |
| Onscreen Balanced | 4.3 / 7.7 | 28.6 / 34.4 | 1.0 / 3.0 | 16.7 / 18.1 | 72 |
| Onscreen High | 4.1 / 8.0 | 28.4 / 38.4 | 1.1 / 3.4 | 16.7 / 17.6 | 72 |
| Onscreen High with reduced motion | 3.8 / 5.5 | 24.2 / 29.3 | 0.7 / 3.2 | 16.6 / 20.3 | 0 |
| Offscreen Balanced | 1.9 / 3.3 | 16.6 / 20.8 | 0.7 / 2.9 | 16.6 / 17.7 | 63 |

The dense High countdown had the slowest measured interval at 38.4 ms at the 95th percentile. Once the wave started, ordinary salvage and resource rendering stopped and frame intervals approached the ordinary opening rate. The fragment pool plateaued at 72, with none allocated in reduced motion. Every staged dense detonation eliminated 19 competitors through real collision. Fifty accelerated detonation and replay cycles recorded 50 victories, kept one canvas, and retained about 0.54 MB of JavaScript heap after garbage collection. The separate browser suite ran 50 routine UI replays and retained about 1.47 MB in the final run. These are headless host measurements. Phone performance and audio comfort remain open.

## Gameplay recordings

The clips show the running game in Chromium. Fixtures set starting mass, time, and positions so endgame events happen quickly. Pickups, interruptions, shockwave hits, outcomes, and rewards came from the live simulation. Touch inputs used two Chromium touch pointers. Recordings are silent screen captures.

| Recording | What it shows |
| --- | --- |
| [Growth and player victory](evidence/rc7b/growth-and-victory.mp4) | Actual gold pickups beyond physical cap, Ultimate Form, unstable and severe stages, a player claim, pause and resume, six genuine shockwave eliminations among staged inactive rivals, and the Detonator result |
| [Interruptions and timeout](evidence/rc7b/interruptions-and-timeout.mp4) | A released player attack interrupts an opponent, acid then cancels a fresh countdown, and ordinary timeout resolves through the mass ranking |
| [Offscreen bot and human escape](evidence/rc7b/bot-offscreen-escape.mp4) | A public offscreen alert with distance and minimap boundary, keyboard escape from inside the danger area, a bot victory, a Survivor result, and the +1,000 award |
| [Bot victory and human destruction](evidence/rc7b/bot-detonation-and-destruction.mp4) | An on-screen bot commits, the blast destroys a stationary human, and destroyed rank follows survivors |
| [Mobile portrait](evidence/rc7b/mobile-portrait.mp4) | Touch steering and attack with an overlapping second thumb while escaping an Arena detonation |
| [Mobile landscape](evidence/rc7b/mobile-landscape.mp4) | The same touch exercise with reduced motion and the live perimeter and minimap visible |

To rerun the browser suite and capture the staged fixtures, use `MAGNET_RC7B_VIDEO=/path/to/output npm run test:e2e -- --project=chromium --workers=1 e2e/critical.spec.ts`. The recording command uses FFmpeg and Chromium CDP. Chromium emulation covers layout and pointer handling. Physical phone results are pending.

### Physical-device playtest

Use iOS Safari and Android Chrome on actual phones. In both orientations and themes, check timer and warning legibility at the physical cap, offscreen indicator direction, the minimap around display cutouts, and steering while the second thumb arms/releases. Try slow starts and a tight-wall escape, first on Low and reduced motion and then on High. Test pausing, rotating, backgrounding, and replaying mid-countdown. Check that the alarm stops, volume controls apply to the layered burst, and the survival and victory cues remain audible on phone speakers. Record the hardware, browser, settings, and any missed taps or dropped frames.
