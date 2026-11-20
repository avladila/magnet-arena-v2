import { ArenaModel } from '../src/arena-model';
import { advanceAttraction } from '../src/attraction';
import type { BotTarget } from '../src/bots';
import { advance, type Point } from '../src/movement';
import { ArenaCamera } from '../src/view';

const fps = 30;
const seconds = 60;
const segmentSeconds = 6;
const checkpoints = new Set([10, 20, 40, 60]);

const crossTargets = [
  [2720, 630], [3650, 820], [2610, 1600], [3440, 2300], [2110, 2630],
  [980, 1640], [2260, 1440], [1600, 700], [3280, 920], [2610, 2050],
];
const routes = [
  {
    name: 'East and around', seed: 2026,
    targets: [
      [4140, 1490], [4200, 2750], [1850, 2720], [420, 2100], [900, 460],
      [3200, 520], [4310, 1690], [2800, 2540], [840, 2430], [1120, 640],
    ],
  },
  {
    name: 'West and across', seed: 3881,
    targets: [
      [650, 1760], [920, 2740], [3300, 2710], [4240, 1570], [3610, 530],
      [1280, 410], [510, 1510], [2600, 2290], [4260, 2440], [3650, 540],
    ],
  },
  ...[912, 1549, 6021].map((seed) => ({ name: 'Across the middle', seed, targets: crossTargets })),
];

function measure(route: typeof routes[number], competing: boolean) {
  const model = new ArenaModel(route.seed);
  // Give both runs the same seeded starting scrap, including the spawn exclusions.
  const { player, particles } = model;
  const participants = competing ? model.participants : [player];
  const camera = new ArenaCamera(player.position);
  const phone = new ArenaCamera(player.position);
  camera.resize(1040, 740);
  phone.resize(390, 844);
  let firstDesktop: number | undefined;
  let firstPhone: number | undefined;
  let contested = 0;
  const snapshots = [];
  const activity = competing ? model.bots.map((bot) => ({
    bot, previousTarget: undefined as BotTarget | undefined, targetAssignments: 0, movingFrames: 0,
  })) : [];

  for (let frame = 1; frame <= seconds * fps; frame++) {
    const [x, y] = route.targets[Math.floor((frame - 1) / (segmentSeconds * fps))];
    const steering = { kind: 'target', point: { x, y } } as const;
    const delta = 1 / fps;
    if (competing) {
      contested += model.step(steering, delta)!.contestedCollections;
      for (const entry of activity) {
        const { bot } = entry;
        if (bot.target && bot.target !== entry.previousTarget) entry.targetAssignments++;
        entry.previousTarget = bot.target;
        if (Math.hypot(bot.velocity.x, bot.velocity.y) > 0.01) entry.movingFrames++;
      }
    } else {
      advance(player, steering, delta);
      advanceAttraction(particles, participants, delta);
    }

    camera.follow(player.position, delta, player.mass);
    phone.follow(player.position, delta, player.mass);
    particles.replenish(participants, camera.bounds);
    if (competing) {
      if (firstDesktop === undefined && model.bots.some((bot) => visible(bot.position, camera))) {
        firstDesktop = frame / fps;
      }
      if (firstPhone === undefined && model.bots.some((bot) => visible(bot.position, phone))) {
        firstPhone = frame / fps;
      }
    }
    if (frame % fps === 0 && checkpoints.has(frame / fps)) {
      snapshots.push({
        seconds: frame / fps,
        ...Object.fromEntries(participants.map((magnet) => [
          magnet.id, `${magnet.pickupsCollected} (${magnet.physicalScale.toFixed(2)}×)`,
        ])),
      });
    }
  }

  return {
    snapshots,
    pickups: Object.fromEntries(participants.map((magnet) => [magnet.id, magnet.pickupsCollected])),
    contested,
    total: participants.reduce((sum, participant) => sum + participant.pickupsCollected, 0),
    visibleDesktopSec: firstDesktop?.toFixed(2),
    visiblePhoneSec: firstPhone?.toFixed(2),
    bots: activity.map(({ bot, targetAssignments, movingFrames }) => ({
      id: bot.id,
      targetAssignments,
      movingSec: Number((movingFrames / fps).toFixed(2)),
      stationarySec: Number((seconds - movingFrames / fps).toFixed(2)),
    })),
  };
}

function visible(point: Point, camera: ArenaCamera) {
  const view = camera.bounds;
  return point.x >= view.left && point.x <= view.right && point.y >= view.top && point.y <= view.bottom;
}

const results = routes.flatMap((route) => [false, true].map((competing) => ({
  route: route.name, seed: route.seed, competing, ...measure(route, competing),
})));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const { route, seed, competing, snapshots, ...summary } of results) {
    console.log(route, competing ? 'five magnets' : 'solo', 'seed', seed, 'pickups (scale)');
    console.table(snapshots);
    console.log(summary);
  }
}
