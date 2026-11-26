# MAGNET V2 RC5

RC5 gives rivals shared reasons to cross paths. Temporary scrap-rich regions and earlier Salvage Signals draw magnets toward real resources. Bots pursue, collect, and disengage according to their archetype and difficulty. Hits, your salvage, and sustained rank gains have compact HUD feedback. The 20-magnet, 15,360 × 10,000 arena keeps its cartoon artwork, controls, payouts, and continuous 12× growth. Every magnet still starts at 20 mass and radius 30, moves up to 460 units per second, and stores up to 100 energy.

## Baseline and checkpoints

The fresh baseline was `c47ca016701e97b60445e156009d7a96949bfcfa` on `feat/magnet-v2-rc2`. PR #8 remained open against `main` at `318656d50c9581201e4c1b873f0ae2ad33c91a64` at the start. The earlier RC4 report counted short crossings within 500 surface units as encounters. It recorded 7.07 entries per minute, 241.1 seconds of a match outside that range, and zero scripted player wins in 18 matches. The fresh run of that original script used the unchanged baseline code. RC5's new pilot and camera-based metric measure a different set of questions. [RC4 report](rc4.md) · [Fresh original simulation](evidence/rc5/rc4-original-simulation.jsonl)

**Three causes.** A distance crossing could be too short to react to, especially across a viewport edge. Collection and roaming plans mostly went in independent directions, and the first signal waited 45 seconds with few eligible followers. Under the stronger pilot, Easy and Hard each lost five of 24 matches to competent strategies while Normal lost two. Hard bots collected about 6.6% fewer natural pieces than Normal bots in those matches. More attacks can open salvage for everybody, so attack rate alone was a poor way to set the difficulty.

| Phase | Revision or comparison |
| --- | --- |
| A · Camera and reward instrument | `d122d72`. Ran on the unchanged RC4/cartoon baseline and again on RC5. |
| B · Shared activity | `e583b44`. Compared the first full 24-match block with its baseline. |
| C · Archetypes and difficulty | `c21fa9e`. Repeated that block with the earlier activity settings. `918054a` dispersed four local opportunities and shortened collection overshoot. `18e53f1` made nearby collection routes intersect, prioritized reachable public signals, and calibrated Easy and Hard. |
| D · Combat and progression HUD | `014d1d3`. Hit labels, scrap readability, rank feedback and model-backed result statistics. `0130385` capped airborne trail rendering at 12 on Low and 48 otherwise. |
| E · Release verification | Five-minute matched and independent cohorts, Chromium browser controls, navigation matrix, frame timing, and the recordings below. |

The first checkpoint raised mean participants at a marked signal from 0.34 to 1.38 in the 18 competent matches, while mean quiet time rose from 176.9 to 186.6 seconds. The first tactical pass reduced that quiet time to 169.1 seconds and raised meaningful encounters from 6.66 to 8.23 per minute on the same set. Its longest gap still increased. A test of shared collection lanes brought the mean down to 171.8 seconds with the previous signal selection and earlier difficulty settings. The release combines the shared resource approaches with reachable signals and calibrates Easy and Hard based on the first full candidate. The earlier full candidate gave 12.5%, 20.8% and 25.0% competent win rates across Easy, Normal and Hard and increased total quiet time, so it was superseded. [Activity checkpoint](evidence/rc5/activity-checkpoint.jsonl) · [Tactics checkpoint](evidence/rc5/tactics-checkpoint.jsonl) · [Shared collection checkpoint](evidence/rc5/collection-checkpoint.jsonl)

## Arena activity

