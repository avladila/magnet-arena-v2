import { ArenaModel } from '../src/arena-model';
import { arena, playerConfig } from '../src/config';
import type { Point } from '../src/movement';
import type { Scrap } from '../src/particles';
import { ArenaCamera } from '../src/view';

const seeds = [2026, 3881, 912, 1549, 6021];
const sizes = [800, 1200];
const center = { x: arena.width / 2, y: arena.height / 2 };
const delta = 1 / 30;
const corner = { x: 105, y: 105 };
const scenarios = ['opening', 'travel and return', 'clustered', 'separated with edges', 'corner arrival'] as const;
const travelTargets = [
  { x: 1320, y: 160 }, { x: 1000, y: -900 }, { x: -1050, y: -850 },
  { x: -1460, y: 520 }, { x: 0, y: 0 }, { x: 1300, y: 140 },
];

function localCount(slots: readonly Scrap[], point: Point, size: number): number {
  const left = Math.max(0, Math.min(arena.width - size, point.x - size / 2));
  const top = Math.max(0, Math.min(arena.height - size, point.y - size / 2));
  let count = 0;
  for (const slot of slots) {
    if (slot.state === 'active' && slot.x >= left && slot.x < left + size &&
        slot.y >= top && slot.y < top + size) count++;
  }
  return count;
}

function percentile(values: number[], part: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * part;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

function measure(seed: number, scenario: typeof scenarios[number]) {
  const model = new ArenaModel(seed);
  const { player, bots, participants, particles } = model;
  if (scenario === 'clustered') {
    for (const [index, bot] of bots.entries()) {
      bot.position = { x: center.x + (index % 2 ? 260 : -260), y: center.y + (index < 2 ? 260 : -260) };
    }
  }
  if (scenario === 'separated with edges') {
    const margin = corner.x;
    player.position = { ...corner };
    bots[0].position = { x: arena.width - margin, y: margin };
    bots[1].position = { x: margin, y: arena.height - margin };
    bots[2].position = { x: arena.width - margin, y: arena.height - margin };
    bots[3].position = { x: center.x, y: arena.height - margin };
    // Give the teleported fixtures one offscreen prefetch while the old view is still at center.
    particles.replenish(participants, { left: center.x, top: center.y, right: center.x, bottom: center.y }, 0.25);
  }
  const camera = new ArenaCamera(player.position);
  camera.resize(1040, 740);
  const samples: Record<string, number[][]> = {};
  const simulation: number[] = [];
  const streaming: number[] = [];
  let firstEncounter: number | undefined;
  let contested = 0;
  let minActive = Number.POSITIVE_INFINITY;
  let maxActive = 0;
  const sample = (label: string) => {
    participants.forEach(({ id, position }) => {
      (samples[label + ' / ' + id] ??= []).push(sizes.map((size) => localCount(particles.slots, position, size)));
    });
  };
  const checkBudget = () => {
    let active = 0;
    for (const slot of particles.slots) if (slot.state === 'active') active++;
    minActive = Math.min(minActive, active);
    maxActive = Math.max(maxActive, active);
  };
  checkBudget();
  if (scenario === 'opening' || scenario === 'separated with edges') sample('initial');
  const cornerSeconds = Math.hypot(center.x - corner.x, center.y - corner.y) / playerConfig.speed;
  const seconds = scenario === 'opening' ? 0 : scenario === 'travel and return' ? 36 :
    scenario === 'corner arrival' ? cornerSeconds + 1 : 24;
  const frames = Math.ceil(seconds / delta);
  for (let frame = 1; frame <= frames; frame++) {
    let point: Point | undefined;
    if (scenario === 'travel and return') {
      const target = travelTargets[Math.floor((frame - 1) / (6 * 30))];
      point = { x: center.x + target.x, y: center.y + target.y };
    } else if (scenario === 'corner arrival') {
      point = corner;
    }
    const start = performance.now();
    const result = model.step(point ? { kind: 'target', point } : { kind: 'idle' }, delta)!;
    simulation.push(performance.now() - start);
    contested += result.contestedCollections;
    camera.follow(player.position, delta, player.mass);
    const streamStart = performance.now();
    model.replenish(camera.bounds);
    streaming.push(performance.now() - streamStart);
    checkBudget();
    if (frame % 30 === 0) {
      if (scenario === 'corner arrival') {
        if (frame * delta >= cornerSeconds - 2) sample('arrival');
      } else {
        sample(scenario === 'travel and return' && frame > 28 * 30 ? 'return' : 'route');
      }
    }
    if (firstEncounter === undefined) {
      const { left, top, right, bottom } = camera.bounds;
      if (bots.some(({ position: p }) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom)) {
        firstEncounter = frame * delta;
      }
    }
  }
  return {
    scenario, seed, samples, active: [minActive, maxActive], slots: particles.slots.length,
    pickups: participants.map((p) => ({ id: p.id, count: p.pickupsCollected, mass: p.mass, scale: p.physicalScale })),
    contested, firstEncounter,
    simulationP95Ms: simulation.length ? percentile(simulation, 0.95) : undefined,
    streamingP95Ms: streaming.length ? percentile(streaming, 0.95) : undefined,
    regionStats: particles.regionStats,
  };
}

const runs = seeds.flatMap((seed) => scenarios.map((scenario) => measure(seed, scenario)));
const byCohort = [];
const groups = {
  player: ['player'], collectors: ['bot-1', 'bot-2'], roamers: ['bot-3', 'bot-4'],
};
for (const scenario of scenarios) {
  const matching = runs.filter((run) => run.scenario === scenario);
  const phases = new Set(matching.flatMap((run) => Object.keys(run.samples).map((key) => key.split(' / ')[0])));
  for (const [kind, ids] of Object.entries(groups)) {
    for (const phase of phases) {
      const samples = matching.flatMap((run) => ids.flatMap((id) => run.samples[phase + ' / ' + id] ?? []));
      byCohort.push({
        scenario, kind, phase, samples: samples.length,
        median800: percentile(samples.map((s) => s[0]), 0.5),
        median1200: percentile(samples.map((s) => s[1]), 0.5),
      });
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ arena, seeds, byCohort, runs }, null, 2));
} else {
  console.table(byCohort);
  console.table(runs.filter((r) => r.scenario !== 'opening').map((r) => ({
    scenario: r.scenario, seed: r.seed, active: r.active.join('–'), player: r.pickups[0].count,
    bots: r.pickups.slice(1).map((p) => p.count).join('/'), contested: r.contested,
    simulationP95Ms: r.simulationP95Ms?.toFixed(3), streamingP95Ms: r.streamingP95Ms?.toFixed(3),
  })));
}
