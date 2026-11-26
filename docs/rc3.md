# MAGNET RC3 verification

RC3 builds on `ed6df10` on the open RC2 branch. The changes affect Canvas presentation and bot decisions. Arena size, camera, movement speed cap, resource population and distribution, pickup geometry and payouts, combat, hazard rules, and player input remain at their RC2 settings.

## Where the twitch came from

At the edge of a hazard, RC2 replaced the strategic target with a point directly outward. One step often put the bot back outside the threshold, where the prior target pointed back into the hazard. In the staged heat route, the bot traveled 3,680 world units in eight seconds and made no progress past the hazard. Its actual travel direction reversed by more than 90° on 396 individual simulation steps. The fixed-target cold, water, acid, and large Flux routes reproduced the same behavior.

The nearby-opponent fixture isolated a second source. The preferred opponent and pursuit point could change each step. It recorded 311 destination jumps greater than 50 world units and 29 abrupt reversals. The dense scrap fixture traveled straight through its cluster and collected all 120 pickups, so ordinary objects did not account for the avoidance loop. The wall-side route amplified boundary switching. Separately, the name renderer always tried above first, which could move a label back up after a single clear frame.

## Navigation

- Bots retain a strategic destination and use a separate route with local waypoints. They look ahead 0.7 simulated seconds at the 460-unit speed cap.
- The planner scores both sides of an obstruction, checks walls and neighboring hazard circles, and follows a committed arc. Minimum commitment is 0.8 seconds. Returning to direct travel requires a clear sightline with 60 additional units of clearance. A growth change or blocked waypoint can trigger a replan.
- Escape picks a legal outward direction. A blocked route uses a bounded lower-risk search and requests a new destination when necessary. A one-second progress window detects stalls. It ignores idle and arrivals.
- Opponent selection reevaluates every 0.25 seconds with a 20% utility advantage required to replace a valid target. Pursuit uses separate approach and release distances. Shortest-angle steering limits turns to 240°/s in normal movement and 360°/s on escape or dodge. Sharp turns slow near hazards and walls to keep the travel direction continuous. Clear routes still use the shared 460 cap.
- Small magnets can still cross Flux devices, and cold without a tactical threat stays traversable. Actual movement determines the sprite heading. Attack warnings use their own aim, and labels keep the last readable side.

## Controlled movement comparison

All cases began at the same staged locations and used the same 60 Hz steps. “Pass” means crossing a line 700 world units beyond the central obstruction within eight seconds. An abrupt reversal exceeds 90° in one step. The raw traces retain position, velocity, strategic destination, local waypoint, mode, and heading each step.

| Fixture | RC2 abrupt reversals | RC3 abrupt reversals | Pass time RC2 → RC3 | Avoidance entries RC2 → RC3 |
| --- | ---: | ---: | --- | ---: |
| Heat | 396 | 0 | Beyond 8 s → 3.82 s | 198 → 1 |
| Cold with nearby opponent | 392 | 0 | Beyond 8 s → 3.85 s | 196 → 1 |
| Water | 392 | 0 | Beyond 8 s → 3.77 s | 196 → 1 |
| Acid | 388 | 0 | Beyond 8 s → 3.72 s | 194 → 1 |
| Flux at mass 400 | 387 | 0 | Beyond 8 s → 3.72 s | 194 → 1 |
| Wall-side heat | 191 | 0 | 6.43 s → 3.77 s | 95 → 1 |
| Paired heat and acid | 396 | 0 | Beyond 8 s → 3.82 s | 198 → 1 |
| Tactical pursuit | 29 | 0 | 3.63 s → 3.50 s | — |

The heat fixture spent 5.80 seconds with less than 20% of normal displacement over the preceding second in RC2 and zero in RC3. Pursuit went from 38.875 large strategic jumps per second to 0.125. Both dense-scrap runs collected 120 pickups, and both pursuit runs resolved one attack. Across the 11 fixtures, distinct turns sharper than 90° within a quarter-second dropped from 185 to zero. The diagnostic counts at most one event per quarter-second.

