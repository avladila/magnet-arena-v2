import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArenaModel } from '../src/arena-model';
import { createBots, type Bot } from '../src/bots';
import { hazardConfig, navigationConfig, tacticsConfig } from '../src/competition-config';
import { arena, playerConfig } from '../src/config';
import { addMass } from '../src/growth';
import type { Hazard, HazardKind } from '../src/hazards';
import { advance, type Participant, type Point } from '../src/movement';
import { shortestAngle } from '../src/view';

const dt = 1 / 60;
const center = { x: 7680, y: 5000 };
const goal = { x: center.x + 1200, y: center.y };

function hazard(kind: HazardKind, x = center.x, y = center.y): Hazard {
  return { x, y, kind, radius: hazardConfig[kind].radius, contacts: new Set(), victims: new Map(), readyAt: 0 };
}

function botAt(x = center.x - 900, y = center.y, mass = 20): Bot {
  const [bot] = createBots(42);
  bot.position = { x, y };
  addMass(bot, mass - 20);
  return bot;
}

function travel(bot: Bot, end: Point, sites: Hazard[], safety = 50, avoidCold = true) {
  const frames = [];
  for (let frame = 0; frame < 600; frame++) {
    const previous = bot.position;
    const previousHeading = bot.heading;
    advance(bot, bot.navigation.steer(bot, end, sites, safety, avoidCold, dt), dt);
    const speed = Math.hypot(bot.velocity.x, bot.velocity.y);
    assert.ok(speed <= playerConfig.speed + 1e-7, 'the same speed cap applies to steering');
    const { x, y } = bot.position;
    assert.ok(x >= bot.radius && x <= arena.width - bot.radius && y >= bot.radius && y <= arena.height - bot.radius);
    if (frame > 0 && speed > 4 && Math.hypot(x - previous.x, y - previous.y) > 0.2) {
      assert.ok(Math.abs(shortestAngle(previousHeading, bot.heading)) <= navigationConfig.emergencyTurnRate * dt + 1e-7);
    }
    frames.push({ x, y, speed, heading: bot.heading, mode: bot.navigation.mode, side: bot.navigation.avoidanceSide });
    if (Math.hypot(x - end.x, y - end.y) < 1.5 && bot.navigation.mode === 'direct') break;
  }
  return frames;
}

function reached(bot: Bot, end: Point): void {
  assert.ok(Math.hypot(bot.position.x - end.x, bot.position.y - end.y) < 1.5, 'the intended destination was reached');
}

test('the integrated bot retains its collection destination and clears the full route before ending a heat detour', () => {
  const model = new ArenaModel(42, 'normal');
  const [bot] = model.bots;
  const site = hazard('heat');
  model.hazards!.sites.splice(0, model.hazards!.sites.length, site);
  bot.position = { x: center.x - 900, y: center.y };
  bot.target = { kind: 'waypoint', point: goal };
  const strategy = bot.target;
  bot.decisionIn = 10;
  model.player.position = { x: 500, y: 500 };
  for (const other of model.bots.slice(1)) other.position = { x: 800, y: 800 };
  for (const resource of model.particles.slots) resource.state = 'inactive';

  let detourFrames = 0;
  let exit: Point | undefined;
  const sides = new Set<number>();
  let leftDetour = false;
  for (let frame = 0; frame < 480; frame++) {
    model.step({ kind: 'idle' }, dt);
    if (bot.navigation.mode === 'detour') {
      assert.equal(bot.target, strategy);
      assert.deepEqual(bot.navigation.strategicTarget, goal);
      assert.ok(!leftDetour, 'the obstruction should be passed with one committed detour');
      sides.add(bot.navigation.avoidanceSide!);
      if (detourFrames++ === 0) {
        assert.ok(Math.hypot(bot.position.x - site.x, bot.position.y - site.y) >
          site.radius + bot.radius + tacticsConfig.normal.safety, 'entry is predictive');
      }
    } else if (detourFrames > 0 && !exit) {
      leftDetour = true;
      exit = bot.position;
    }
    if (bot.position.x >= goal.x - 12) break;
  }
  assert.ok(bot.position.x >= goal.x - 12);
  assert.ok(exit);
  assert.ok(detourFrames * dt >= navigationConfig.commitmentSeconds - dt);
  assert.equal(sides.size, 1);
  const dx = goal.x - exit.x;
  const dy = goal.y - exit.y;
  const q = Math.max(0, Math.min(1, ((site.x - exit.x) * dx + (site.y - exit.y) * dy) / (dx * dx + dy * dy)));
  const minimum = site.radius + bot.radius + tacticsConfig.normal.safety + navigationConfig.clearance + navigationConfig.exitClearance;
  assert.ok(Math.hypot(exit.x + q * dx - site.x, exit.y + q * dy - site.y) >= minimum - playerConfig.speed * dt);
  assert.equal(bot.combat.heat, 0);
});

