import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArenaModel } from '../src/arena-model';
import { BotAI } from '../src/bot-ai';
import { createBots } from '../src/bots';
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

test('Collectors favor nearby dense live scrap while Roamers keep seeded waypoints independent of scrap', () => {
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
  assert.equal(collector.target?.kind, 'scrap');
  assert.ok(collector.target.id > 0);
  assert.equal(roamer.target?.kind, 'waypoint');
  assert.deepEqual(roamer.target, roamWithoutScrap.target);
  assert.ok(distance(roamer.target.point, roamer.position) >= botConfig.roamer.waypointMinDistance);
});

test('Collectors retain a viable target until a meaningfully better option and reject stale generations', () => {
  const [bot] = createBots(10);
  bot.position = { x: 1000, y: 1000 };
  const pool = new ParticlePool(50, [bot], 2);
  const [first, second] = pool.slots;
  Object.assign(first, { x: 1340, y: 1000 });
  Object.assign(second, { x: 3500, y: 1600 });
  const ai = new BotAI();
  ai.update([bot], pool.slots, delta);
  assert.equal(bot.target?.kind, 'scrap');
  assert.equal(bot.target.id, first.id);
  const retained = bot.target;

  Object.assign(second, { x: 1320, y: 1000 });
  ai.update([bot], pool.slots, botConfig.collector.decisionSeconds);
  assert.equal(bot.target, retained);

  Object.assign(second, { x: 1060, y: 1000 });
  ai.update([bot], pool.slots, botConfig.collector.decisionSeconds);
  assert.equal(bot.target?.kind, 'scrap');
  assert.equal(bot.target.id, second.id);
  const oldTarget = bot.target;
  const claim = pool.collect(second.id, second.generation, bot.id);
  assert.ok(claim);
  pool.replenish([bot], fullArena);
  Object.assign(second, { x: 4600, y: 1800 });
  assert.deepEqual(oldTarget.point, { x: 1060, y: 1000 });
  ai.update([bot], pool.slots, delta);
  assert.equal(bot.target?.kind, 'scrap');
  assert.equal(bot.target.id, first.id);
});

test('Collectors index the exact right and bottom limits when evaluating an edge region', () => {
  const [bot] = createBots(5);
  bot.position = { x: arena.width - 100, y: arena.height - 100 };
  const pool = new ParticlePool(7, [bot], 1);
  Object.assign(pool.slots[0], { x: arena.width - 5, y: arena.height - 5 });
  new BotAI().update([bot], pool.slots, delta);
  assert.equal(bot.target?.kind, 'scrap');
  assert.equal(bot.target.id, 0);
  assert.deepEqual(bot.target.point, { x: 4795, y: 3195 });
});

test('Roamers continually leave corners for legal waypoints at the shared, steady speed', () => {
  const roamer = createBots(12)[2];
  addMass(roamer, 2500);
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
