import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArenaModel } from '../src/arena-model';
import { BotAI } from '../src/bot-ai';
import { createBots, type BotTarget } from '../src/bots';
import { arena, botConfig, playerConfig } from '../src/config';
import { addMass } from '../src/growth';
import { advance, createPlayer, type Point } from '../src/movement';
import { ParticlePool } from '../src/particles';
import { ArenaCamera, Heading } from '../src/view';

const delta = 1 / 60;
const fullArena = { left: 0, top: 0, right: arena.width, bottom: arena.height };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

test('four seeded bots have stable, legal, separated starting positions and distinct identities', () => {
  const player = createPlayer();
  const bots = createBots(99);
  assert.deepEqual(bots.map(({ id, name, strategy }) => [id, name, strategy]), [
    ['bot-1', 'Copper', 'collector'], ['bot-2', 'Spark', 'collector'],
    ['bot-3', 'Drift', 'roamer'], ['bot-4', 'Orbit', 'roamer'],
  ]);
  const startingPositions = (seed: number) => createBots(seed).map((bot) => bot.position);
  assert.deepEqual(startingPositions(99), bots.map((bot) => bot.position));
  assert.notDeepEqual(startingPositions(98), startingPositions(99));
  assert.equal(new Set(bots.map(({ accent }) => accent)).size, 4);
  const participants = [player, ...bots];
  assert.equal(new Set(participants.map(({ id }) => id)).size, 5);
  participants.forEach((positioned, index) => {
    const { x, y } = positioned.position;
    assert.equal(positioned.mass, 20);
    assert.equal(positioned.radius, 30);
    assert.equal(positioned.pickupsCollected, 0);
    assert.ok(x >= positioned.radius && x <= arena.width - positioned.radius);
    assert.ok(y >= positioned.radius && y <= arena.height - positioned.radius);
    for (const other of participants.slice(index + 1)) {
      assert.ok(distance(positioned.position, other.position) > positioned.radius + other.radius);
    }
  });
  for (const bot of bots) {
    assert.equal(bot.kind, 'bot');
    assert.ok(Number.isInteger(bot.accent) && bot.accent > 0 && bot.accent < 0xffffff);
  }
});

test('Collectors route through dense regions while Roamers keep waypoints independent of scrap', () => {
  const [collector, , roamer] = createBots(6);
  const roamWithoutScrap = createBots(6)[2];
  collector.position = { x: 1200, y: 1200 };
  roamer.position = { ...collector.position };
  roamWithoutScrap.position = { ...collector.position };
  const pool = new ParticlePool(1, [collector, roamer], 9);
  Object.assign(pool.slots[0], { x: 1240, y: 1210 });
  for (const slot of pool.slots.slice(1, 9)) {
    Object.assign(slot, { x: 1460 + slot.id, y: 1210 });
  }
  const ai = new BotAI();
  ai.update([collector, roamer], pool.slots, delta);
  ai.update([roamWithoutScrap], [], delta);
  assert.equal(collector.target?.kind, 'region');
  const columns = Math.ceil(arena.width / botConfig.collector.cellSize);
  assert.equal(collector.target.cell, 5 * columns + 6);
  const { x, y } = collector.target.point;
  assert.ok(x > 1560 && y > 1320);
  assert.ok(Math.abs((x - 1200) / (y - 1200) - 3) < 1e-8);
  assert.equal(roamer.target?.kind, 'waypoint');
  assert.deepEqual(roamer.target, roamWithoutScrap.target);
  assert.ok(distance(roamer.target.point, roamer.position) >= botConfig.roamer.waypointMinDistance);
});

test('a Collector picks a live local cell deep in the expanded arena', () => {
  const [bot] = createBots(6);
  bot.position = { x: 12000, y: 7200 };
  const pool = new ParticlePool(7, [bot], 20);
  const [near, ...others] = pool.slots.slice(0, 20);
  Object.assign(near, { x: 12365, y: 7260 });
  for (const [index, slot] of others.entries()) {
    Object.assign(slot, index < 9 ? { x: 11780 + index, y: 7050 } : { x: 13500 + index, y: 7450 });
    if (index < 9) assert.ok(pool.collect(slot.id, slot.generation, bot.id));
  }
  new BotAI().update([bot], pool.slots, delta);
  const size = botConfig.collector.cellSize;
  assert.equal(bot.target?.kind, 'region');
  assert.equal(bot.target.cell, Math.floor(near.y / size) * Math.ceil(arena.width / size) + Math.floor(near.x / size));
});