- Four radius-500 hotspots are selected from the seeded natural supply. Centers stay 2,050 units apart and normally rotate after 32–43 seconds, with a six-second ramp at each end. Active hotspots improve the priority of nearby legal offers by up to 32%. Live visible sites and slots inside retained fields keep their identities. The global budget stays at 2,880 active sites in 3,600 slots, with the same 94% ordinary, 1% gold and 5% red energy distribution. Gold remains worth ten and energy uses its existing size-based payout.
- The first Salvage Signal is scheduled at 23–28 seconds and later signals at intervals of 38–43 seconds. A site needs 18 live resources in 500 units and three participants within 2,240 units. If a site meets those same conditions within 3,500 units of the human, the signal selects the highest-ranked reachable site. Otherwise it selects the best eligible site across the arena. All magnets are free to pursue other objectives. The signal lasts up to 24 seconds and clears below nine remaining resources. Bots can commit to an active signal or a local hotspot, with ceilings of six and four followers and a 1,350-unit local search. They account for travel, remaining time, nearby threats, role, charge, size, existing commitment, crowding and competing salvage. Their individual passes run through the area with different approach points.
- Cyan floor arcs mark rich areas within view. An active signal uses a yellow floor marker and a single directional badge with world-unit distance, shown in meters, when its center is out of view. The initial six near spawns stayed in their existing seeded positions. Training stays isolated.

## Bot decisions and balance

| Decision setting | Easy | Normal | Hard |
| --- | ---: | ---: | ---: |
| Route search / overshoot, world units | 380 / 1,160 | 655 / 760 | 910 / 420 |
| Route decision interval, seconds | 5.40 | 3.40 | 2.55 |
| Ordinary density weight | 0.10 | 0.28 | 0.34 |
| Gold and Charger energy weights | 1 / 7 | 2.6 / 10 | 8 / 14 |
| General uncharged energy weight | 1 | 1.8 | 2.4 |
| Tactical evaluation, seconds | 0.45 | 0.25 | 0.18 |
| Base additional pursuit reach, units | 53 | 170 | 235 |
| Base chase limit, seconds | 1.30 | 2.40 | 2.40 |
| Arm / retry delay, seconds | 0.95 / 2.50 | 0.35 / 0.90 | 0.20 / 0.70 |
| Aim gap / motion lead, units and seconds | 182 / 0 | 215 / 0.09 | 236 / 0.18 |
| Minimum projected theft mass | 52 | 24 | 48 |
| Hazard safety margin, units | 16 | 50 | 78 |
| Retreat risk threshold | 0.34 | 0.25 | 0.19 |
| Salvage estimate speed factor | 0.76 | 0.91 | 1.00 |

Collectors sweep dense cells, value gold by difficulty, and seldom pursue beyond attack range. A route gains up to 79% in priority when a nearby rival is approaching the same cell and its weighted supply is at least three. The boost drops to 7% for large bots when that rival is charged. This evaluates real resource cells, including cells that contain valuable mixed resources. Hunters give energy and potential theft more weight. A Hunter loses interest after 0.95 seconds without closing at least 38 units, at its chase limit, or when its target leaves the allowed area. Failed chases put that opponent aside for 2.5 seconds. Chargers give red cells the strongest weighting until full, then assess worthwhile shells. Scavengers check ownership, remaining life, pull reach, travel, and competitors that can claim a piece sooner. Roamers spend up to 1.4 seconds longer between planned waypoint changes and sometimes pick a local collection or signal route. Opportunists give landed salvage and public opportunities extra weight and can continue a useful attack or retreat from an emerging threat.

Retreat risk uses the actual RC4 theft function, its combat core and the cold modifier, plus heading, gap and readiness. A successful retreat uses a committed 520-unit route with hazard-aware escape bearings. Hard also leads its aim by up to 180 ms, accounts for return fire from opponents, and retains its warning-cone evasion. Guarded targets and low-value shells fail the attack check. A recently hit magnet can leave danger, collect, and compete again through ordinary play. Existing detour commitments, stable avoidance sides, turn caps, stuck recovery and movement-derived rotation still apply. The difficulty settings affect decisions within the shared world rules.

## Combat and progression

The press-and-release ability uses its original 120° cone, 260-unit surface gap, and 180 ms warning. A hit costs 100 energy and a miss costs 35. A damaging hit gives the victim 1.5 seconds of guard. Combat and environmental cores remain separate. Debris lasts 10 seconds, with the original victim restricted for five seconds after landing. The giant reference shot still takes a 12× shell from 4,352 to 1,051 mass, removes 3,301, and launches 24 fragments. `MASSIVE HIT` marks actual diameter loss of at least 25%. `GIANT CRACKED` takes priority when a credited hit brings a defender from at least 8× to below 8×. Impact or protection feedback appears immediately, and collected salvage groups consecutive claims within 0.6 seconds. Value changes the silhouette, landing brightness and gleam of a fragment. Airborne pieces have motion trails and visible lift. Your restricted fragments remain dim during the existing lock.