The matrix covered 45 runs across masses 20, 100, 400, 1,500, and 4,352. Passes rose from 7/45 to 45/45 with zero abrupt reversals and zero avoidance-side switches. Turns sharper than 90° within a quarter-second dropped from 1,181 to zero. The Normal giant had 0.23 seconds of contact in the overlapping fixture after it had passed and accepted a new route. Regression tests take each controlled detour to its intended destination and isolate a sharp turn near the wall.

[Heat recording](evidence/rc3/heat-detour.webm) · [Cold recording](evidence/rc3/cold-detour.webm) · [Fixture metrics before](evidence/rc3/navigation-before.jsonl) · [After](evidence/rc3/navigation-after.jsonl) · [Matrix before](evidence/rc3/navigation-matrix-before.jsonl) · [After](evidence/rc3/navigation-matrix-after.jsonl) · [Per-step traces before](evidence/rc3/navigation-before-traces.jsonl.gz) · [After](evidence/rc3/navigation-after-traces.jsonl.gz).

The recordings use the real browser simulation with staged fixtures and an overlay that traces the bot’s measured positions. The world and all input and attraction rules are the production code.

## Pickup presentation

The generated atlas uses a colored falloff and a polished inner body. Ordinary parts keep the same outline as they shrink into beads and distant luminous dots. Gold stays angular. Energy uses a crimson body, a pale lightning mark, and a segmented orbit. The orbit breathes on a 1.4-second cycle and rotates at 75°/s, offset by resource identity. Low and reduced motion preserve the static mark and halo. Canvas draws baked textures and pooled effects.

Sizing uses the opaque geometry in the atlas independently of the transparent frame. At the observed giant mobile zoom of 0.2034, projected target core diameters were 3.8, 7.5, and 9.5 CSS pixels for ordinary, gold, and energy. Respective padded frames were 7.6, 11.7, and 19.0 pixels. In matched raw 320 × 568 screenshots, a chroma threshold across the central row detected about 2, 2, and 2 visible pixels in RC2 and 6, 8, and 11 in RC3 in each theme. The threshold captures some colored fringe, so those spans are separate from opaque-core diameters. The pale bolt and ring are visible in the enlarged original pixels.

Balanced and High draw motion trails only when the same visible slot and generation move within the physical pull speed. Collections emit once through the atlas effects pool. Energy travels toward its collector, lights its poles, and animates the meter and actual gain. Full charge shows READY. Subdued floor marks and the thinner field keep collectibles readable. The narrow HUD keeps rankings clear of the Pause and theme buttons.

These browser screenshots use matched seeds, camera positions, masses, and staged pickup layouts. The charge screenshot uses a live collection.

| View | Evidence |
| --- | --- |
| 1366 × 768, start mass, light | [Desktop](evidence/rc3/desktop-20-light.webp) |
| 390 × 844, mass 100, dark | [Portrait](evidence/rc3/portrait-100-dark.webp) |
| 1920 × 1080, mass 400, dark, High | [Widescreen](evidence/rc3/wide-400-dark.webp) |
| 844 × 390, mass 1,500, light | [Landscape](evidence/rc3/landscape-1500-light.webp) |
| 320 × 568, max growth | [Light with Low and reduced motion](evidence/rc3/giant-4352-light.webp) · [Dark with Balanced](evidence/rc3/giant-4352-dark.webp) · [Actual pixel crops enlarged](evidence/rc3/giant-pickup-details.webp) |
| Live collection | [Attraction and collection clip at 0.75× speed](evidence/rc3/collection-trails.webm) · [Ready HUD and pole light](evidence/rc3/energy-ready.webp) |
| Generated assets | [Atlas contacts](evidence/rc3/atlas-contact.webp) · [Scale contacts](evidence/rc3/scale-contact.webp) · [Manifest](../brand/asset-manifest.json) |

## Competitive comparison

Two runs used the same 126 seed, difficulty, and strategy combinations. Bot pickups per minute are the mean per bot. Bot attack totals include misses. Hazard samples count contact per bot at half-second intervals.

