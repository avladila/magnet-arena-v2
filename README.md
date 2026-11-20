# MAGNET

A top-down browser arena built with Phaser 3, TypeScript and Vite. Steer the magnet near colored scrap to pull it in. Each piece adds one mass, increasing the magnet's size and reach as the camera eases out. Copper, Spark, Drift, and Orbit collect from the same arena.

## Run locally

Use Node.js 22.12 or later in the 22.x line, or Node.js 24.x.

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Open the address printed by Vite. For phone playtesting, open the Vite host machine's LAN address and port from a phone on the same network.

- **Desktop:** Move the mouse over the arena to steer. Bring it back over the magnet or leave the arena to stop.
- **Touch:** Tap to move to that point. Touch and drag to use the floating joystick. Return to the center or lift your finger to stop. Try both portrait and landscape.

Light is the first-run theme. Use the moon or sun button beside the mass counter to switch. The game remembers the choice when local storage is available. Tab to the button and use Space or Enter to toggle with the keyboard.

## Physical-phone playtest

1. Try both themes in portrait and landscape. Check the title, control guidance and mass HUD around the safe areas. Tap the theme button at rest and during tap-to-move. Check that the existing destination still works.
2. Drag through sparse and dense scrap in both themes. Look for distinct scrap colors, smooth pull, and comfortable collection pacing. While steering, tap the theme button with a second finger. Rotate the phone mid-drag, then start and release a fresh drag. Check for unintended movement or changes in thumb travel.
3. Compare the magnet and its field with the floor brackets from mass 20 toward 50, 100, 200 and 400. Check that each milestone pulse is brief and the scrap remains readable. Enable the phone's reduced-motion preference and reload to check that the milestone pulses are suppressed.
4. At higher mass, trace walls and corners. Check for stutters during sustained collection and record the device and browser with any observations.
5. Head east from the center to look for Copper, then explore farther for the other magnets. Compare how often the Collectors change course for scrap with the Roamers' longer routes. Steer through another magnet and watch contested scrap, then try a route away from the Collectors. Check name and rim readability, competition pacing, and touch comfort when several magnets are visible.

## Verify

```sh
npm test
npm run typecheck
npm run build
```

## Growth and balance

The simulation owns position, velocity, mass, size, and scrap. Each collected slot pays out once before it respawns, preferably outside the camera. Growth uses `min(4, 1 + 0.32 × (sqrt(mass / 20) − 1))` for scale, `30 × scale` for physical radius, and `min(230, 118 × sqrt(scale))` for pull reach. At maximum scale, the farthest corner scrap is about 163 world units from the nearest legal magnet center, within its 230-unit reach.

The camera applies the two-phase mass multiplier to its viewport baseline with a floor that keeps the view inside the arena. Camera zoom and eased drawing scale are separate from collision and input.

`src/config.ts` holds the 720 active pieces in a 1,500-slot pool, pull speeds of 300–700 world units per second, and presentation timing. The 460 world-unit-per-second movement speed carries forward from Task 001. Future shared-economy context is 94% ordinary scrap, 1% gold, and 5% energy. All active pickups in this milestone are ordinary scrap.

The magnetic halo eases toward the actual field reach in world units. The 64-unit floor brackets are spaced 480 units apart. Milestones at 50, 100, 200 and 400 give a 340 ms visual pulse. If a collection batch crosses multiple thresholds, it shows one pulse for the highest. The palettes in `src/theme.ts` share the same ten ordinary scrap indices.

## Shared scrap

Copper and Spark are Collectors. They score live pieces within 720 world units by distance and density in 240-unit cells. They reconsider after 0.7 seconds or when their target expires. A viable target stays unless another scores at least 25% higher. Drift and Orbit are Roamers. They sample seeded waypoints 600–1,500 units out with a fallback away from walls, replace a waypoint within 12 units of arrival, and reconsider after 2.6–4.2 seconds. These values are provisional and live in `src/config.ts`.

The arena model updates bot decisions and then moves all five magnets. Each piece picks one winner by smallest signed surface gap, which puts contact before pull. Ties use ascending participant ID. A slot's current generation accepts one claim, and mass is applied in a batch after all pieces have been resolved. Respawns use the latest player camera bounds to prefer offscreen areas, reject positions inside any participant's field, and fall back to a bounded grid of legal centers. The camera and HUD follow the player.

Run `npm exec -- tsx scripts/measure-competition.ts` to repeat the two 60-second routes at 30 Hz. Each run pair begins with the same seeded scrap layout and follows the same timed world targets. The script prints mass and physical scale at 10, 20, 40, and 60 seconds.

| Route | Player pickups solo / competing | Copper | Spark | Drift | Orbit | Contested pickups | First bot visible on desktop / portrait |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| East and around, seed 2026 | 252 / 233 | 726 | 677 | 293 | 369 | 17 / 2,298 | 4.70 s / 1.77 s |
| West and across, seed 3881 | 252 / 170 | 741 | 582 | 339 | 265 | 87 / 2,097 | 1.53 s / 1.83 s |

The westward route yielded about one-third fewer player pickups with competitors. Check that route and longer runs during phone playtesting, especially how the larger Collectors affect access to scrap. If scarcity feels excessive, try a brief delay before Collectors seek their next piece after a pickup. That targets the bot decision cadence directly.