Rank notices wait 0.8 seconds for a standing to settle and allow at most one notice per four seconds. The usual mass, peak and resource-mass tie-breakers still determine rank. The HUD displays peak mass separately from current mass, and tracks best place after the player grows and the field has separated. Results also show the largest credited theft, biggest actual diameter loss, mass recovered from your own attacks, distinct physically larger rivals damaged, and the most mass regained after a theft. Recovery is bounded by the original loss and follows actual pickups and salvage. These are informational only.

## Match evidence

The principal comparison uses 96 matched five-minute trials per revision, 32 per difficulty. The separate validation cohort uses 24 independent trials per revision, eight per difficulty. Each difficulty covers an inactive control, beginner, collector, energy, hunter, defensive, salvage, and balanced strategy. The six moving skilled strategies are the competent cohort. The pilot evaluates local visible pickups, hazards, shells, energy, public signals and hotspot markings when their centers are in view, then steers and presses, holds and releases the normal attack. It uses the same strategy and seed on both revisions. RC4 has no hotspot markings to read. The script follows the actual growth camera at 60 Hz and samples at 250 ms. Desktop uses 1366 × 768 and phone portrait uses 390 × 844. A body touching a viewport edge counts toward visibility. To count as meaningful, its center must be 18 CSS pixels inside the view, within 650 surface units, continuously sampled for at least 0.75 seconds. [Measurement script](../scripts/measure-gameplay.ts) · [Pilot](../scripts/gameplay-pilot.ts)

### Difficulty and playstyles

Rankings use finishing place. The extreme places include the effects of late losses and salvage comebacks. The independent cohort supplies six competent results per difficulty, so a single win changes its result by 16.7 percentage points.

| Cohort and difficulty | Trials on each build | Player wins | Mean place | Median place | RC5 place range |
| --- | --- | --- | --- | --- | --- |
| Principal all · Easy | 32 | 5/32 (15.6%) → 3/32 (9.4%) | 9.72 → 11.19 | 9.0 → 11.5 | 1–20 |
| Principal all · Normal | 32 | 2/32 (6.2%) → 3/32 (9.4%) | 10.19 → 9.84 | 9.5 → 10.0 | 1–20 |
| Principal all · Hard | 32 | 5/32 (15.6%) → 2/32 (6.2%) | 8.84 → 9.31 | 8.5 → 8.5 | 1–20 |
| Principal competent · Easy | 24 | 5/24 (20.8%) → 3/24 (12.5%) | 7.54 → 9.71 | 4.5 → 10.0 | 1–20 |
| Principal competent · Normal | 24 | 2/24 (8.3%) → 3/24 (12.5%) | 8.62 → 8.08 | 8.0 → 8.0 | 1–19 |
| Principal competent · Hard | 24 | 5/24 (20.8%) → 2/24 (8.3%) | 6.92 → 7.29 | 7.0 → 5.0 | 1–18 |
| Independent all · Easy | 8 | 0/8 (0.0%) → 0/8 (0.0%) | 11.25 → 11.00 | 12.0 → 12.5 | 2–20 |
| Independent all · Normal | 8 | 0/8 (0.0%) → 0/8 (0.0%) | 11.38 → 10.88 | 10.0 → 12.0 | 2–20 |
| Independent all · Hard | 8 | 1/8 (12.5%) → 0/8 (0.0%) | 8.88 → 11.62 | 8.5 → 12.5 | 4–20 |
| Independent competent · Easy | 6 | 0/6 (0.0%) → 0/6 (0.0%) | 9.83 → 9.33 | 10.0 → 11.0 | 2–15 |
| Independent competent · Normal | 6 | 0/6 (0.0%) → 0/6 (0.0%) | 10.50 → 9.17 | 10.0 → 11.5 | 2–13 |
| Independent competent · Hard | 6 | 1/6 (16.7%) → 0/6 (0.0%) | 7.50 → 11.17 | 8.5 → 12.5 | 4–15 |

