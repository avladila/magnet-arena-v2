import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArenaModel } from '../src/arena-model';
import { advanceAttraction, type AttractionResult } from '../src/attraction';
import { createBots } from '../src/bots';
import { arena } from '../src/config';
import { addMass, attractionReach } from '../src/growth';
import { createPlayer, type Participant, type Point } from '../src/movement';
import { ParticlePool } from '../src/particles';

const fullArena = { left: 0, top: 0, right: arena.width, bottom: arena.height };
const idle = { kind: 'idle' } as const;

function withScrap(participants: readonly Participant[], ...positions: Point[]) {
  const pool = new ParticlePool(42, participants, positions.length);
  positions.forEach((position, id) => Object.assign(pool.slots[id], position));
  return pool;
}

function assertSafeSpawn(point: Point, participants: readonly Participant[]) {
  assert.ok(point.x >= 5 && point.x <= arena.width - 5);
  assert.ok(point.y >= 5 && point.y <= arena.height - 5);
  for (const participant of participants) {
    const distance = Math.hypot(point.x - participant.position.x, point.y - participant.position.y);
    assert.ok(distance > Math.max(participant.radius + 5, attractionReach(participant.physicalScale)));
  }
}

test('contested pull uses one integration toward the closest surface rather than the closest center', () => {
  const player = createPlayer();
  const [bot] = createBots(4);
  player.position = { x: 905, y: 1000 };
  bot.position = { x: 1070, y: 1000 };
  addMass(player, 80);
  const contest = withScrap([player, bot], { x: 1000, y: 1000 });
  const onlyWinner = withScrap([player], { x: 1000, y: 1000 });
  // The bot is 70 units from the center, but the larger player's surface is closer.
  assert.equal(advanceAttraction(contest, [bot, player], 1 / 30).collections.length, 0);
  advanceAttraction(onlyWinner, [player], 1 / 30);
  assert.ok(contest.slots[0].x < 1000);
  assert.equal(contest.slots[0].x, onlyWinner.slots[0].x);
  assert.equal(contest.slots[0].y, onlyWinner.slots[0].y);
});

test('two bots pull a contested piece only toward the winning bot', () => {
  const [left, right] = createBots(14);
  left.position = { x: 1930, y: 1500 };
  right.position = { x: 2060, y: 1500 };
  const pool = withScrap([left, right], { x: 2000, y: 1500 });
  assert.equal(advanceAttraction(pool, [left, right], 0.025).collections.length, 0);
  assert.ok(pool.slots[0].x > 2000);
  const result = advanceAttraction(pool, [left, right], 0.5);
  assert.deepEqual(result.collections.map((event) => event.ownerId), [right.id]);
  assert.equal(result.contestedCollections, 1);
  assert.equal(left.mass, 20);
  assert.equal(right.mass, 21);
});

test('direct contact wins and the deepest contact picks one owner from overlapping magnets', () => {
  const player = createPlayer();
  const bots = createBots(2);
  const participants = [player, ...bots];
  player.position = { x: 1000, y: 1000 };
  bots[0].position = { x: 1030, y: 1000 };
  bots[1].position = { x: 1010, y: 1000 };
  bots[2].position = { x: 1060, y: 1000 };
  bots[3].position = { x: 3300, y: 2000 };
  const pool = withScrap(participants, { x: 1010, y: 1000 });
  const { collections, contestedCollections } = advanceAttraction(pool, participants, 0);
  assert.equal(collections.length, 1);
  assert.equal(collections[0].ownerId, 'bot-2');
  assert.equal(contestedCollections, 1);
  assert.deepEqual(participants.map((participant) => participant.mass), [20, 20, 21, 20, 20]);
  assert.deepEqual(participants.map((participant) => participant.pickupsCollected), [0, 0, 1, 0, 0]);
});

test('an exact tie uses the stable ID with either participant order', () => {
  for (const distance of [25, 75]) {
    function run(reverse: boolean) {
      const player = createPlayer();
      const [first, second] = createBots(9);
      player.position = { x: 1500, y: 1500 - distance };
      first.position = { x: 1500 - distance, y: 1500 };
      second.position = { x: 1500 + distance, y: 1500 };
      const participants = [player, first, second];
      if (reverse) participants.reverse();
      const pool = withScrap(participants, { x: 1500, y: 1500 });
      const result = advanceAttraction(pool, participants, 1);
      assert.equal(result.contestedCollections, 1);
      assert.equal(first.pickupsCollected, 1);
      assert.equal(player.mass, 20);
      assert.equal(second.mass, 20);
      return result;
    }
    const result = run(false);
    assert.deepEqual(run(true), result);
    assert.equal(result.collections[0].ownerId, 'bot-1');
  }
});

test('batch growth cannot change the winner of a later pickup in the same step', () => {
  const player = createPlayer();
  const [bot] = createBots(9);
  player.position = { x: 1070.1, y: 1200 };
  bot.position = { x: 1000, y: 1200 };
  const participants = [bot, player];
  const pool = withScrap(participants, bot.position, { x: 1035.1, y: 1200 });
  const result = advanceAttraction(pool, participants, 0);
  assert.deepEqual(result.collections.map(({ id, ownerId }) => [id, ownerId]), [[0, bot.id], [1, player.id]]);
  assert.equal(result.contestedCollections, 2);
  assert.deepEqual([bot.mass, player.mass], [21, 21]);
  assert.ok(bot.radius + pool.slots[1].radius > 35.1);
});