| Difficulty | Player wins RC2 → RC3 | Mean player rank RC2 → RC3 | Bot pickups/min RC2 → RC3 | Total bot attacks RC2 → RC3 | Bot hazard samples/match RC2 → RC3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Easy | 16/42 → 2/42 | 2.64 → 3.88 | 552 → 736 | 226 → 298 | 280 → 106 |
| Normal | 3/42 → 0/42 | 3.48 → 4.64 | 682 → 992 | 359 → 470 | 78 → 95 |
| Hard | 5/42 → 0/42 | 3.48 → 4.90 | 652 → 1,106 | 310 → 462 | 76 → 102 |

**Balance changed materially.** With less time lost to oscillation, bots collected and attacked more. The scripted player won two Easy matches and zero Normal or Hard matches. Mean player placement worsened across all three difficulties, with Hard producing the lowest finishes. Human difficulty validation remains open.

Peak bot mass by difficulty was 4,328 / 5,938 / 5,950 before and 5,108 / 7,127 / 7,396 after, with physical growth still capped at 12×. Players reached that cap in 20 and 16 runs respectively. Match-end active slots ranged from 716–720 before and 715–720 after against the same 720 target. Both sets peaked at 80 cached regions and recorded zero duplicate slot-generation claims. Player hazard-kind observations totaled 389 and 394. The existing world, growth, and collection-only diagnostic scripts also ran against both revisions.

[126 matches before](evidence/rc3/matches-before.jsonl) · [126 matches after](evidence/rc3/matches-after.jsonl).

## Performance and verification

Headless Chromium 156 on the three allocated AMD EPYC 9V74 CPUs. Matched dark-theme Canvas scenes contained 221–271 visible staged resources at maximum growth. The scene held the same positions to isolate drawing cost. Each row is a seven-second sample after warmup, with CPU measured from Phaser's pre-step through post-render callback. The results are cloud browser timings.

| Viewport and tier | CPU median RC2 → RC3 | CPU p95 RC2 → RC3 | Frame cadence p95 RC2 → RC3 |
| --- | ---: | ---: | ---: |
| 1366 × 768 Balanced | 1.2 → 1.2 ms | 2.1 → 2.0 ms | 17.1 → 17.6 ms |
| 320 × 568 Balanced, DPR 2 | 1.0 → 1.0 ms | 1.6 → 1.8 ms | 17.5 → 17.1 ms |
| 320 × 568 Low, DPR capped at 1 | 0.9 → 1.1 ms | 1.4 → 1.5 ms | 17.1 → 17.5 ms |
| 390 × 844 High, DPR 2 | 1.2 → 1.3 ms | 2.0 → 1.9 ms | 17.4 → 17.5 ms |

Median frame cadence was 16.7 ms in all samples. The workshop atlas increased from 11.3 kB to 58.1 kB and the separate Phaser chunk is still 1,208 kB. Sprite pools remain bounded to 600, 300, or 120 transient effects by quality tier. Mobile temperature and battery use still need a physical-device check.

[Raw profile before](evidence/rc3/profile-before.json) · [After](evidence/rc3/profile-after.json).

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e -- --project=chromium --workers=1
npm exec -- tsx scripts/measure-navigation.ts
npm exec -- tsx scripts/measure-navigation.ts --matrix
MAGNET_TRIALS=126 npm exec -- tsx scripts/simulate-matches.ts
```

On this host `PW_CHROMIUM_PATH=/usr/bin/chromium` selected system Chromium. All 121 unit tests, ten Chromium tests, typecheck, and production build passed. The unit suite includes the 30-minute conservation soak. The Chromium suite includes reduced-motion energy at giant zoom, ready without mass gain, nine HUD sizes, two-pointer attack, Arena and Endless replay, and 50 restarts. Firefox and WebKit are unverified for RC3.

## Physical-phone checks still open

- Play both themes in portrait and landscape at mass 20 and at giant scale. Find energy among ordinary orange, pink, gold, heat, and attack warnings.
- Test charge readiness, haptics, and two-thumb release while steering. Repeat with reduced motion and Low.
- Run a full match in Balanced on representative iOS and Android devices. Observe dropped frames, sustained responsiveness, temperature, and battery. Compare human wins before tuning difficulty again.