test('open routes stay at ordinary speed and deliberate idle keeps the last meaningful heading', () => {
  const bot = botAt();
  const frames = travel(bot, goal, []);
  assert.equal(frames[0].mode, 'direct');
  assert.ok(Math.abs(frames[0].speed - playerConfig.speed) < 1e-7);
  assert.ok(frames.every((frame) => frame.y === center.y && frame.mode === 'direct'));
  reached(bot, goal);
  const oldHeading = bot.heading;
  for (let frame = 0; frame < 100; frame++) advance(bot, bot.navigation.steer(bot, undefined, [], 50, false, dt), dt);
  assert.equal(bot.heading, oldHeading);
  assert.deepEqual(bot.velocity, { x: 0, y: 0 });
  assert.equal(bot.navigation.stuckRecoveries, 0);
});

test('stable detours finish around single, paired and wall-side hazards at all five masses and three difficulties', () => {
  for (const [level, { safety }] of Object.entries(tacticsConfig)) {
    for (const mass of [20, 100, 400, 1500, 4352]) {
      for (const sites of [
        [hazard('heat')],
        [hazard('heat'), hazard('acid', center.x + 265, center.y - 125)],
        [hazard('heat', center.x, 355)],
      ]) {
        const y = sites[0].y === 355 ? 380 : center.y;
        const bot = botAt(center.x - 900, y, mass);
        const end = { x: goal.x, y };
        const frames = travel(bot, end, sites, safety);
        reached(bot, end);
        assert.ok(frames.some((frame) => frame.mode === 'detour'), level + ' ' + mass);
        assert.ok(frames.every((frame) => sites.every((site) =>
          Math.hypot(frame.x - site.x, frame.y - site.y) >= site.radius + bot.radius)), level + ' ' + mass + ' stayed clear');
        assert.equal(bot.navigation.stuckRecoveries, 0);
      }
    }
  }
});

test('a giant turning toward a new destination slows before movement reaches the wall', () => {
  const bot = botAt(center.x + 1100, 450, 4352);
  bot.heading = -0.63;
  bot.velocity = { x: 370, y: -273 };
  const end = { x: bot.position.x - 750, y: 526 };
  const frames = travel(bot, end, []);
  assert.ok(frames.some((frame) => frame.speed < playerConfig.speed / 2));
  assert.ok(frames.every((frame) => frame.y > bot.radius));
  assert.equal(bot.navigation.stuckRecoveries, 0);
  reached(bot, end);
});

test('Flux is a passage for a small magnet and an avoided hazard for a vulnerable magnet', () => {
  const site = hazard('flux');
  const small = botAt();
  const large = botAt(center.x - 900, center.y, 400);
  const through = travel(small, goal, [site]);
  const around = travel(large, goal, [site]);
  assert.ok(through.some((frame) => Math.abs(frame.x - site.x) < site.radius));
  assert.ok(through.every((frame) => frame.mode === 'direct' && frame.y === center.y));
  assert.ok(around.some((frame) => frame.mode === 'detour'));
  assert.ok(around.every((frame) => Math.hypot(frame.x - site.x, frame.y - site.y) > site.radius + large.radius));
  reached(small, goal);
  reached(large, goal);
});

