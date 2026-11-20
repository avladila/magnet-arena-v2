import { ArenaModel } from '../src/arena-model';
import { advanceAttraction } from '../src/attraction';
import { arena, growthConfig, playerConfig } from '../src/config';
import { addMass, attractionReach } from '../src/growth';
import { advance, clampToArena, createPlayer, type Point, type Steering } from '../src/movement';
import type { WorldBounds } from '../src/particles';
import { ArenaCamera, MagnetScale } from '../src/view';

const viewports = [[1280, 800], [320, 680], [844, 390]];
const masses = [20, 100, 400, 800, 2000, 4000, 4352];
const milestones = [50, 100, 200, 400, 800, 2000, 4000, 4352];
const scales = [2, 4, 8, 12];
const rates = [30, 60, 120];
const center = { x: arena.width / 2, y: arena.height / 2 };
const sweep = [
  [12200, 5000], [12200, 2700], [3120, 2700], [3120, 6480], [13400, 6480], [13400, 8140],
  [2150, 8140], [2150, 1800], [11400, 1800], [11400, 4200], [5200, 4200], [5200, 5000],
].map(([x, y]) => ({ x, y }));
const revisit = [[140, 140], [-140, 140], [-140, -140], [140, -140]].map(([x, y]) => ({ x: center.x + x, y: center.y + y }));
const edges = [
  { x: 0, y: 0 }, { x: arena.width, y: 0 }, { x: arena.width, y: arena.height },
  { x: 0, y: arena.height },
];

type Scenario = {
  name: string;
  seed: number;
  seconds: number;
  initialMass: number;
  competing: boolean;
  targets: Point[];
  rates: number[];
  start?: Point;
};

const scenarios: Scenario[] = [
  { name: 'Fresh lanes, solo', seed: 2026, seconds: 180, initialMass: 20, competing: false, targets: sweep, rates },
  { name: 'Fresh lanes, competing', seed: 2026, seconds: 180, initialMass: 20, competing: true, targets: sweep, rates },
  { name: 'Sparse revisits, competing', seed: 3881, seconds: 120, initialMass: 20, competing: true, targets: revisit, rates },
  { name: 'Grown magnets at the perimeter', seed: 912, seconds: 115, initialMass: 2000, competing: true, targets: edges, rates,
    start: { x: 740, y: 740 } },
  { name: 'Ten-minute lanes, competing', seed: 1549, seconds: 600, initialMass: 20, competing: true, targets: sweep, rates: [60] },
];

function intersects({ x, y }: Point, radius: number, view: WorldBounds): boolean {
  return x + radius >= view.left && x - radius <= view.right && y + radius >= view.top && y - radius <= view.bottom;
}

function framingSamples() {
  return viewports.map(([width, height]) => {
    const player = createPlayer();
    const camera = new ArenaCamera(player.position);
    camera.resize(width, height);
    return { width, height, rows: masses.map((mass) => {
      addMass(player, mass - player.mass);
      camera.follow(player.position, 10, player.mass);
      const reach = attractionReach(player.physicalScale);
      return {
        mass, scale: player.physicalScale, radius: player.radius, reach, zoom: camera.zoom,
        screenRadius: player.radius * camera.zoom, fieldFraction: 2 * reach * camera.zoom / Math.min(width, height),
      };
    }) };
  });
}

function p95(values: Float64Array) {
  values.sort();
  return values[Math.floor((values.length - 1) * 0.95)];
}

