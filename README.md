# MAGNET

A top-down browser arena built with Phaser 3, TypeScript and Vite. Steer the magnet near colored scrap to pull it in. Each piece adds one mass, increasing the magnet's size and reach as the camera eases out.

## Run locally

Use Node.js 22.12 or later in the 22.x line, or Node.js 24.x.

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Open the address printed by Vite. For phone playtesting, open the Vite host machine's LAN address and port from a phone on the same network.

- **Desktop:** Move the mouse over the arena to steer. Bring it back over the magnet or leave the arena to stop.
- **Touch:** Tap to move to that point. Touch and drag to use the floating joystick. Return to the center or lift your finger to stop. Try both portrait and landscape.

For a phone playtest, take a fresh magnet through sparse and dense patches. Watch whether individual pieces are easy to see as they drift in, and compare the magnet's screen size and the mass HUD after collecting several dozen. Drag to a wall and into a corner at higher mass, then rotate the phone mid-drag and check that the old gesture stops. Start a new drag, add a second finger, and check that the first finger still steers. Release the joystick and check that movement stops. Note any stutter, HUD overlap, or change in how much thumb travel steering requires.

## Verify

```sh
npm test
npm run typecheck
npm run build
```

## Growth and balance

The simulation owns position, velocity, mass, size, and scrap. Each collected slot pays out once before it respawns, preferably outside the camera. Growth uses `min(4, 1 + 0.32 × (sqrt(mass / 20) − 1))` for scale, `30 × scale` for physical radius, and `min(230, 118 × sqrt(scale))` for pull reach. At maximum scale, the farthest corner scrap is about 163 world units from the nearest legal magnet center, within its 230-unit reach.

The camera applies the two-phase mass multiplier to its viewport baseline with a floor that keeps the view inside the arena. Camera zoom and eased drawing scale are separate from collision and input.

`src/config.ts` holds the provisional 600 active pieces within a 1,500-slot pool, pull speeds of 300–700 world units per second, and presentation timing. The 460 world-unit-per-second movement speed carries forward from Task 001. Future shared-economy context is 94% ordinary scrap, 1% gold, and 5% energy. All active pickups in this milestone are ordinary scrap.
