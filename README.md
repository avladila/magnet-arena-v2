# MAGNET

MAGNET is a single-player salvage competition built with Phaser 3, TypeScript and Vite. Collect scrap and gold to grow, charge Magnetic Theft with red cells, and race nineteen rivals for mass across a 15,360 × 10,000 arena.

- **Arena** starts with a three-second countdown and runs for five minutes. Final rank uses current mass, highest mass and resource mass in that order.
- **Endless** uses the same economy, rivals and hazards. End the session from Pause to see your stats and replay.
- **Learn to Play** runs a separate interactive training session. It covers steering, collection, charging, aiming, recovering stolen salvage, and five live hazard encounters.

## Run locally

Use Node.js 22.12 or later in the 22.x line, or Node.js 24.x.

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Open the address printed by Vite. For phone playtesting, open the Vite host machine's LAN address and port from a phone on the same network.

- **Desktop:** Steer with the mouse, WASD or arrow keys. Return the mouse over the magnet or leave the arena to stop mouse steering. At full energy, hold Space to aim and release to fire. Escape pauses.
- **Touch:** Tap a destination or drag to steer with the floating joystick. Hold Attack with a second finger to aim, drag that thumb to override the assisted bearing, and release to fire. The Pause button opens the session controls.

Light is the first-run theme. Use the moon or sun button beside the mass counter to switch. The game remembers the choice when local storage is available. Tab to the button and use Space or Enter to toggle with the keyboard.

## Physical-phone playtest

1. Try both themes in portrait and landscape. Check the title, control guidance and mass HUD around the safe areas. Tap the theme button at rest and during tap-to-move. Check that the existing destination still works.
2. Drag through sparse and dense scrap in both themes. Look for distinct scrap colors, smooth pull, and comfortable collection pacing. While steering, tap the theme button with a second finger. Rotate the phone mid-drag, then start and release a fresh drag. Check for unintended movement or changes in thumb travel.
3. Compare the magnet and its field with the floor brackets from mass 20 toward 50, 100, 200 and 400. Check that each milestone pulse is brief and the scrap remains readable. Enable the phone's reduced-motion preference and reload to check that the milestone pulses are suppressed.
4. At higher mass, trace walls and corners. Check for stutters during sustained collection and record the device and browser with any observations.
5. Start several fresh rounds and try eastward, westward, and center-crossing routes. Look for Copper and Spark crossing dense patches on committed routes, and Drift and Orbit exploring farther afield. Check that a Collector travels through a patch after a pickup and keeps moving when the patch runs out. Compare your mass gain and the bots' apparent growth over the first minute. Note any scarcity, wall turns, or frame hitches when several magnets are visible.

## Verify

```sh
npm test
npm run typecheck
npm run build
npm exec -- tsx scripts/simulate-matches.ts
```

See the [visual identity verification](docs/visual-identity.md) for the artwork and browser evidence. The [RC4 report](docs/rc4.md) covers combat and population.

## Growth and balance

The simulation owns position, velocity, mass, size, and scrap. Each collected slot pays out once before it respawns, preferably outside the camera. Experimental growth uses `min(12, 1 + 0.8 × (sqrt(mass / 20) − 1))` for all magnets, with radius `30 × scale`. Pull reach follows the original curve through 4× scale and extends beyond the body at larger sizes. At 12×, reach is about 551 world units and even the farthest corner scrap is about 502 units from the nearest legal magnet center.

The camera applies the two-phase mass multiplier to its viewport baseline. It eases out further as needed to fit the magnetic field within 70% of the shorter viewport side, subject to the floor that keeps the view inside the world. Camera zoom and eased drawing scale are separate from authoritative collision geometry. The proposed tuning, measurements and acceptance checks are recorded in [giant growth](docs/giant-growth.md).

Arena and Endless target 2,880 active pieces in a 3,600-slot pool. The five-participant comparison uses 720 pieces in 1,500 slots. Natural sites use the same regional density and a deterministic 94% ordinary scrap, 1% gold and 5% red energy mix. Gold pays ten mass and red cells charge Magnetic Theft.

The magnetic halo eases toward the actual field reach in world units. The 64-unit floor brackets are spaced 480 units apart. Milestones at 50, 100, 200, 400, 800, 1,500, 2,500 and 4,352 give a 340 ms visual pulse. If a collection batch crosses multiple thresholds, it shows one pulse for the highest. The palettes in `src/theme.ts` share the same ten ordinary scrap indices.

## Shared scrap

The shared bot controller uses six archetypes. Collectors sweep dense scrap, Hunters favor valuable attack opportunities, Chargers seek red cells, and Scavengers seek eligible landed debris. Roamers explore districts, and Opportunists weigh nearby scrap, opponents and salvage. Bots follow committed routes around hazards, and a large bot may retreat from a smaller charged rival.

Each natural piece picks one winner by smallest signed surface gap, with ties resolved by participant ID. A slot generation accepts one claim, and the model batches natural payouts. The shared region manager supplies all districts, including offscreen bots. Magnetic Theft converts a target diameter to mass and throws detached fragments into contested space. The damaged magnet can reclaim its own fragments five seconds after landing.

Run `npm exec -- tsx scripts/measure-competition.ts` to repeat five seeded 60-second runs at 30 Hz. Each solo and competitive pair begins with the same scrap layout and follows the same timed, center-relative world targets. The script prints pickups and physical scales at 10, 20, 40, and 60 seconds, plus bot motion, target assignments, and encounter times. The earlier Collector correction is documented in [Collector balance results](docs/collector-balance.md).