test('a collected lifetime cannot pay again, even after a different magnet claims its recycled slot', () => {
  const player = createPlayer();
  const [bot] = createBots(7);
  const participants = [player, bot];
  const pool = withScrap(participants, bot.position);
  const [event] = advanceAttraction(pool, participants, 0).collections;
  assert.equal(event.ownerId, bot.id);
  assert.equal(pool.collect(event.id, event.generation, player.id), undefined);
  assert.equal(advanceAttraction(pool, participants, 1).collections.length, 0);
  pool.replenish(participants, fullArena);
  assert.equal(pool.collect(event.id, event.generation, bot.id), undefined);
  assert.equal(advanceAttraction(pool, participants, 1).collections.length, 0);
  assert.equal(bot.mass, 21);
  assert.equal(player.mass, 20);
  Object.assign(pool.slots[0], player.position);
  const [newEvent] = advanceAttraction(pool, participants, 0).collections;
  assert.equal(newEvent.id, event.id);
  assert.equal(newEvent.generation, event.generation + 1);
  assert.equal(newEvent.ownerId, player.id);
  assert.equal(player.mass, 21);
  assert.equal(bot.mass, 21);
});

test('one shared pool starts and replenishes at 720 active pieces outside all five fields', () => {
  const model = new ArenaModel(10);
  const { particles, participants, bots } = model;
  assert.equal(particles.slots.length, 1500);
  assert.equal(particles.slots.filter((slot) => slot.state === 'active').length, 720);
  for (const slot of particles.slots) {
    if (slot.state === 'active') assertSafeSpawn(slot, participants);
  }

  // A clustered, large group must still leave legal offscreen respawns.
  const center = model.player.position;
  for (const [index, bot] of bots.entries()) {
    bot.position = { x: center.x + 40 + index * 20, y: center.y + 50 + index * 10 };
    addMass(bot, 4332);
  }
  const slot = particles.slots[0];
  Object.assign(slot, bots[0].position);
  const result = advanceAttraction(particles, participants, 0);
  assert.ok(result.collections.length > 0);
  const view = { left: center.x - 500, top: center.y - 600, right: center.x + 600, bottom: center.y + 600 };
  model.replenish(view);
  const bySlot = new Map(result.collections.map((event) => [event.id, event]));
  for (const [id, event] of bySlot) {
    const recycled = particles.slots[id];
    assertSafeSpawn(recycled, participants);
    assert.equal(recycled.generation, event.generation + 1);
    assert.ok(recycled.x < view.left || recycled.x > view.right || recycled.y < view.top || recycled.y > view.bottom);
  }
  assert.equal(particles.slots[0], slot);
  assert.equal(particles.slots.filter((piece) => piece.state === 'active').length, 720);
});

test('the fully visible fallback still excludes all grown attraction fields', () => {
  const participants = [createPlayer(), ...createBots(10)];
  participants.forEach((participant, i) => {
    participant.position = { x: 120, y: Math.max(120, 5 + 461 * i) };
    addMass(participant, 4332);
  });
  const pool = withScrap(participants, participants[0].position);
  assert.equal(advanceAttraction(pool, participants, 0).collections.length, 1);
  pool.replenish(participants, fullArena);
  assert.equal(pool.regionStats.visibleFallbacks, 1);
  assertSafeSpawn(pool.slots[0], participants);
  assert.equal(pool.slots[0].state, 'active');
});

test('seeded multi-magnet runs repeat the movement, ownership events, and recycled positions', () => {
  function run(seed: number) {
    const model = new ArenaModel(seed);
    const { x, y } = model.player.position;
    const events: AttractionResult[] = [];
    for (let frame = 0; frame < 360; frame++) {
      const steering = { kind: 'target', point: { x: x + 1900, y: y + (frame < 180 ? -700 : 900) } } as const;
      const result = model.step(steering, 1 / 30)!;
      if (result.collections.length) events.push(result);
      model.replenish(fullArena);
    }
    for (const participant of model.participants) {
      assert.ok(participant.pickupsCollected > 0);
      assert.equal(participant.mass, 20 + participant.pickupsCollected);
      const scale = Math.min(12, 1 + 0.8 * (Math.sqrt(participant.mass / 20) - 1));
      assert.equal(participant.physicalScale, scale);
      assert.equal(participant.radius, 30 * scale);
      const reach = scale <= 4 ? Math.min(230, 118 * Math.sqrt(scale)) : 30 * scale + 110 * Math.sqrt(scale / 4);
      assert.equal(attractionReach(scale), reach);
    }
    assert.equal(events.flatMap((result) => result.collections).length,
      model.participants.reduce((sum, participant) => sum + participant.pickupsCollected, 0));
    return { events, snapshot: JSON.stringify([model.participants, model.particles.slots]) };
  }
  const first = run(2026);
  assert.deepEqual(run(2026), first);
  assert.notDeepEqual(run(2291), first);
});

test('a paused or invalid model step leaves movement, target timing, and resources intact', () => {
  const model = new ArenaModel(104);
  const snapshot = () => JSON.stringify([model.participants, model.particles.slots]);
  const original = snapshot();
  for (const delta of [0, -1, Infinity, NaN]) {
    assert.equal(model.step(idle, delta), undefined);
    assert.equal(snapshot(), original);
  }
  const expected = new ArenaModel(104);
  expected.step(idle, 1 / 60);
  model.step(idle, 1 / 60);
  assert.equal(snapshot(), JSON.stringify([expected.participants, expected.particles.slots]));
});