test('heat and risky cold escapes are committed, including after a growth change or next to a wall', () => {
  for (const site of [hazard('heat'), hazard('cold', center.x, 355)]) {
    const bot = botAt(site.x - 300, site.y);
    advance(bot, bot.navigation.steer(bot, { x: goal.x, y: site.y }, [site], 50, true, dt), dt);
    assert.equal(bot.navigation.mode, 'detour');
    addMass(bot, 1480);
    assert.ok(Math.hypot(bot.position.x - site.x, bot.position.y - site.y) < bot.radius + site.radius);
    const end = { x: goal.x, y: site.y };
    const frames = travel(bot, end, [site]);
    assert.equal(frames[0].mode, 'escape');
    assert.equal(frames.filter((frame, index) => frame.mode === 'escape' && frames[index - 1]?.mode !== 'escape').length, 1);
    reached(bot, end);
  }
});

test('nearby cold remains traversable outside tactical risk', () => {
  const bot = botAt();
  const frames = travel(bot, goal, [hazard('cold')], 50, false);
  assert.ok(frames.every((frame) => frame.mode === 'direct' && frame.y === center.y));
  reached(bot, goal);
});

test('an active route with no displacement requests recovery without teleporting', () => {
  const bot = botAt();
  const position = bot.position;
  let replans = 0;
  for (let frame = 0; frame < 70; frame++) {
    bot.navigation.steer(bot, goal, [], 50, false, dt);
    if (bot.navigation.takeReplanRequest()) replans++;
  }
  assert.equal(replans, 1);
  assert.equal(bot.navigation.stuckRecoveries, 1);
  assert.equal(bot.navigation.stuckTime, navigationConfig.stuckSeconds);
  assert.equal(bot.position, position);
});

test('a close contender must earn the opponent switch', () => {
  const model = new ArenaModel(3, 'normal');
  const [bot, alternate] = model.bots;
  bot.position = center;
  addMass(model.player, 110);
  addMass(alternate, 110);
  for (const other of model.bots.slice(2)) other.position = { x: 500, y: 500 };
  model.hazards!.sites.length = 0;
  const tactics = model as unknown as {
    elapsed: number;
    botSteering: (bot: Bot, seconds: number) => unknown;
    tactics: Map<Bot, { victim?: Participant }>;
  };
  const place = (magnet: Participant, gap: number, side: number) => {
    magnet.position = { x: center.x + side * (bot.radius + magnet.radius + gap), y: center.y };
  };
  place(model.player, 210, -1);
  place(alternate, 230, 1);
  tactics.botSteering(bot, dt);
  assert.equal(tactics.tactics.get(bot)!.victim, model.player);
  place(alternate, 195, 1);
  tactics.elapsed += 0.1;
  tactics.botSteering(bot, dt);
  assert.equal(tactics.tactics.get(bot)!.victim, model.player);
  tactics.elapsed += 0.2;
  tactics.botSteering(bot, dt);
  assert.equal(tactics.tactics.get(bot)!.victim, model.player);
  place(alternate, 105, 1);
  tactics.elapsed += 0.26;
  tactics.botSteering(bot, dt);
  assert.equal(tactics.tactics.get(bot)!.victim, alternate);
});

test('identical simulations leave navigation, heading, resources and tactics deterministic', () => {
  const first = new ArenaModel(8481, 'hard');
  const second = new ArenaModel(8481, 'hard');
  const view = { left: 7000, right: 8350, top: 4550, bottom: 5450 };
  for (let frame = 0; frame < 420; frame++) {
    for (const model of [first, second]) {
      model.step({ kind: 'target', point: { x: frame < 210 ? 8200 : 7050, y: 5180 } }, dt);
      if (frame % 15 === 0) model.replenish(view);
    }
  }
  for (const [i, bot] of first.bots.entries()) {
    const other = second.bots[i];
    assert.deepEqual(bot.position, other.position);
    assert.deepEqual(bot.velocity, other.velocity);
    assert.equal(bot.heading, other.heading);
    assert.deepEqual(bot.combat, other.combat);
    assert.deepEqual(bot.navigation.activeWaypoint, other.navigation.activeWaypoint);
    assert.equal(bot.navigation.avoidanceSide, other.navigation.avoidanceSide);
  }
  assert.deepEqual(first.particles.slots, second.particles.slots);
});