The principal competent win rates were Easy 12.5%, Normal 12.5%, Hard 8.3%. Hard met the proposed win-rate band. Easy and Normal fell short of their bands. None of the six competent independent trials per difficulty ended in a player win. Inactive controls won zero matches on both builds. The mean finishing places went in the opposite direction from the intended ordering, so difficulty progression remains unverified. Easy bots picked up 70,806 → 76,544 natural pieces per match and field-wide pulses rose from 56.9 to 83.4. Continuous movement and denser contests appear to have offset Easy’s slower reactions and shorter chases.

| Strategy | Principal trials | Wins | Mean place | Mean final mass | Mean hits |
| --- | --- | --- | --- | --- | --- |
| Inactive | 12 | 0 → 0 | 20.00 → 20.00 | 20 → 20 | 0.0 → 0.0 |
| Beginner | 12 | 0 → 0 | 10.50 → 10.75 | 2519 → 2530 | 0.0 → 0.0 |
| Collector | 12 | 3 → 1 | 4.75 → 8.00 | 8602 → 5858 | 5.0 → 5.9 |
| Energy | 12 | 4 → 0 | 7.08 → 11.58 | 7498 → 3357 | 7.2 → 7.9 |
| Hunter | 12 | 2 → 2 | 8.92 → 6.67 | 4711 → 9091 | 7.2 → 8.0 |
| Defensive | 12 | 2 → 1 | 8.50 → 7.42 | 7400 → 5067 | 5.1 → 5.2 |
| Salvage | 12 | 1 → 3 | 7.92 → 7.25 | 6641 → 6949 | 6.4 → 6.6 |
| Balanced | 12 | 0 → 1 | 9.00 → 9.25 | 5185 → 5241 | 6.5 → 6.8 |

### Camera and match rhythm

Values compare RC4 → RC5. Camera rows cover the competent cohort. The fair seeded opening occasionally puts a rival in view immediately. Meaningful encounters require sustained visibility and proximity even when they start on the first sample.

| Viewport | Trials | Median first visible rival, s | Median first meaningful rival, s | 90th percentile first meaningful rival, s | Median encounter duration, s | 90th percentile duration, s |
| --- | --- | --- | --- | --- | --- | --- |
| All | 72 | 0.0 → 0.0 | 0.0 → 0.0 | 10.8 → 5.7 | 1.75 → 2.00 | 4.75 → 5.25 |
| 1366x768 | 36 | 0.0 → 0.0 | 0.5 → 0.0 | 11.4 → 7.0 | 2.00 → 2.25 | 4.75 → 5.25 |
| 390x844 | 36 | 0.0 → 0.0 | 0.0 → 0.0 | 5.8 → 4.5 | 1.75 → 2.00 | 4.50 → 5.00 |

| Viewport | No rivals visible, s | Exactly one visible, s | Two or more visible, s | Mean longest empty interval, s | 90th percentile longest gap, s | Empty intervals of 20 s or more | Meaningful encounters/minute |
| --- | --- | --- | --- | --- | --- | --- | --- |
| All | 170.7 → 160.2 | 90.6 → 80.6 | 38.6 → 59.2 | 27.1 → 28.2 | 40.6 → 40.7 | 1.3 → 1.5 | 6.92 → 9.36 |
| 1366x768 | 173.4 → 164.7 | 90.5 → 78.6 | 36.1 → 56.7 | 28.0 → 29.6 | 40.8 → 39.6 | 1.2 → 1.7 | 6.97 → 9.39 |
| 390x844 | 168.0 → 155.7 | 90.7 → 82.6 | 41.2 → 61.8 | 26.1 → 26.7 | 35.5 → 41.2 | 1.3 → 1.2 | 6.87 → 9.33 |

In the principal cohort, competent players spent 170.7 → 160.2 seconds with nobody visible. Meaningful encounters averaged 6.92 → 9.36 per minute. The independent cohort measured 181.0 → 155.5 quiet seconds and 6.32 → 10.93 meaningful encounters per minute. In the principal cohort, the longest quiet spell averaged 27.1 → 28.2 seconds and the number of spells of 20 seconds or more was 1.28 → 1.46. The prolonged-gap target remains open. The final minute still showed more time with multiple rivals in view.

