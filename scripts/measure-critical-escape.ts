import { ArenaModel } from '../src/arena-model';
import { criticalMassConfig, matchConfig, type CriticalOverrides } from '../src/competition-config';
import { CriticalMass } from '../src/critical-mass';
import { escapeRoute } from '../src/critical-tactics';
import { addMass } from '../src/growth';
import { advance, clampToArena, createParticipant, type Point } from '../src/movement';

const dt = matchConfig.step;
const stock = criticalMassConfig;
const idle = { kind: 'idle' } as const;
const middle = { x: 7680, y: 5000 };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const rounded = (value: number) => Math.round(value * 100) / 100;

function runEscape(overrides: CriticalOverrides, center: Point, start: Point, mass: number, reaction: number,
    placement: string, strategy: 'route' | 'radial') {
  const critical = new CriticalMass(overrides);
  const claimant = createParticipant('claimant', 'bot', center);
  addMass(claimant, critical.rules.threshold - claimant.mass);
  const player = createParticipant('player', 'player', start);
  addMass(player, mass - player.mass);
  const from = player.position;
  const gap = distance(center, from) - player.radius;
  const straight = { x: from.x + (from.x - center.x) * 5, y: from.y + (from.y - center.y) * 5 };
  const point = strategy === 'route' ? escapeRoute(player, center, critical.rules, []) : clampToArena(straight, player.radius);
  const actors = [claimant, player];
  critical.afterStep(actors, dt, 0);
  let time = 0;
  let hit: number | undefined;
  let atCommit = gap;
  while (!critical.finished) {
    const move = () => advance(player, time + 1e-9 >= reaction ? { kind: 'target', point } : idle, dt);
    if (critical.committed) {
      critical.advanceWave(actors, dt, move);
      if (critical.destroyed(player)) hit ??= time + dt;
    } else {
      move();
      critical.afterStep(actors, dt, time + dt);
      if (critical.committed) atCommit = distance(center, player.position) - player.radius;
    }
    time += dt;
  }
  return { scenario: 'escape', placement, strategy, mass, reaction: Number.isFinite(reaction) ? reaction : 'inactive',
    radius: critical.rules.radius, seconds: critical.rules.countdown, centerToBody: rounded(gap), atCommit: rounded(atCommit),
    hit: hit === undefined ? null : rounded(hit), outcome: critical.result?.standings.find(row => row.id === player.id)?.outcome };
}

const settings: CriticalOverrides[] = [{}, { countdown: 2 }, { countdown: 4 }, { radius: 1000 }, { radius: 1800 }];
for (const setting of settings) for (const mass of [20, 4352]) for (const reaction of [0, 0.35, 0.8, 1.5, Infinity]) {
  for (const offset of [0, 250, 500, 850, 1150, 1400, 1850, 2300]) {
    console.log(JSON.stringify(runEscape(setting, middle, { x: middle.x + offset, y: middle.y }, mass, reaction, 'center', 'route')));
  }
  for (const strategy of ['radial', 'route'] as const) {
    console.log(JSON.stringify(runEscape(setting, { x: 810, y: 5000 }, { x: 0, y: 5000 }, mass, reaction, 'wall', strategy)));
    console.log(JSON.stringify(runEscape(setting, { x: 750, y: 750 }, { x: 0, y: 0 }, mass, reaction, 'corner', strategy)));
  }
}

const interrupts = [
  { label: 'charged hunter in range', role: 'hunter', distance: 520, chargeAt: 0, guard: 0, surplus: 0 },
  { label: 'charged hunter at the edge of theft range', role: 'hunter', distance: 649, chargeAt: 0, guard: 0, surplus: 0 },
  { label: 'charged hunter closing from range', role: 'hunter', distance: 900, chargeAt: 0, guard: 0, surplus: 0 },
  { label: 'hunter charges too late', role: 'hunter', distance: 520, chargeAt: 2.92, guard: 0, surplus: 0 },
  { label: 'hunter faces a guarded claimant', role: 'hunter', distance: 520, chargeAt: 0, guard: 3.2, surplus: 0 },
  { label: 'hunter faces a 24,000-mass claimant', role: 'hunter', distance: 520, chargeAt: 0, guard: 0, surplus: 12000 },
  { label: 'charged collector escapes', role: 'collector', distance: 520, chargeAt: 0, guard: 0, surplus: 0 },
  { label: 'charged opportunist with an escape route', role: 'opportunist', distance: 520, chargeAt: 0, guard: 0, surplus: 0 },
] as const;
for (const cell of interrupts) {
  const model = new ArenaModel(17889, 'normal', false, { mode: 'arena' });
  const critical = model.critical!;
  const player = model.player;
  const rival = model.bots.find(bot => bot.strategy === cell.role)!;
  for (const bot of model.bots) bot.position = { x: 1500, y: 3500 };
  Object.assign(model, { botSteering: () => idle });
  model.hazards!.sites.length = 0;
  for (const slot of model.particles.slots) slot.state = 'inactive';
  rival.position = { x: player.position.x + cell.distance, y: player.position.y };
  addMass(player, stock.threshold + cell.surplus - player.mass);
  player.combat.guardFor = cell.guard;
  model.step(idle, dt);
  let fired = false;
  let pursued = false;
  let escaped = false;
  for (let step = 0; step <= (stock.countdown + stock.expansion) / dt + 2; step++) {
    if (step === Math.ceil(cell.chargeAt / dt)) rival.combat.energy = 100;
    model.step(idle, dt);
    fired ||= rival.combat.attack.phase === 'warning';
    pursued ||= model.botIntent(rival) === 'pursuit';
    escaped ||= model.botIntent(rival) === 'escape';
    if (!critical.warning || critical.finished) break;
  }
  console.log(JSON.stringify({ scenario: 'interruption', ...cell, pursued, escaped, fired, landed: rival.combat.hits,
    claimantMass: player.mass, interruptions: critical.interruptions, result: critical.result?.standings.find(row => row.id === rival.id)?.outcome }));
}
