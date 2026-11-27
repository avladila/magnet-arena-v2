# Visual identity implementation

MAGNET now plays as a black-inked cartoon scrapyard. The browser game uses the new character, hazard, pickup, ability, and menu artwork in Arena, Endless, and training. [Title screen](evidence/visual-identity/title.webp) · [Active scrapyard scene](evidence/visual-identity/scrapyard.webp) · [Mobile captures](evidence/visual-identity/mobile.webp) · [Win and loss screens](evidence/visual-identity/results.webp)

## Character artwork

The generator produces 120 red-and-blue horseshoe shells and 200 transparent face frames for the player and nineteen rivals. Cast members use individual eye proportions, brow and mouth shapes, accent colors, and decals. The six shell stages accumulate scrap, then switch to heavier panels, steel caps and bolts. Shared pupil sprites follow motion and recent pickups. The model's collection, charge, warning, impact, and hazard states drive the performances. Severe wounds show bruising and a patch until enough mass returns or the temporary injury expires. [Ten expressions and six growth stages](evidence/visual-identity/artwork.webp) · [Full roster](evidence/visual-identity/roster.webp) · [Asset inventory](assets.md)

## Readability and motion

The saturated cel palette and ink outlines carry over to the machinery and UI. Quiet floor plates and cached district landmarks set off the pickups. Furnace vents, ice crystals, two liquid shapes, and purple Flux fins distinguish the environmental hazards. At distance, ordinary scrap reads as colored beads, gold keeps its angular shape, and energy keeps the pale bolt and segmented ring. The small giant-scale capture uses Low quality with reduced motion.

The ability's cone displays the current bearing and range. Releasing it brings a short warm flash, a jagged wave, and speed lines. Bigger impacts get a wider fracture and a stronger reaction. The same giant hit in both captures removes 3,301 mass, leaves the defender at 1,051, and creates 24 salvage fragments. The recording uses the real release control and Canvas renderer with the same staged positions and masses. [Matched combat recording](evidence/visual-identity/combat.webm) · [Impact still](evidence/visual-identity/impact.webp)

## Verification

All 138 unit tests, 13 Chromium tests, typecheck, and the production build passed. Browser coverage includes the new face-state and results-art check, desktop and touch controls, both themes at nine viewports, the giant-scale Low-quality energy test, and fifty replays. The browser replay test retained 807,000 bytes of JavaScript heap after garbage collection. All 18 RC4 seeded matches reproduced the same gameplay fields, including population, theft damage, collections, movement outcomes, and rankings.

The runtime imagery is bundled with the game. The gameplay WebP atlases total 847 kB, up from 111 kB in RC4. The new artwork uses a 128-pixel body reference, 72-pixel face crops, and 192-pixel scenery tiles. The following 8.2-second headless Chromium captures ran a fixed steering sequence in live Endless with twenty participants. CPU measurements cover Phaser's pre-step through post-render. Physical-phone behavior remains unverified.

| Viewport | CPU median RC4 → cartoon | CPU p95 RC4 → cartoon | Frame interval p95 RC4 → cartoon |
| --- | ---: | ---: | ---: |
| 1366 × 768 Balanced | 1.2 → 1.4 ms | 4.8 → 4.5 ms | 20.5 → 19.8 ms |
| 390 × 844 Balanced | 1.2 → 1.4 ms | 4.7 → 4.8 ms | 20.2 → 20.3 ms |
| 844 × 390 Low | 1.1 → 1.2 ms | 4.5 → 4.5 ms | 20.3 → 20.3 ms |

[RC4 browser timings](evidence/visual-identity/rc4-profile.json) · [Cartoon browser timings](evidence/visual-identity/cartoon-profile.json)