| Match seconds | No rival visible, s | Two or more rivals visible, s | Player mass at end | Total pulses | Mean visible rivals |
| --- | --- | --- | --- | --- | --- |
| 0–30 | 22.5 → 21.6 | 0.9 → 2.0 | 332 → 311 | 1.8 → 3.6 | 0.28 → 0.37 |
| 30–60 | 21.8 → 19.6 | 1.1 → 3.5 | 751 → 723 | 8.5 → 10.1 | 0.32 → 0.52 |
| 60–120 | 38.1 → 34.0 | 4.4 → 10.4 | 1909 → 1869 | 15.9 → 18.1 | 0.45 → 0.71 |
| 120–180 | 32.2 → 30.1 | 8.7 → 13.3 | 3128 → 3454 | 16.0 → 16.9 | 0.66 → 0.86 |
| 180–240 | 29.1 → 27.6 | 11.0 → 15.0 | 4037 → 4762 | 16.2 → 17.9 | 0.76 → 0.97 |
| 240–300 | 27.0 → 27.2 | 12.5 → 15.0 | 6668 → 5908 | 16.3 → 17.3 | 0.83 → 0.95 |

The mean nearest-rival surface gap was 1035.02 → 1028.99 units. Mean visible natural resources were 75.43 → 77.19 and live hotspots held about 21.7 active pieces on average. The mean number of magnets at a marked signal was 0.34 → 1.13. Signals stayed active for 115.00 → 72.57 seconds per match in total. Disappearance on depletion shortens that timer. Every principal and independent RC5 trial finished with 2,880 active natural resources. The cache stayed within 176 regions, with zero duplicate natural payouts across the recorded cohorts.

Per match, the model averaged 17.08 → 14.23 seconds with a visible charged rival and 14.30 → 15.53 seconds with visible eligible salvage within 630 units. Possible attack windows were 7.42 → 7.69 in number and 4.08 → 4.16 seconds total, based on full charge, range, visibility and legal targets. The player landed 6.25 → 6.75 hits. Hazard contact was 10.56 → 10.85 seconds and sampled player rank changes were 120.08 → 128.33. All participants together fired 74.76 → 84.01 pulses per match, with a mean first pulse at 24.11 → 20.88 seconds.

### Combat reward

Combat kept the same physical damage function. The distribution shifted toward more contested claims. The data below cover the competent principal cohort.

| Combat measure | RC4 → RC5 |
| --- | ---: |
| Damaged targets per match | 68.0 → 83.2 |
| Mass detached per match | 124201.4 → 128427.5 |
| Third-party salvage per match | 13552.5 → 22734.9 |
| Original-victim reclamation per match | 649.1 → 771.2 |
| All resolved pulses followed by credited salvage | 4,628/5,383 (86.0%) → 5,351/6,049 (88.5%) |
| All resolved pulses with zero own recovery | 755 → 698 |
| All attackers · damaging pulses followed by credited salvage | 4628/4714 (98.2%) → 5351/5511 (97.1%) |
| All attackers · damaging pulses with zero own recovery | 86 → 160 |
| All attackers · mean recovered mass per damaging pulse | 1620.6 → 1332.8 |
| All attackers · median recovered mass per damaging pulse | 734 → 610 |
| All attackers · median wait to first claim, s | 0.55 → 0.55 |
| All attackers · subsequent damage around salvage | 11.0 → 13.3% |
| All attackers · mean subsequent mass lost when wounded | 2883.4 → 2187.1 |
| Player · damaging pulses followed by credited salvage | 446/450 (99.1%) → 477/486 (98.1%) |
| Player · damaging pulses with zero own recovery | 4 → 9 |
| Player · mean recovered mass per damaging pulse | 1394.4 → 1264.2 |
| Player · median recovered mass per damaging pulse | 643 → 596 |
| Player · median wait to first claim, s | 0.55 → 0.55 |
| Player · subsequent damage around salvage | 12.4 → 12.8% |
| Player · mean subsequent mass lost when wounded | 2277.2 → 2652.8 |
| Detached mass recovered by own credited claims | 85.4 → 79.4% |
| Pulses with a paid claim before 20 units of movement | 1.4 → 0.2% |
| Mean actual target diameter loss | 36.7 → 35.4% |

