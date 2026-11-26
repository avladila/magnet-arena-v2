# MAGNET RC6 · Magnetic Chaos

RC6 gives MAGNET a cast of enamel-and-steel characters in a working scrapyard. It sharpens the order in which players see threats, energy, gold, and ordinary scrap, then ties movement, collection, damage, and recovery effects to their existing simulation events. The release extends [PR #8](https://github.com/avladila/magnet-arena-v2/pull/8) from RC5 at `a35b9455163c73bc3dd0db24e6155e59f17d8d4d`. Main was `318656d50c9581201e4c1b873f0ae2ad33c91a64` at the start of the work.

## Before and after

The RC5 opening was dominated by a regular grid and repeating corner brackets. Its strongest visual elements were its character faces and colored poles. Shell proportions varied less at distance, giant hits shared much of the smaller impact vocabulary, and the low-zoom pickups needed a clearer relationship between glow and core. The HUD and workshop props also looked like separate systems. Fresh RC5 desktop and touch captures established the reference for the floor, body motion, and collection at actual screen sizes. [RC5 opening](evidence/rc6/baseline/opening.webp) · [RC6 opening](evidence/rc6/opening.webp) · [Paired stills](evidence/rc6/changes.webp)

The art uses cut steel, asymmetrical faces, deep contour ink, and hard enamel highlights. The world uses quiet plates, low-contrast seams and local machinery, with the strongest contrasts on magnets, hazards and resources. The title and results compositions use the same illustrated cast at larger scale. The app mark carries the red and blue poles into the title. [Master art direction](brand.md) · [Illustrations](evidence/rc6/artwork.webp) · [Title](evidence/rc6/title.webp)

## Character artwork and motion

All 20 roster identities have their own combination of backplate, jaw clearance, pole lengths, cut ends, eyes, mouths, accent and insignia. The shell shows the structural change at each of the 20, 50, 100, 400, 1,500 and 4,352 mass thresholds. Tiny uses a thin open shell. Collector adds fittings. Brawler grows shoulders and bolted plates. Heavyweight encloses more of the chest. Titan adds a reinforced back and thicker tips. Colossus adds deeper corner plates around the same red-and-blue jaw. A loss selects the actual lower stage immediately, with existing eased visual scale and a reaction at the point of impact. [Roster](evidence/rc6/roster.webp) · [All 120 shells](evidence/rc6/all-growth-stages.webp)

The ten readable expressions cover idle, travel, collection, charge, attack, surprise, injury, heat, cold and corrosion. Painted eyes and mouths share the shell’s turn, stretch and recoil transform with the two anchored pupils. Attack and damage get priority over travel and pickup expressions. Heat, brittle and corrosion remain visible in the HUD and arena treatments when their face is preempted. The character’s face and pole light can display different states at the same time. [All 200 expressions](evidence/rc6/all-expressions.webp) · [Hazard and damage states](evidence/rc6/changes.webp)

| Cue | Implemented treatment |
| --- | --- |
| Breathing and blink | Idle breath runs at 2.65 rad/s with 1.8% stretch at base size and 0.8% at giant size. Blink lasts 120 ms, with participant offsets on periods around 3.7–4.9 s. |
| Takeoff, travel, settle | 120 ms initial compression and 130 ms settle. Sustained travel stretches along the existing eased heading, with less stretch on heavy shells. Pursuit adds 2.2% and escape adds 3.4% along travel. Escape can add a sweat mark. |
| Gaze and collection | Pupils ease at a rate of 18/s. The latest real pickup can hold gaze and the collection face for 290 ms. |
| Growth | A 260 ms plate snap and rivet spark follow a shell-stage increase. The existing milestone effect lasts 340 ms. |
| Recoil and injury | Release recoil fades over 220 ms. A hit can hold the reaction face for 400 ms. A single loss of at least 10 mass and 24% of starting mass can leave visible injury for up to 12 s or until two thirds of the lost mass is recovered. |

## Resources and magnetic effects

Ordinary scrap uses ten colored metal cores, specular highlights and soft bounded glows. The angular gold nugget has a broad yellow face and a light facet. Energy has a pale bolt inside crimson enamel, a grounded dark edge, and a segmented crimson orbit. Combat salvage uses separate steel shapes at value thresholds 5, 20 and 70. Landed eligible pieces above the middle threshold can catch white and yellow flashes. Temporary steel shell plates have muted enamel and no collection glow. [Pickup scale matrix](evidence/rc6/pickup-scales.webp) · [Giant zoom in Low and reduced motion](evidence/rc6/pickup-max-low.webp)

| Resource | Base core (world units) | Minimum target core (CSS px) | Maximum core (world units) | Maximum glow frame (CSS px) |
| --- | ---: | ---: | ---: | ---: |
| Ordinary | 10 | 3.8 | 28 | 23 |
| Gold | 15 | 7.5 | 45 | 28 |
| Charge cell | 18.5 | 10.4 | 54 | 36 |

Core targets are subject to the world-space cap. Balanced and High can animate up to 96 energy orbits with a 1.4 s breath and 75°/s rotation. Low, reduced motion and cells beyond the animated orbit budget use the combined core-and-ring cel. Gold and energy glints are staggered per piece at 3.1 s and 2.5 s. Balanced and High allow six and ten pickup trails per render, with a 45 ms interval per piece. Natural glints, gold sparks, and energy streaks use the shared effect pool and last 150, 270 and 210 ms respectively. The character’s 145 ms trail samples displacement and follows its previous positions. Claiming real salvage briefly pulls small cosmetic trails into the shell.

Stationary reach ticks in the standard field show the real radius. The two brighter jaw curves follow the poles and use an eased inner envelope. Collecting raises their intensity, full charge adds warm light, heat thins and dims the outer field, and brittleness gives it a cool treatment. The field disrupts for 220 ms when struck. A separate cyan guard ring shows theft protection. Low keeps reach marks and charge cues. Reduced motion keeps a steady field, readable faces, a static bolt and ring, the footprint of each hazard, and the essential combat telegraphs.

## Combat presentation

Preparation pulls the shell back and inks the direction, sector edge and locked warning. Release adds a white flash through a red and yellow wave. The impact reads the resolved **diameter** loss. Scale, salvage travel and salvage eligibility still come from the model. Heavy reactions and fragments play around the hit, and the presentation uses local recoil instead of camera motion. Compact cyan guard, pale core-protection, and orange miss cues distinguish unsuccessful releases. Damage labels show the measured mass loss, with a BRITTLE annotation when that modifier applied.

| Actual diameter loss | Accent duration | Shell plates before quality limit | Presentation |
| --- | ---: | ---: | --- |
| Under 10% | 140 ms | 0 | Short contact spark |
| 10% to under 25% | 220 ms | 3 | Local wave and a short crack |
| 25% to under 40% | 310 ms | 8 | Wider wave and longer cracks |
| 40% or more | 390 ms | 14 | Double wave, starburst and larger fracture |

Fracture plates live 360–525 ms. Per-hit limits are 3, 10 or 14 in Low, Balanced and High, with a shared 72-entry pool. Damage numbers use 18, 22 or 26 CSS pixels by impact scale and the shared 800 ms fade. Real salvage is still drawn from the 1,024-chunk model pool.

The matched giant fixture left the rival at 1,051 from 4,352 mass, detached 3,301, reduced its diameter by 50.01%, threw 24 collectible chunks, and preserved its guard window. In the follow-up both builds showed 2,021 mass collected by the attacker and 145 by a third magnet. The brittle fixture resolved the same 1,960 loss and 21 real chunks on both builds. The simultaneous fixture recorded 1,114 outgoing and 293 incoming mass loss. Guard, core protection and miss changed no victim mass. [RC5 combat measurements](evidence/rc6/baseline/combat.json) · [RC6 combat measurements](evidence/rc6/metrics/combat.json) · [Giant and competing claimant trace](evidence/rc6/metrics/giant.json)

## Environment

The floor uses 1,170 × 520 world-unit plates with offset rows, five-unit seams, service lanes, fasteners, scuffs, and a striped 24-unit perimeter inside the existing boundary. Six feathered district stamps sit between the surface and gameplay artwork. Assembly uses teal service decks and presses, Foundry uses warm panels and stacks, Recycling uses green bays and crates, Cooling uses pale pipework, Chemical Works uses yellow-green containment markings, and the outer Salvage Fields use subdued rusty plates. Decorations stay at stable coordinates and the middle layer gives them a faded, ground-integrated treatment. Per visible district, Low draws two props, Balanced four, and High six. [Scenery sheet](evidence/rc6/scenery.webp)

| Hazard | Operational artwork | Overlay period |
| --- | --- | ---: |
| Heat | Furnace with grating, orange exhaust and a hotter face/status | 0.64 s |
| Water | Enclosed blue corrosion pool, changing ripples and droplets | 1.8 s |
| Acid | Yellow-green vat, chemical signs and bubbles | 1.64 s |
| Cold | Reinforced cryogenic deck with frost vents, ice and brittle response | 2.4 s |
| Flux | Charged purple fins and a drained version during the real discharge interval | 0.92 s |

Each overlay shares four cels. Balanced and High animate at most nine and sixteen visible sites. Low and reduced motion use static hazard art. Footprint outlines use each site’s model radius. Hotspots use quiet cyan segments whose opacity follows strength. The active Salvage Signal uses a yellow floor mark and the existing off-screen direction and distance. The minimap shows the existing signal and only the rivals already visible in the current play area.

## Interface, sound and haptics

Menu surfaces, typography, buttons and HUD use the same cast-metal treatment as the arena. A tall illustration fills one side of the split desktop title. Narrow and short layouts use a wide banner above the controls. The attack button carries text and phase-specific styling through its charge, aim, release, firing and cooldown states. The meter keeps the native exact value over visible segments. The floating joystick has a brighter ring and rim. Results group existing figures under Growth, Combat, Hazards, Energy and Salvage. Ranking, difficulty, settings and replay retain their original interactions. Dark and Light remain selectable and persisted. [Desktop title](evidence/rc6/title.webp) · [Portrait title](evidence/rc6/title-portrait.webp) · [Arena results](evidence/rc6/results.webp)

Short scrap ticks cycle through six pitch offsets, with at least 110 ms between repeated ordinary pickup sounds. Gold uses a ring, charge rises electrically, and ready confirms a full meter. Warning, release, miss, guard, protected core, impact, heavy impact and fracture have distinct envelopes. The sound bus limits concurrent cues to ten, with one shared short noise buffer. Machine cues fade with distance up to 330 world units and run at intervals of 1.25–2.05 s. Their volume takes the master and effects levels. The original 114 BPM, 16-bar track uses a looping bass riff, synthesized clanks and the established two-note motif. Haptics follow actual feedback events at 13 ms for gold, 20 ms for full charge, and 25, 40 or 58 ms for sudden hazards and impacts by severity, where device support and the preference allow. [Soundtrack](../public/soundtrack.ogg)

## Asset inventory and reproduction

| Area | Shipped files and sources |
| --- | --- |
| Character shells | `public/magnets.webp` with the existing `public/magnets.json` layout, 120 frames |
| Faces | `public/faces.webp`, `public/faces.json`, `brand/face-anchors.json`, 200 expressions and 20 blink cels |
| Pickups and effects | `public/workshop.webp`, `public/workshop.json`, 56 frames for pickups, reactions, glints, poles, pupils, loot and cosmetic plates |
| World | `public/scenery.webp`, `public/scenery.json`, 40 frames for five hazards, discharged Flux, animated overlays, eight props and six district stamps |
| Title, icon and outcome art | `public/app-icon.png`, `public/favicon.png`, `public/hero.webp`, `public/hero-portrait.webp`, `public/social.webp`, `public/victory.webp`, `public/defeat.webp` and `public/endless.webp` |
| Illustration and graphic sources | `art-source/assembly-bay.webp`, `scripts/arcade_art.py`, `scripts/scrapyard_art.py`, `scripts/generate-brand-art.py`, `brand/asset-manifest.json`, `brand/roster.json` and `brand/tokens.json` |
| Audio | `public/soundtrack.ogg`, `scripts/generate-soundtrack.py`, `src/audio.ts` and the cue table in `brand/tokens.json` |

The assembled scrapyard backdrop is an original ImageGen source plate. All playable shells, faces, effects, hazards and scenery are generated locally. The bundled plate is the image input for reproducing the title, social, victory, defeat, and Endless compositions. The generation script also makes the review sheets. Previous release artwork and documentation remain in their historical locations. [Frame inventory](../brand/asset-manifest.json) · [Asset documentation](assets.md)

From the repository root, use Python 3 with Pillow 10.1 or later and FFmpeg with `libvorbis`. A clean generation with Pillow 13.0.0 reproduced 23 art files, sheets, and manifests byte for byte.

```sh
python -B scripts/generate-brand-art.py
python -B scripts/generate-soundtrack.py
ffmpeg -y -i /tmp/magnet-soundtrack.wav -c:a libvorbis -q:a 3 public/soundtrack.ogg
```

## Verification

### Gameplay parity and navigation

Six RC5 replays contain 108,000 recorded inputs across all three difficulties and desktop, portrait, and landscape viewports. Each replay advances a complete five-minute Arena match in 18,000 fixed steps. All 186 SHA-256 checkpoints, including the six final states, matched exactly. The checks cover participant and navigation state, attack and damage results, hazard timers, resource claims and generations, salvage, hotspots, Salvage Signals, and ranks. Camera framing supplies the same viewport to the natural resource manager. The model exposes a read-only tactical intent for two poses. [Recorded inputs](evidence/rc6/baseline/input-replays.json.gz) · [RC5 hashes](evidence/rc6/baseline/parity.json) · [RC6 hashes](evidence/rc6/metrics/parity.json)

```sh
npx tsx scripts/verify-presentation-parity.ts verify docs/evidence/rc6/baseline/input-replays.json.gz
npx tsx scripts/measure-navigation.ts
npx tsx scripts/measure-navigation.ts --matrix
```

The 11 standard navigation fixtures and the 45 difficulty × mass × obstacle runs produced byte-identical before-and-after diagnostics, with zero fast turns and zero reversals. These included individual hazards, a wall, paired obstacles, pursuit and dense collection. Retreat and pursuit commitments were also in the fixed replays. [Navigation fixtures](evidence/rc6/metrics/navigation-fixtures.jsonl) · [Navigation matrix](evidence/rc6/metrics/navigation-matrix.jsonl)

### Build, layout and visual checks

| Check | Fresh RC5 | RC6 |
| --- | --- | --- |
| Unit tests | 152 passed | 154 passed |
| Chromium end-to-end | 14 passed | 14 passed |
| TypeScript | Passed | Passed |
| Production build | Passed | Passed |

The browser suite exercises both themes at nine sizes, including 320 × 568, 390 × 844, 844 × 390, 1,366 × 768 and 1,920 × 1,080. It covers two real Chromium touch pointers and an aimed release, the full rankings drawer, replay, native charge state, Low and reduced-motion giant charge cells, hazard training, Results, and mute after hide and resume. Thirty additional layout checks covered title, Settings and Results at the five requested sizes in both themes, including scrolling to their actions. Browser stills cover six physical masses, all three quality presets, both themes, and reduced motion. The review sheets show the six shells for every roster member and the ten expressions on the same authored face anchors. The production bundle also opened and reached illustrated Endless Results without resource or browser errors. Vite reported the existing Phaser bundle size warning. [Menu layout checks](evidence/rc6/metrics/layout.json) · [RC5 check results](evidence/rc6/baseline/checks.txt) · [RC6 check results](evidence/rc6/metrics/checks.txt)

### Rendering performance

Measurements use Chromium 156 headless on the same Linux host. The frame CPU sample spans Phaser pre-step through post-render, with three fixed-size Dark Endless runs and real keyboard steering. Each sample lasts about 8.2 s with 20 participants, 3,600 natural slots and 2,880 active pieces. Frame intervals measure cadence. The profiles and the separate stress diagnostics below use different workloads.

| Viewport and preset | CPU median RC5 → RC6 | CPU p95 RC5 → RC6 | Frame median RC5 → RC6 | Frame p95 RC5 → RC6 |
| --- | ---: | ---: | ---: | ---: |
| 1,366 × 768 Balanced | 1.3 → 1.4 ms | 4.5 → 4.7 ms | 16.7 → 16.7 ms | 19.7 → 20.0 ms |
| 390 × 844 Balanced | 1.3 → 1.3 ms | 4.4 → 4.8 ms | 16.7 → 16.6 ms | 19.9 → 20.3 ms |
| 844 × 390 Low | 1.3 → 1.3 ms | 4.8 → 4.7 ms | 16.7 → 16.7 ms | 20.1 → 20.0 ms |

Balanced CPU p95 rose 4.4% on desktop and 9.1% in portrait, both below the 25% budget. Frame p95 increased by at most 0.4 ms. The existing seven-giant stress fixture hit 1,024 active and 104 pending salvage chunks on both builds and measured 7.5 → 7.4 ms update CPU p95.

The expanded High fixture kept 20 participants, seven starting giants, five overlapping machines in view, simultaneous warnings, a dense moving scrap field, four active hotspots and an active Signal. It registered 115 visible pickups, five animated site overlays, a full 72-plate cosmetic pool, 1,024 real chunks and 105 pending chunks. Two seconds of fixed update calls measured 6.9 ms p95 on RC5 and 6.4 ms in the final RC6 run. An earlier RC6 run measured 10.4 ms, which shows the spread in this short fixture. This measures update CPU including effect preparation, with cadence measured separately above. Cosmetic particles are bounded at 120, 300 and 600. The 50-replay browser check reused one Canvas. Retained JavaScript heap was 1,577,508 bytes in RC5 and 1,359,580 bytes in RC6. [RC5 frame samples](evidence/rc6/baseline/profile.json) · [RC6 frame samples](evidence/rc6/metrics/profile.json) · [RC5 High stress](evidence/rc6/baseline/stress-high.json) · [RC6 High stress](evidence/rc6/metrics/stress-high.json)

### Running-game evidence

The desktop opening, midmatch and ending are live normal Arena capture windows from seed 11216, driven through mouse and Space controls. The capture starts from countdown and reaches Results in each build. The touch clips use Chromium portrait and landscape emulation with real CDP touch inputs and the normal floating joystick. The Signal run follows a naturally selected patch in seed 13547 and has two visible rivals near it. Every gameplay clip is captured from the running Canvas. The title and results reel uses successive live browser frames so it includes the DOM overlay. Clips are silent.

| Recording | RC5 baseline | RC6 Magnetic Chaos |
| --- | --- | --- |
| Main menu, Help, Settings, victory, defeat and Endless | [Video](evidence/rc6/baseline/menus.webm) | [Video](evidence/rc6/menus.webm) |
| First minute of ordinary Arena | [Video](evidence/rc6/baseline/opening.webm) | [Video](evidence/rc6/opening.webm) |
| Midmatch, collection and combat | [Video](evidence/rc6/baseline/midmatch.webm) | [Video](evidence/rc6/midmatch.webm) |
| Final minute | [Video](evidence/rc6/baseline/ending.webm) | [Video](evidence/rc6/ending.webm) |
| Early, middle and giant growth with verified ordinary, gold and energy collection | [Video](evidence/rc6/baseline/collection.webm) | [Video](evidence/rc6/collection.webm) |
| Matched combat scenarios | [Video](evidence/rc6/baseline/combat.webm) | [Video](evidence/rc6/combat.webm) |
| Giant fracture, real salvage recovery and competition | [Video](evidence/rc6/baseline/giant.webm) | [Video](evidence/rc6/giant.webm) |
| Hazard exposure, overlap and recovery | [Video](evidence/rc6/baseline/hazards.webm) | [Video](evidence/rc6/hazards.webm) |
| Contested Salvage Signal | [Video](evidence/rc5/signal-browser.webm) | [Video](evidence/rc6/signal.webm) |
| 390 × 844 mobile portrait | [Video](evidence/rc6/baseline/portrait.webm) | [Video](evidence/rc6/portrait.webm) |
| 844 × 390 mobile landscape | [Video](evidence/rc6/baseline/landscape.webm) | [Video](evidence/rc6/landscape.webm) |

The collection, combat, hazard and outcome fixtures deliberately stage positions, masses, charge, or session time. Collection and battle outcomes use the normal keyboard controls and model. Heat, water, acid, cold and Flux advance their own timers and exposure, including overlapped heat and acid. The outcome reel uses the game’s ranking and results logic. The ordinary runs send inputs through the browser in real time, so their paths and salvage totals can differ. The fixed replay is the basis for exact parity. [Ordinary run samples](evidence/rc6/metrics/arena.json) · [Collection outcomes](evidence/rc6/metrics/collection.json) · [Hazard outcomes](evidence/rc6/metrics/hazards.json) · [Signal direction](evidence/rc6/signal-direction.webp) · [Contested patch](evidence/rc6/signal-contest.webp) · [Live signal trace](evidence/rc6/metrics/signal.json)

## Remaining checks and artistic approval

The RC5 balance study measured 12.5% Easy and Normal competent win rates against their proposed bands. The same cohort still saw a mean longest quiet spell of 28.2 seconds, and spans of 20 seconds or longer were more frequent than in the RC4 comparison. RC6 carries those open gameplay questions forward. Its presentation makes existing events easier to read. [RC5 balance study](rc5-gameplay-feel.md)

The six districts share a common underlying plate construction and a small reusable machinery library. The cast shares a pose system with individual silhouettes and expressions. High quality uses simulated synth cues and a limited animated hazard layer. Product-owner approval is still needed for the background contrast, collection brightness, giant-hit intensity, and soundtrack over several full sessions. Headless Chromium and touch emulation cover the browser behavior reported here. Physical comfort, sustained frame pacing, temperature, sound preference and haptics on actual devices remain for playtest.

### Physical phone checklist

1. Play full Arena matches on a phone in both themes. Check that the bolt and ring stand out at max zoom-out, gold reads immediately, and successive scrap pickups still feel satisfying.
2. Steer around heat, cold and overlapping sites. Observe bot turns, pursuit, recovery and growth from a small shell toward giant scale. Check whether danger, injury, guard, and active charge remain legible when they overlap.
3. Hold Attack with a second finger while steering. Compare a small hit, a giant fracture, and reclaiming salvage. Repeat in Low and with reduced motion. Check whether impact motion and haptics remain comfortable.
4. Rotate during play and revisit title, settings, rankings, victory and defeat. Check the safe areas, control reach, scrolling, and responsiveness in both orientations.
5. Replay several matches with sound and haptics on. Record phone, browser, orientation, graphics level, sustained smoothness, heat, and any cue that becomes irritating. Decide whether the art and audio intensity are ready for approval.
