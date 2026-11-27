import { ArenaModel } from '../src/arena-model';
import type { Bot } from '../src/bots';
import { hazardConfig } from '../src/competition-config';
import { arena } from '../src/config';
import { addMass } from '../src/growth';
import type { Hazard, HazardKind } from '../src/hazards';
import type { Difficulty } from '../src/match';
import type { Point, Steering } from '../src/movement';
import { shortestAngle } from '../src/view';

const step = 1 / 60;
const seconds = 8;
const origin = { x: arena.width / 2, y: arena.height / 2 };
const hazards = ['heat', 'cold', 'water', 'acid', 'flux'] as const;
const names = ['clear', ...hazards, 'small-flux', 'wall', 'pair', 'pursuit', 'dense'] as const;
type Fixture = typeof names[number];
type NavigationTrace = {
  strategicTarget?: Point;
  activeWaypoint?: Point;
  mode: string;
  avoidanceSide?: number;
  stuckRecoveries: number;
  stuckTime: number;
};
type Frame = {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  strategic?: Point;
  local?: Point;
  mode: string;
  side?: number;
};

function site(kind: HazardKind, x: number, y: number): Hazard {
  return { kind, x, y, radius: hazardConfig[kind].radius, readyAt: 0, contacts: new Set(), victims: new Map() };
}