The observer groups credited damage by pulse. Recovered mass is the attacker's own credited share. A late pulse can be cut short by the five-minute limit. Attacker exposure is follow-on theft within the next ten seconds and 800 units of the prior impact, a proxy for vulnerability around the loot. The no-travel count measures displacement to the first pickup inside 20 units. It does not establish how much of that pulse was collected while stationary.

[Paired RC4 trials](evidence/rc5/rc4-paired.jsonl.gz) · [Paired RC5 trials](evidence/rc5/rc5-paired.jsonl.gz) · [Independent RC4 trials](evidence/rc5/rc4-validation.jsonl.gz) · [Independent RC5 trials](evidence/rc5/rc5-validation.jsonl.gz)

Reproduce the complete RC5 cohorts with `npm exec -- tsx scripts/measure-gameplay.ts` and `MAGNET_COHORT=validation npm exec -- tsx scripts/measure-gameplay.ts`. Use the same two measurement scripts on the baseline worktree to reproduce the matched inputs. `MAGNET_START`, `MAGNET_STOP` and `MAGNET_STRIDE` select subsets of each fixed cohort.

## Browser play and performance

### Automated and performance checks

| Check | Fresh RC4 baseline | RC5 candidate |
| --- | --- | --- |
| `npm ci` with a writable package cache | Passed on Node 24.22.1 | Passed on Node 24.22.1 |
| Unit tests | 138 passed | 152 passed |
| TypeScript | Passed | Passed |
| Chromium Playwright, one worker | 13 passed | 14 passed |
| Vite production build | Passed | Passed |
| Main app script, minified and gzip | 123.76 and 43.10 kB | 133.49 and 46.73 kB |
| Phaser script, minified and gzip | 1,208.08 and 332.18 kB | 1,208.08 and 332.18 kB |

Vite printed its large-chunk advisory for the Phaser bundle on the final build. Chromium `156.0.8078.79` exercised real steering, themed assets, pause and resume from the production preview without uncaught errors. The desktop and touch suites also verified Arena, Endless, tutorial, a full match and replay, 50 repeated replays, multitouch attack and steering, and HUD layout in both themes at nine sizes including 320 × 568, 390 × 844, 844 × 390, 1366 × 768, and 1920 × 1080. Retained JavaScript heap after 50 replays was about 1 MB in the RC5 Chromium run.

All 45 matrix routes and 11 navigation fixtures had zero fast turns, reversals, avoidance-side changes and stuck recoveries. Fixtures include heat, cold, water, acid, Flux, walls, overlapping hazards, pursuit, and dense collection. [Navigation matrix](evidence/rc5/navigation-matrix.jsonl) · [Fixtures](evidence/rc5/navigation-fixtures.jsonl)

Fresh headless Canvas timing used the same 8.2-second dark Endless route, host, viewport and quality on each build, with other match workers paused. CPU time is from Phaser's frame start to canvas render completion. Frame interval measures actual delivered cadence. Values are RC4 → RC5 in milliseconds. Model-step timing in the raw trials includes replenishment and varies with the concurrent browser and test load.

| Viewport | Median CPU | p95 CPU | Median frame interval | p95 frame interval | Peak natural sprites |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1366 × 768 Balanced | 1.5 → 1.3 | 5.4 → 4.6 | 16.6 → 16.7 | 20.6 → 20.0 | 45 → 46 |
| 390 × 844 Balanced | 1.4 → 1.3 | 5.0 → 4.8 | 16.7 → 16.7 | 20.3 → 20.1 | 46 → 44 |
| 844 × 390 Low | 1.4 → 1.3 | 5.8 → 4.4 | 16.7 → 16.7 | 21.3 → 19.9 | 45 → 43 |

The staged stress run had seven giants, simultaneous pulses, and preloaded debris. It reached 1,024 active fragments, 104 pending, and 1,009 lazily allocated shard sprites in view, with an 8.20 ms p95 scene update. The stress fixture pauses replenishment and records scene update cost. [RC4 browser profile](evidence/rc5/browser-profile-rc4.json) · [RC5 browser profile](evidence/rc5/browser-profile-rc5.json) · [Staged stress trace](evidence/rc5/browser-stress.json)

