# MAGNET

A top-down browser arena built with Phaser 3, TypeScript and Vite. Task 001 provides the arena, one controllable magnet, and the camera.

## Run locally

Use Node.js 22.12 or later in the 22.x line, or Node.js 24.x.

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Open the address printed by Vite. For phone playtesting, open the Vite host machine's LAN address and port from a phone on the same network.

- **Desktop:** Move the mouse over the arena to steer. Bring it back over the magnet or leave the arena to stop.
- **Touch:** Tap to move to that point. Touch and drag to use the floating joystick. Return to the center or lift your finger to stop. Try both portrait and landscape.

## Verify

```sh
npm test
npm run typecheck
npm run build
```

The simulation owns the magnet's position, velocity, mass and physical radius. Input translates pointer gestures into steering commands. The Phaser scene draws the result using separate framing and heading calculations. Movement speed is provisional and adjustable in `src/config.ts`.