test('a pickup and a newly available region leave the current route intact until the decision expires', () => {
  const [bot] = createBots(10);
  bot.position = { x: 1000, y: 1000 };
  const pool = new ParticlePool(50, [bot], 2);
  const [first, second] = pool.slots;
  Object.assign(first, { x: 1340, y: 1000 });
  Object.assign(second, { x: 3500, y: 1600 });
  const ai = new BotAI();
  ai.update([bot], pool.slots, delta);
  const route = bot.target;
  assert.equal(route?.kind, 'region');
  const destination = { ...route.point };
  assert.equal(bot.decisionIn, botConfig.collector.decisionSeconds);
  assert.ok(distance(bot.position, route.point) >=
    playerConfig.speed * botConfig.collector.minCommitmentSeconds);

  const claim = pool.collect(first.id, first.generation, bot.id);
  assert.ok(claim);
  pool.replenish([bot], fullArena);
  Object.assign(first, { x: 3800, y: 1750 });
  Object.assign(second, { x: 650, y: 1000 });
  ai.update([bot], pool.slots, botConfig.collector.minCommitmentSeconds);
  assert.equal(bot.target, route);
  assert.deepEqual(route.point, destination);

  ai.update([bot], pool.slots, bot.decisionIn + delta);
  assert.equal(bot.target?.kind, 'region');
  assert.notEqual(bot.target.cell, route.cell);
  assert.ok(bot.target.point.x < bot.position.x);
});

test('a spent region falls back to a moving waypoint at the next decision', () => {
  const [bot] = createBots(17);
  bot.position = { x: 1400, y: 1400 };
  const pool = new ParticlePool(51, [bot], 1);
  const [slot] = pool.slots;
  Object.assign(slot, { x: 1770, y: 1390 });
  const ai = new BotAI();
  ai.update([bot], pool.slots, delta);
  assert.equal(bot.target?.kind, 'region');
  const route = bot.target;
  assert.ok(pool.collect(slot.id, slot.generation, bot.id));

  ai.update([bot], pool.slots, bot.decisionIn - delta);
  assert.equal(bot.target, route);
  ai.update([bot], pool.slots, 2 * delta);
  const fallback = bot.target as BotTarget | undefined;
  assert.equal(fallback?.kind, 'waypoint');
  const previous = bot.position;
  advance(bot, { kind: 'target', point: fallback.point }, delta);
  assert.ok(Math.abs(distance(bot.position, previous) - playerConfig.speed * delta) < 1e-8);
});

test('growth invalidates an old wall endpoint even while its commitment timer is active', () => {
  const [bot] = createBots(5);
  bot.position = { x: arena.width - 390, y: arena.height - 400 };
  bot.target = { kind: 'region', cell: 279, point: { x: arena.width - 95, y: arena.height - 95 } };
  bot.decisionIn = botConfig.collector.decisionSeconds;
  addMass(bot, 4332);
  assert.equal(bot.radius, 360);
  const pool = new ParticlePool(7, [bot], 1);
  Object.assign(pool.slots[0], { x: arena.width - 5, y: arena.height - 5 });
  new BotAI().update([bot], pool.slots, delta);
  const fallback = bot.target as BotTarget | undefined;
  assert.equal(fallback?.kind, 'waypoint');
  const { x, y } = fallback.point;
  assert.ok(x >= bot.radius && x <= arena.width - bot.radius);
  assert.ok(y >= bot.radius && y <= arena.height - bot.radius);
  assert.ok(distance(bot.position, fallback.point) >= botConfig.roamer.waypointMinDistance);
  advance(bot, { kind: 'target', point: fallback.point }, delta);
  assert.ok(Math.abs(Math.hypot(bot.velocity.x, bot.velocity.y) - playerConfig.speed) < 1e-8);
});

test('a wall-shortened region route has enough runway to stay committed until arrival', () => {
  const [bot] = createBots(7);
  bot.position = { x: arena.width - 880, y: 1800 };
  const pool = new ParticlePool(9, [bot], 7);
  for (const slot of pool.slots.slice(0, 7)) {
    Object.assign(slot, { x: arena.width - 360 + slot.id, y: 1800 });
  }
  const ai = new BotAI();
  ai.update([bot], pool.slots, delta);
  const route = bot.target;
  assert.equal(route?.kind, 'region');
  const arrival = bot.radius * botConfig.collector.arrivalRadiusRatio;
  const travelUntilArrival = distance(bot.position, route.point) - arrival;
  assert.ok(travelUntilArrival >= playerConfig.speed * botConfig.collector.minCommitmentSeconds);
  assert.ok(travelUntilArrival < playerConfig.speed * botConfig.collector.decisionSeconds);
  assert.ok(route.point.x <= arena.width - bot.radius - botConfig.collector.wallMargin);
  for (let frames = 0; bot.target === route; frames++) {
    assert.ok(frames <= Math.ceil(botConfig.collector.decisionSeconds / delta));
    advance(bot, { kind: 'target', point: route.point }, delta);
    ai.update([bot], pool.slots, delta);
  }
  assert.ok(bot.target);
});