### Recordings

Normal Arena seed `11216` ran from countdown to Results on both builds, using a visible-information controller that sent actual mouse and Space inputs. The desktop excerpts are uncut Canvas captures from those game-clock windows. Video duration can differ from the simulation clock because of dropped or buffered browser frames. Title, rank and result details are captured separately in the HUD stills. Both mid-match segments and both last minutes contain a successful hit. In the 390 × 844 Dark Low runs, CDP touch inputs steered the standard floating joystick. The updated mobile run showed two rivals together and collected 40 salvage by 50 seconds. [Sampled browser state](evidence/rc5/browser-play.json)

| Scenario | RC4 | RC5 |
| --- | --- | --- |
| 0–60 seconds, ordinary desktop opening | [Video](evidence/rc5/rc4-opening.webm) | [Video](evidence/rc5/rc5-opening.webm) · [HUD](evidence/rc5/rc5-opening.webp) |
| 94–125 seconds, ordinary mid-match play | [Video](evidence/rc5/rc4-midmatch.webm) | [Video](evidence/rc5/rc5-midmatch.webm) |
| 240–300 seconds, final minute and result | [Video](evidence/rc5/rc4-ending.webm) · [Results](evidence/rc5/rc4-results.webp) | [Video](evidence/rc5/rc5-ending.webm) · [Results](evidence/rc5/rc5-results.webp) |
| 0–50 seconds, touch exploration | [Video](evidence/rc5/rc4-mobile.webm) | [Video](evidence/rc5/rc5-mobile.webm) · [HUD](evidence/rc5/rc5-mobile.webp) |

In ordinary Normal seed `13547`, a signal appeared at 27.8 seconds with an initial badge of 3,407 m. The player followed it and saw two rivals at the marked patch as it depleted. [Video](evidence/rc5/signal-browser.webm) · [Direction cue](evidence/rc5/signal-offscreen.webp) · [Contested patch](evidence/rc5/signal-contest.webp) · [Signal trace](evidence/rc5/signal-browser.json)

In the staged combat diagnostic, a real Space release resolved the RC4 giant hit and a second magnet collected 145 while the attacker collected 1,742. In the separate tactical diagnostics, the player escaped a Hunter with real WASD input, a large bot retreated from a charged small player, and real mouse input recovered 126 mass after a 3,327-mass theft in a pre-positioned scenario. These fixtures establish the individual behaviors exercised. [Giant combat and salvage video](evidence/rc5/staged-combat.webm) · [Impact still](evidence/rc5/staged-giant-impact.webp) · [Guard and salvage](evidence/rc5/staged-giant-guard.webp) · [Combat trace](evidence/rc5/staged-combat.json) · [Hunter pursuit](evidence/rc5/staged-pursuit.webp) · [Giant retreat](evidence/rc5/staged-retreat.webp) · [Severe damage](evidence/rc5/staged-severe-damage.webp) · [Tactical traces](evidence/rc5/staged-tactics.json)

## Physical playtest and open checks

Use `npm run build` and `npm run preview -- --host 0.0.0.0`, then open the host's LAN address and preview port on a phone on the same network. Record the device, browser, theme, quality preset and orientation.

1. Play three fresh Normal Arena matches and try both a collection route and a route toward a public signal. Record first contact, quiet stretches longer than 20 seconds, whether the signal is worth following, and the final-minute decisions you faced.
2. Play Easy and Hard with the same style. Try an opportunistic attack as a small magnet, then try surviving and regrowing after a major loss. Observe targeting clarity, salvage competition, rank notices and whether each result statistic matches what happened.
3. In both orientations and themes, steer with one thumb while arming, aiming and releasing with a second touch. Check accidental movement, reach to the controls, legibility, and comfort. Play several consecutive matches on Balanced and Low and note pacing, responsiveness, heat and battery use.

The scripted and emulated runs establish repeatable behavior on this host. Human balance, enjoyment, physical-phone ergonomics, thermals and battery use require direct playtesting. Final gameplay feel requires product-owner approval.