function measure(fixture: Fixture, difficulty: Difficulty, mass: number, trace: boolean) {
  const model = new ArenaModel(387, difficulty);
  const [bot, rival] = model.bots;
  const y = fixture === 'wall' ? Math.max(380, bot.radius + 10) : origin.y;
  addMass(bot, mass - 20);
  bot.position = { x: origin.x - 900, y };
  bot.target = { kind: 'waypoint', point: { x: origin.x + 1200, y } };
  for (const other of model.bots.slice(1)) other.position = { x: 900, y: 900 };
  model.player.position = { x: 500, y: 500 };
  model.hazards!.sites.length = 0;
  if (hazards.some((kind) => kind === fixture)) model.hazards!.sites.push(site(fixture as HazardKind, origin.x, y));
  if (fixture === 'small-flux') model.hazards!.sites.push(site('flux', origin.x, y));
  if (fixture === 'wall') model.hazards!.sites.push(site('heat', origin.x, 355));
  if (fixture === 'pair') model.hazards!.sites.push(site('heat', origin.x, y), site('acid', origin.x + 265, y - 125));
  if (fixture === 'cold') {
    addMass(model.player, 480);
    model.player.position = { x: origin.x, y: y + 260 };
  }
  if (fixture === 'pursuit') {
    addMass(model.player, 90);
    addMass(rival, 90);
    rival.position = { x: origin.x - 560, y: y - 110 };
    rival.target = { kind: 'waypoint', point: { x: origin.x + 1600, y: y - 110 } };
    rival.decisionIn = seconds + 1;
    model.player.position = { x: rival.position.x, y: y + 110 };
    bot.combat.energy = 100;
  }
  for (const scrap of model.particles.slots) {
    scrap.state = 'inactive';
    if (fixture === 'dense' && scrap.id < 120) {
      Object.assign(scrap, { x: origin.x - 650 + (scrap.id % 20) * 50,
        y: y - 75 + Math.floor(scrap.id / 20) * 30, state: 'active', resourceId: undefined });
    }
  }

  // Capture the actual dispatched steering once per step. The production model remains unmodified.
  const observed = model as unknown as { botSteering: (bot: Bot, seconds: number) => Steering };
  const steering = observed.botSteering.bind(model);
  let local: Point | undefined;
  observed.botSteering = (participant, dt) => {
    const command = steering(participant, dt);
    if (participant === bot) local = command.kind === 'target' ? command.point : undefined;
    return command;
  };
  const frames: Frame[] = [];
  const committedGoal = bot.target.point;
  let distance = 0;
  let exposure = 0;
  let pass: number | undefined;
  for (let i = 0; i < seconds / step; i++) {
    if (fixture === 'pursuit') {
      model.player.position = { x: rival.position.x + (i % 2 ? 4 : -4), y: y + 110 };
    }
    const previous = bot.position;
    const oldGoal = bot.target?.point;
    if (oldGoal === committedGoal) bot.decisionIn = seconds + 1;
    model.step({ kind: 'idle' }, step);
    const navigation = (bot as Bot & { navigation?: NavigationTrace }).navigation;
    const strategic = bot.target?.point;
    const mode = navigation?.mode ?? (model.hazards!.sites.length && local && local !== strategic ? 'avoid' : 'direct');
    distance += Math.hypot(bot.position.x - previous.x, bot.position.y - previous.y);
    if (model.hazards!.sites.some((h) => Math.hypot(bot.position.x - h.x, bot.position.y - h.y) < h.radius + bot.radius)) exposure += step;
    if (pass === undefined && bot.position.x >= origin.x + 700) pass = (i + 1) * step;
    frames.push({ t: (i + 1) * step, x: bot.position.x, y: bot.position.y, vx: bot.velocity.x, vy: bot.velocity.y,
      heading: bot.heading, strategic: navigation?.strategicTarget ?? (model.hazards!.sites.length ? strategic : local),
      local: navigation?.activeWaypoint ?? local, mode, side: navigation?.avoidanceSide });
  }
  let reversals = 0;
  let fastTurns = 0;
  let lastFastTurn = -Infinity;
  let targetChanges = 0;
  let modeChanges = 0;
  let entries = 0;
  let exits = 0;
  let sideChanges = 0;
  let littleProgress = 0;
  let lastSide: number | undefined;
  for (const [i, frame] of frames.entries()) {
    const previous = frames[i - 1];
    if (previous) {
      if (Math.abs(shortestAngle(previous.heading, frame.heading)) > Math.PI / 2) reversals++;
      if (Math.hypot((frame.strategic?.x ?? 0) - (previous.strategic?.x ?? 0),
          (frame.strategic?.y ?? 0) - (previous.strategic?.y ?? 0)) > 50) targetChanges++;
      if (frame.mode !== previous.mode) {
        modeChanges++;
        if (previous.mode === 'direct') entries++;
        if (frame.mode === 'direct') exits++;
      }
    }
    if (frame.t - lastFastTurn >= 0.25 && frames.slice(Math.max(0, i - 15), i)
        .some((earlier) => Math.abs(shortestAngle(earlier.heading, frame.heading)) > Math.PI / 2)) {
      fastTurns++;
      lastFastTurn = frame.t;
    }
    const earlier = frames[i - 60];
    if (earlier?.strategic && frame.strategic && frame.local &&
        Math.hypot(frame.strategic.x - earlier.strategic.x, frame.strategic.y - earlier.strategic.y) < 22 &&
        Math.hypot(frame.x - frame.strategic.x, frame.y - frame.strategic.y) > 70 &&
        Math.hypot(frame.x - earlier.x, frame.y - earlier.y) < 92) littleProgress += step;

    if (frame.side !== undefined) {
      if (lastSide !== undefined && frame.side !== lastSide) sideChanges++;
      lastSide = frame.side;
    } else lastSide = undefined;
  }
  const nav = (bot as Bot & { navigation?: NavigationTrace }).navigation;
  const result = { fixture, difficulty, mass, distance: Math.round(distance), exposure: +exposure.toFixed(2),
    pass: pass === undefined ? null : +pass.toFixed(2), reversals, fastTurns, targetChanges, modeChanges, entries, exits,
    sideChanges, littleProgress: +littleProgress.toFixed(2), stuck: nav?.stuckRecoveries ?? null,
    recoveryTime: nav?.stuckTime ?? null, pickups: bot.pickupsCollected, attacks: bot.combat.hits + bot.combat.misses };
  console.log(JSON.stringify({ ...result, ...(trace ? { frames } : {}) }));
}

const trace = process.argv.includes('--trace');
if (process.argv.includes('--matrix')) {
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    for (const mass of [20, 100, 400, 1500, 4352]) {
      for (const fixture of ['heat', 'pair', 'wall'] as const) measure(fixture, difficulty, mass, trace);
    }
  }
} else {
  for (const fixture of names) measure(fixture, 'normal', fixture === 'flux' ? 400 : 20, trace);
}
