# MAGNET RC7A · Living Faces

RC7A seats the face inside the magnet chassis and lets the pupils follow rivals and resources independently of travel. Concern, fear, and the other ten moods coordinate the eyes, brows, and mouth. The work extends [PR #8](https://github.com/avladila/magnet-arena-v2/pull/8) from RC6 at `90fcb69cdd95c7b0531aebd5ad645da69264f04f`. Main was `318656d50c9581201e4c1b873f0ae2ad33c91a64` at the start of the pass.

## Anatomy and art

The RC6 sheets and live views showed the tallest eyes and brows crowding the upper rim, while some tilted mouths reached toward the pole roots. The shared face offset corresponded to the crop center, so changing that offset would have moved every expression together. The underlying issue was fitting the same recess and widely varying features to all six shell stages. Pupil offsets also used independent horizontal and vertical allowances, which gave a narrow eye too little clearance on a diagonal. Motion or the last collection drove the gaze, even when a visible rival stood beside the player. [RC6 source art](evidence/rc6/artwork.webp) · [Paired live views](evidence/rc7a/comparison.webp)

Each of the 120 shells now has a mechanical recess and a socket sized to its chassis and stage. The red and blue poles, silhouette families, accent colors, decals, reinforcement, and all twenty identities remain recognizable. The recess has a bevel and a light backing for the face. No eyes or mouth are baked into the shell. The socket and body share a single transform for growth, shrinkage, travel, recoil, and rotation, and each actor draws its parts together when bodies overlap.

The atlas carries 240 expressions as 720 eye, eyebrow, and mouth cels plus 20 closed-lid cels. Each cel is trimmed for drawing and keeps its original 56 px coordinate space. A pair of authored inner ellipses defines the safe pupil area for each expression. One direction in world space drives both pupils. The controller projects it into the rendered body’s local axes, allowing for its rotation and unequal stretch. Each pupil travels along that ray as far as its aperture permits, accounting for both pupil radii and a 0.43 px art margin. The eyes and mouth stay seated at the same socket while a magnet looks sideways or behind its direction of travel. [Roster](evidence/rc7a/roster.webp) · [All six stages for all characters](evidence/rc7a/all-growth-stages.webp) · [All expressions](evidence/rc7a/all-expressions.webp) · [Eye and mouth close-ups with gameplay-scale swatches](evidence/rc7a/gaze-and-mouths.webp)

Generate the runtime atlases, faceplate sockets, character illustrations, and art sheets with `python -B scripts/generate-brand-art.py` from the repository root. The generator uses Pillow and the existing scenery backdrop. [Face generator](../scripts/living_faces.py) · [Face anchors](../brand/face-anchors.json) · [Asset manifest](../brand/asset-manifest.json)

## Attention

| Order | Observation |
| --- | --- |
| 1 | A rival’s incoming locked warning or aimed preparation within the existing attack cone and surface range. Real guard and the existing theft forecast determine whether it can deal damage. |
| 2 | A ready rival inside striking range, or a rapidly closing charged rival with substantial predicted damage. |
| 3 | Other preparing, fully charged, and ordinary rivals, in that order. Surface distance and a bounded contribution from predicted theft order rivals in the same tier. |
| 4 | Energy while the observer can still charge, then gold, then eligible landed salvage and ordinary scrap. |
| 5 | Direction of actual travel, then a small neutral forward glance at rest. |

During an attack the acting magnet can focus a legitimate victim in its own cone. Its actual warning and hit use the existing controls and combat resolution. A known incoming danger can still take the gaze. A charged opponent can prompt a worried glance when guard or core protection prevents damage. Attack availability keeps its independent electrical signals.

All opponent focus requires the target center inside the current gameplay viewport. Rival entry and retention are 600 and 700 world units between surfaces. A damaging charged rival can also count as a fast-closing threat inside a 400-unit surface gap when closing speed exceeds 185 world units per second and forecast loss reaches the larger of 12 mass or 6% of the observer’s mass. Striking-range checks share the actual 260-unit surface limit and warning geometry where relevant.

Ordinary choices are reviewed every 120 ms for the player and at staggered intervals of 105–147 ms for rivals, with a 350 ms minimum commitment. A competing target of equal priority needs a 20% utility advantage. A live warning can take precedence immediately. A target is dropped as soon as it leaves the view or its retention area, is collected, becomes ineligible, or has a new generation. The selected slot or actor supplies its live position every render. Pupil direction uses a world-space damping rate of 16/s, reaching about 89% of a step change in 140 ms. The gaze survives body turns while easing toward a new focus.

Visible actors share one current view of the rival list and landed debris. A single 120 ms pass takes the resources already culled by the pickup renderer and bins them into 240-unit cells for nearby queries, typically within 330 units of the observer’s surface. The refresh stores slot generation and current object references. Offscreen characters skip gaze selection and face placement. Resetting the match clears the shared index, focus, easing and expression timers.

## Expression and priority

| Priority | Expression | Trigger and visual cue |
| --- | --- | --- |
| 1 | Shocked | Applied combat or hazard loss. The eyes widen, the mouth opens, and recoil and pupil size respond to the actual loss. |
| 2 | Aggressive | An armed or released attack. Lowered brows and clenched teeth show intent. |
| 3 | Frightened | Immediate danger. Wide eyes, smaller pupils, raised brows and an open mouth. |
| 4 | Overheated, frozen, corroded | Heat, cold, or corrosion. Each uses its own lid and mouth artwork and an independent status mark. |
| 5 | Worried | A visible nearby opponent. Inner brows rise, both eyes watch the rival, and the mouth turns down. |
| 6 | Injured | A substantial loss leaves tired eyes, an uncomfortable mouth and a small bandage. |
| 7 | Satisfied | An actual pickup or salvage payout. A brief smile acknowledges the reward. |
| 8 | Excited | Attention on usable energy or gold. Open eyes and a bright grin. |
| 9 | Curious | Attention on ordinary scrap or eligible salvage. Raised brows and a small open mouth. |
| 10 | Relaxed | Travel or rest without a stronger cue. Neutral brows and a subtle character-specific smile. |

Shock, aggression, and fear appear promptly. Other changes use a 140 ms facial settle with the matching three cels switching together at 70 ms. Concern carries for 390 ms after the rival leaves and then settles to the next mood. Collection satisfaction lasts up to 290 ms, with at least 620 ms between starts during dense collection. The impact face lasts 400 ms. An injury still requires a loss of at least 10 mass and 24% of prior mass, and clears after 12 s or recovery of 66% of that loss.

Relaxed and curious poses can close their lids for 120 ms. Low and reduced motion keep all expression choices, pupil tracking, and threat recognition. They omit optional blinking and the fear sweat accent where appropriate. Reduced motion also holds the pose’s scale and suppresses the decorative settle. Heat, frost and corrosion marks remain legible during a higher-priority emotion, and charged poles continue to show ability readiness.

## Verification

### Gameplay parity

The detached RC6 baseline and RC7A each ran six complete five-minute Arena replays. The same 108,000 inputs cover all three difficulties and desktop, portrait, and landscape framing. All 186 SHA-256 state checkpoints matched exactly, including movement, resource ownership, rival navigation and tactics, combat, hazards, hotspots, Salvage Signals, and final ranks. The actual giant hit in the browser fixtures also removed 3,301 mass and left 1,051 from 4,352. [Recorded inputs](evidence/rc6/baseline/input-replays.json.gz) · [RC6 hashes](evidence/rc7a/baseline/parity.json) · [RC7A hashes](evidence/rc7a/metrics/parity.json)

```sh
npx tsx scripts/verify-presentation-parity.ts verify docs/evidence/rc6/baseline/input-replays.json.gz
```

### Regression checks

| Check | Fresh RC6 baseline | RC7A |
| --- | --- | --- |
| `npm ci` | Passed | Passed |
| `npm test` | 154 passed | 167 passed |
| `npm run typecheck` | Passed | Passed |
| `npm run build` | Passed | Passed |
| `npm run test:e2e -- --project=chromium --workers=1` | 14 passed | 15 passed |

Focused tests cover rival and charge priority, warning overrides, camera eligibility, energy and gold priority, moving and recycled slots, capture and release of attention, salvage ownership, commitment, and reset. Tests check the entire pupil against 480 eye apertures and confirm parallel pupil directions under travel, turning, and deformation. All 740 trimmed cels restored pixel for pixel to their authored local positions. The live Chromium test checks coordinated eye, brow, and mouth frames alongside real movement, Low, reduced motion, and replay reset. [RC6 checks](evidence/rc7a/baseline/checks.txt) · [RC7A checks](evidence/rc7a/metrics/checks.txt)

### Performance

Both builds used Chromium 156 headless on the same host, Dark Endless, the same seed, and the same keyboard route. Each regular profile sampled about 8.2 seconds with 20 participants and 2,880 active resources. CPU time spans the Phaser step through post-render. Frame intervals report the browser’s cadence.

| Viewport and preset | CPU median RC6 → RC7A | CPU p95 RC6 → RC7A | Frame median RC6 → RC7A | Frame p95 RC6 → RC7A |
| --- | ---: | ---: | ---: | ---: |
| 1,366 × 768 Balanced | 1.3 → 1.3 ms | 4.5 → 4.5 ms | 16.6 → 16.7 ms | 19.8 → 19.7 ms |
| 390 × 844 Balanced | 1.3 → 1.2 ms | 4.4 → 4.1 ms | 16.6 → 16.7 ms | 19.8 → 19.6 ms |
| 844 × 390 Low | 1.1 → 1.0 ms | 4.1 → 3.9 ms | 16.6 → 16.7 ms | 19.8 → 19.6 ms |

The separate High fixture kept all 20 faces in view, staged 440 nearby natural slots and peaked at 400 live salvage chunks. CPU p95 was 5.2 → 5.8 ms and frame interval p95 was 35.6 → 31.0 ms. This dense load has lower cadence than ordinary play on the headless host. The face texture is 984 × 992 px and 185,716 bytes, down from RC6’s 720 × 1,584 px and 201,264 bytes. The ordinary cadence and the dense result include the shared visibility pass, staggered rival reviews, and trimmed facial cels. [RC6 frame samples](evidence/rc7a/baseline/profile.json) · [RC7A frame samples](evidence/rc7a/metrics/profile.json) · [RC6 dense fixture](evidence/rc7a/baseline/dense.json) · [RC7A dense fixture](evidence/rc7a/metrics/dense.json)

## Running-game evidence

The paired fixtures stage initial positions, charge, shell mass or an environmental site in a running Endless session. Actual keyboard input moves the player and releases the player’s attack. The opponent movement, exposure, damage, growth, and pickup results use the game’s normal simulation. All twelve RC7A emotions were observed in these live fixtures. The normal Arena recording uses the visible-information pilot and real mouse and Space input in seed `11216`.

| Scene | RC6 | RC7A |
| --- | --- | --- |
| Normal Arena opening | [Live play](evidence/rc6/opening.webm) | [Live play](evidence/rc7a/arena.webm) |
| Normal Arena on a 390 × 844 touch viewport in Low | [Touch play](evidence/rc6/portrait.webm) | [Touch play](evidence/rc7a/mobile.webm) |
| Stationary energy and gold, switching to an approaching rival, eyes following while moving away, concern and recovery | [Live attention fixtures](evidence/rc7a/baseline/attention.webm) | [Live attention fixtures](evidence/rc7a/attention.webm) |
| A giant facing a charged small magnet, shock and injury, attack, heat, cold and corrosion | [Live expression fixtures](evidence/rc7a/baseline/acting.webm) | [Live expression fixtures](evidence/rc7a/acting.webm) |
| Player and rival shells at all six growth stages | [Live growth fixture](evidence/rc7a/baseline/stages.webm) | [Live growth fixture](evidence/rc7a/stages.webm) |

The paired stills use close crops for anatomical comparison and include full gameplay views of the rotating and retreating magnet. In the moving-away trace, the player’s velocity points west while both measured pupil offsets point east toward Copper. The threat disappears before the worried face settles back to relaxed. The loot fixture observes a real gold pickup before the smile. [Before and after anatomy and acting](evidence/rc7a/comparison.webp) · [All six stages in the running game](evidence/rc7a/live-stages.webp) · [RC6 browser trace](evidence/rc7a/baseline/trace.json) · [RC7A browser trace](evidence/rc7a/metrics/trace.json)

[Eyes on an energy cell](evidence/rc7a/stationary-energy.webp) · [Approaching opponent](evidence/rc7a/approaching-rival.webp) · [Watching while steering away](evidence/rc7a/moving-away.webp) · [A frightened giant](evidence/rc7a/giant-frightened.webp) · [Arming a real attack](evidence/rc7a/arming.webp) · [Portrait touch play](evidence/rc7a/mobile.webp)

## Remaining limitations

Attention uses the same visible area for every on-screen face. Opponents whose body edges are just inside the view may come into focus once their centers appear. The pupil movement is deliberately small enough to stay inside each eye, so expression silhouettes carry more of the cue at distant zoom. The artwork and recordings show the behavior in Chromium, including mobile-size views and reduced motion. Physical-device comfort and final art judgment remain open.