function measure(scenario: Scenario, hz: number) {
  const { name, seed, seconds, initialMass, competing, targets, start } = scenario;
  const model = new ArenaModel(seed);
  const { player, particles } = model;
  const participants = competing ? model.participants : [player];
  for (const magnet of participants) addMass(magnet, initialMass - magnet.mass);
  if (start) {
    player.position = clampToArena(start, player.radius);
    // Preload the starting area while the previous view is still at the original spawn.
    particles.replenish(participants, { left: center.x, top: center.y, right: center.x, bottom: center.y }, 0.25);
  }

  const camera = new ArenaCamera(player.position);
  camera.resize(320, 680);
  camera.follow(player.position, 10, player.mass);
  const tracked = participants.map((magnet) => {
    const animation = new MagnetScale();
    animation.update(magnet.physicalScale, 10);
    return {
      magnet, animation, previousMass: 0, offscreenPickups: 0,
      massTimes: Object.fromEntries(milestones.map((mass) => [mass, null])) as Record<number, number | null>,
      scaleTimes: Object.fromEntries(scales.map((scale) => [scale, null])) as Record<number, number | null>,
      timeToCap: null as number | null,
    };
  });
  const byId = new Map(tracked.map((entry) => [entry.magnet.id, entry]));
  const snapshot = (time: number) => ({ time, zoom: camera.zoom, magnets: tracked.map(({ magnet, animation }) => ({
    id: magnet.id, mass: magnet.mass, pickups: magnet.pickupsCollected, scale: magnet.physicalScale,
    radius: magnet.radius, reach: attractionReach(magnet.physicalScale),
    screenRadius: playerConfig.radius * animation.scale * camera.zoom,
  })) });
  const observe = (time: number) => {
    for (const entry of tracked) {
      const { magnet } = entry;
      if (magnet.mass === entry.previousMass) continue;
      entry.previousMass = magnet.mass;
      for (const mass of milestones) if (magnet.mass >= mass) entry.massTimes[mass] ??= time;
      for (const scale of scales) if (magnet.physicalScale >= scale) entry.scaleTimes[scale] ??= time;
      if (magnet.physicalScale >= growthConfig.maxScale) entry.timeToCap ??= time;
    }
  };
  observe(0);
  const samples = [snapshot(0)];
  const before = particles.regionStats;
  const frames = seconds * hz;
  const simulation = new Float64Array(frames);
  const streaming = new Float64Array(frames);
  const priorGenerations = new Uint32Array(particles.slots.length);
  const priorVisibility = new Uint8Array(particles.slots.length);
  const localCounts: number[] = [];
  let contested = 0;
  let activeMin = Infinity;
  let activeMax = 0;
  let visibleChanges = 0;
  let fieldIntrusions = 0;
  let waypoint = 0;

  for (let step = 0; step < frames; step++) {
    const delta = 1 / hz;
    const goal = clampToArena(targets[waypoint], player.radius);
    if (Math.hypot(player.position.x - goal.x, player.position.y - goal.y) < 1e-7) waypoint = (waypoint + 1) % targets.length;
    const steering: Steering = { kind: 'target', point: targets[waypoint] };
    const startSimulation = performance.now();
    if (!competing) advance(player, steering, delta);
    const result = competing ? model.step(steering, delta)! : advanceAttraction(particles, participants, delta);
    simulation[step] = performance.now() - startSimulation;

    camera.follow(player.position, delta, player.mass);
    const view = camera.bounds;
    for (const entry of tracked) entry.animation.update(entry.magnet.physicalScale, delta);
    contested += result.contestedCollections;
    for (const { ownerId } of result.collections) {
      const owner = byId.get(ownerId)!;
      if (!intersects(owner.magnet.position, owner.magnet.radius, view)) owner.offscreenPickups++;
    }
    for (const slot of particles.slots) {
      priorGenerations[slot.id] = slot.generation;
      priorVisibility[slot.id] = Number(slot.state === 'active' && intersects(slot, slot.radius, view));
    }
    const startStreaming = performance.now();
    if (competing) model.replenish(view);
    else particles.replenish(participants, view, delta);
    streaming[step] = performance.now() - startStreaming;

    const sampleLocal = (step + 1) % hz === 0;
    let active = 0;
    let local = 0;
    const left = Math.min(arena.width - 1200, Math.max(0, player.position.x - 600));
    const top = Math.min(arena.height - 1200, Math.max(0, player.position.y - 600));
    for (const slot of particles.slots) {
      if (slot.state !== 'active') {
        visibleChanges += priorVisibility[slot.id];
        continue;
      }
      active++;
      if (sampleLocal && slot.x >= left && slot.x < left + 1200 && slot.y >= top && slot.y < top + 1200) local++;
      if (slot.generation === priorGenerations[slot.id]) continue;
      if (priorVisibility[slot.id] || intersects(slot, slot.radius, view)) visibleChanges++;
      for (const { position, physicalScale, radius } of participants) {
        const reach = Math.max(attractionReach(physicalScale), radius + slot.radius);
        if ((slot.x - position.x) ** 2 + (slot.y - position.y) ** 2 <= reach ** 2) {
          fieldIntrusions++;
          break;
        }
      }
    }
    activeMin = Math.min(activeMin, active);
    activeMax = Math.max(activeMax, active);
    if (sampleLocal) localCounts.push(local);
    const time = (step + 1) / hz;
    observe(time);
    if (time % 60 === 0 || step + 1 === frames) samples.push(snapshot(time));
  }

  const pace = samples.slice(1).map((current, i) => {
    const previous = samples[i];
    const toMinute = 60 / (current.time - previous.time);
    return { from: previous.time, to: current.time, magnets: current.magnets.map((magnet, j) => ({
      id: magnet.id,
      pickups: (magnet.pickups - previous.magnets[j].pickups) * toMinute,
      mass: (magnet.mass - previous.magnets[j].mass) * toMinute,
      radius: (magnet.radius - previous.magnets[j].radius) * toMinute,
      screenDiameter: 2 * (magnet.screenRadius - previous.magnets[j].screenRadius) * toMinute,
    })) };
  });
  localCounts.sort((a, b) => a - b);
  const stats = particles.regionStats;
  return {
    name, seed, hz, seconds, initialMass, competing, samples, pace, contested,
    milestones: tracked.map(({ magnet, massTimes, scaleTimes, timeToCap, offscreenPickups }) => ({
      id: magnet.id, massTimes, scaleTimes, timeToCap, offscreenPickups,
    })),
    medianLocalScrap1200: localCounts[Math.floor(localCounts.length / 2)],
    active: [activeMin, activeMax], capacity: particles.slots.length, visibleChanges, fieldIntrusions,
    activationsPerSecond: (stats.activated - before.activated) / seconds,
    plansPerSecond: (stats.plans - before.plans) / seconds, stats,
    simulationP95Ms: p95(simulation), streamingP95Ms: p95(streaming),
  };
}

const framing = framingSamples();
const runs = scenarios.flatMap((scenario) => scenario.rates.map((hz) => measure(scenario, hz)));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ growthConfig, framing, runs }, null, 2));
} else {
  console.table(framing.flatMap(({ width, height, rows }) => rows.map(({ mass, radius, reach, zoom, screenRadius }) => ({
    viewport: `${width}×${height}`, mass, radius: radius.toFixed(1), reach: reach.toFixed(1),
    zoom: zoom.toFixed(3), screenRadius: screenRadius.toFixed(1),
  }))));
  console.table(runs.map((run) => ({
    scenario: run.name, hz: run.hz, pickups: run.samples.at(-1)!.magnets.map(({ pickups }) => pickups).join('/'),
    active: run.active.join('/'), cache: run.stats.peakCachedRegions, contested: run.contested,
    simulationP95Ms: run.simulationP95Ms.toFixed(3), streamingP95Ms: run.streamingP95Ms.toFixed(3),
  })));
}