test('Roamers continually leave corners for legal waypoints at the shared, steady speed', () => {
  const roamer = createBots(12)[2];
  addMass(roamer, 4332);
  roamer.position = { x: roamer.radius, y: arena.height - roamer.radius };
  const ai = new BotAI();
  let pathLength = 0;
  let turns = 0;
  let previousTarget = roamer.target;
  for (let frame = 0; frame < 600; frame++) {
    ai.update([roamer], [], delta);
    const target = roamer.target;
    assert.equal(target?.kind, 'waypoint');
    if (target !== previousTarget) {
      turns++;
      assert.ok(distance(target.point, roamer.position) >= botConfig.roamer.waypointMinDistance);
      previousTarget = target;
    }
    const previous = roamer.position;
    advance(roamer, { kind: 'target', point: target.point }, delta);
    const travel = distance(roamer.position, previous);
    assert.ok(travel <= playerConfig.speed * delta + 1e-9);
    pathLength += travel;
    const { x, y } = roamer.position;
    assert.ok(x >= roamer.radius && x <= arena.width - roamer.radius);
    assert.ok(y >= roamer.radius && y <= arena.height - roamer.radius);
    if (travel > 0.2) assert.equal(roamer.heading, Math.atan2(roamer.velocity.y, roamer.velocity.x));
  }
  assert.ok(turns >= 3 && turns <= 10);
  assert.ok(pathLength > playerConfig.speed * 9.5);
});

test('movement heading ignores blocked axes and retains its final direction at the wall', () => {
  const [bot] = createBots(1);
  const view = new Heading();
  bot.position = { x: arena.width - bot.radius, y: 50 };
  advance(bot, { kind: 'joystick', point: { x: 0.6, y: -0.8 } }, 1);
  assert.equal(bot.velocity.x, 0);
  assert.ok(bot.velocity.y < 0);
  assert.equal(bot.heading, -Math.PI / 2);
  view.update(bot.heading, delta);
  assert.ok(view.angle < 0 && view.angle > bot.heading);
  advance(bot, { kind: 'joystick', point: { x: 0.6, y: -0.8 } }, 1);
  assert.deepEqual(bot.velocity, { x: 0, y: 0 });
  assert.equal(bot.heading, -Math.PI / 2);
});

test('opposing magnets pass through each other at the ordinary movement speed', () => {
  const model = new ArenaModel(19);
  const { player } = model;
  const [bot] = model.bots;
  for (const slot of model.particles.slots) slot.state = 'inactive';
  player.position = { x: 1400, y: 1600 };
  bot.position = { x: 1584, y: 1600 };
  bot.target = { kind: 'waypoint', point: { x: 1100, y: 1600 } };
  bot.decisionIn = 2;
  const steering = { kind: 'target', point: { x: 1900, y: 1600 } } as const;
  model.step(steering, 0.2);
  assert.deepEqual(player.position, bot.position);
  model.step(steering, 0.2);
  assert.equal(player.position.x, 1584);
  assert.equal(bot.position.x, 1400);
  assert.deepEqual([player.velocity.x, bot.velocity.x], [460, -460]);
});

test('bot motion and decisions are independent of camera dimensions and zoom', () => {
  const first = new ArenaModel(106);
  const other = new ArenaModel(106);
  const camera = new ArenaCamera(other.player.position);
  const idle = { kind: 'idle' } as const;
  for (let frame = 0; frame < 180; frame++) {
    first.step(idle, delta);
    if (frame === 0 || frame === 90) camera.resize(frame === 0 ? 360 : 1040, frame === 0 ? 800 : 480);
    camera.follow({ x: 1000, y: 1200 }, delta, 1800);
    other.step(idle, delta);
  }
  assert.deepEqual(JSON.stringify(first.bots), JSON.stringify(other.bots));
  assert.ok(first.bots.every((bot) => bot.pickupsCollected > 0));
});
