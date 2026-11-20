import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceAttraction } from '../src/attraction';
import { arena, scrapConfig } from '../src/config';
import { addMass, attractionReach, physicalScaleForMass } from '../src/growth';
import { advance, createPlayer, type Player, type Point } from '../src/movement';
import { ParticlePool } from '../src/particles';
import { MagnetScale } from '../src/view';

const fullArena = { left: 0, top: 0, right: arena.width, bottom: arena.height };
const near = (actual: number, expected: number, tolerance = 1e-7) => assert.ok(
  Math.abs(actual - expected) < tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`,
);

function withScrap(player: Player, ...positions: Point[]) {
  const pool = new ParticlePool(17, player, positions.length);
  positions.forEach((position, id) => Object.assign(pool.slots[id], position));
  return pool;
}

function assertLegalSpawn(point: Point, player: Player) {
  assert.ok(point.x >= 5 && point.x <= arena.width - 5);
  assert.ok(point.y >= 5 && point.y <= arena.height - 5);
  const distance = Math.hypot(point.x - player.position.x, point.y - player.position.y);
  assert.ok(distance > Math.max(player.radius + 5, attractionReach(player.physicalScale)));
}

test('physical growth starts at mass 20, follows the continuous formula, and caps at scale four', () => {
  const player = createPlayer();
  assert.equal(player.mass, 20);
  assert.equal(player.physicalScale, 1);
  assert.equal(player.radius, 30);
  let previous = 1;
  for (const mass of [21, 80, 120, 620, 2000, 2500, 1e6]) {
    addMass(player, mass - player.mass);
    assert.equal(player.mass, mass);
    assert.ok(player.physicalScale >= previous && player.physicalScale <= 4);
    near(player.physicalScale, Math.min(4, 1 + 0.32 * (Math.sqrt(mass / 20) - 1)));
    near(player.radius, 30 * physicalScaleForMass(mass));
    previous = player.physicalScale;
  }
  assert.equal(player.physicalScale, 4);
  assert.equal(player.radius, 120);
});

test('normal reach starts at 118 and scales according to the approved capped formula', () => {
  assert.equal(attractionReach(1), 118);
  near(attractionReach(2), 118 * Math.sqrt(2));
  assert.equal(attractionReach(4), 230);
  assert.equal(attractionReach(100), 230);
});

test('the center-based field starts pulling at the reach boundary and leaves farther scrap alone', () => {
  const player = createPlayer();
  const { x, y } = player.position;
  const pool = withScrap(player, { x: x + 118.01, y }, { x: x + 118, y });
  assert.equal(advanceAttraction(pool, player, 1 / 60).length, 0);
  assert.equal(pool.slots[0].x, x + 118.01);
  assert.ok(pool.slots[1].x < x + 118);
  assert.ok(pool.slots[1].x > x + player.radius + pool.slots[1].radius);
});

test('the enlarged field attracts scrap that was outside the starting reach', () => {
  const player = createPlayer();
  const { x, y } = player.position;
  const pool = withScrap(player, { x: x + 180, y });
  advanceAttraction(pool, player, 1 / 60);
  assert.equal(pool.slots[0].x, x + 180);
  addMass(player, 2480);
  advanceAttraction(pool, player, 1 / 60);
  assert.ok(pool.slots[0].x < x + 180);
});

test('inward pull accelerates and integrates consistently across stationary time steps', () => {
  const player = createPlayer();
  const { x, y } = player.position;
  const far = { x: x + 114, y };
  const close = { x: x + 65, y };
  const single = withScrap(player, far, close);
  const split = withScrap(player, far, close);
  advanceAttraction(single, player, 0.04);
  for (let i = 0; i < 8; i++) advanceAttraction(split, player, 0.005);
  near(single.slots[0].x, split.slots[0].x);
  near(single.slots[1].x, split.slots[1].x);
  assert.ok(close.x - single.slots[1].x > far.x - single.slots[0].x);
  assert.equal(player.mass, 20);
});

test('a moving collector pulls toward its latest position at common simulation rates', () => {
  const coarsePlayer = createPlayer();
  const finePlayer = createPlayer();
  const { x, y } = coarsePlayer.position;
  const piece = { x: x + 112, y };
  const coarse = withScrap(coarsePlayer, piece);
  const fine = withScrap(finePlayer, piece);
  const steering = { kind: 'joystick', point: { x: 0, y: 0.35 } } as const;

  for (let i = 0; i < 4; i++) {
    advance(coarsePlayer, steering, 1 / 30);
    advanceAttraction(coarse, coarsePlayer, 1 / 30);
  }
  for (let i = 0; i < 16; i++) {
    advance(finePlayer, steering, 1 / 120);
    advanceAttraction(fine, finePlayer, 1 / 120);
  }
  assert.ok(coarse.slots[0].x < piece.x && coarse.slots[0].y > piece.y);
  near(coarse.slots[0].x, fine.slots[0].x, 3);
  near(coarse.slots[0].y, fine.slots[0].y, 3);
  assert.equal(coarsePlayer.mass, 20);
  assert.equal(finePlayer.mass, 20);
});

test('pulling stops at contact even in a long step and a coincident pickup stays finite', () => {
  const player = createPlayer();
  const { x, y } = player.position;
  const pool = withScrap(player, { x: x + 118, y }, { x, y });
  const events = advanceAttraction(pool, player, 1e3);
  assert.equal(events.length, 2);
  near(events[0].x, x + 35);
  near(events[0].y, y);
  assert.equal(events[1].x, x);
  assert.equal(events[1].y, y);
  assert.equal(player.mass, 22);
});

test('a collection batch pays one mass per pickup and uses one radius for all contacts', () => {
  const player = createPlayer();
  const { x, y } = player.position;
  const pool = withScrap(player, { x: x + 35, y }, { x, y: y - 35 }, { x: x + 35.1, y });
  const events = advanceAttraction(pool, player, 0);
  assert.deepEqual(events.map(({ id }) => id), [0, 1]);
  assert.equal(player.mass, 22);
  assert.equal(pool.slots[2].state, 'active');
  assert.deepEqual(advanceAttraction(pool, player, 0).map(({ id }) => id), [2]);
  assert.equal(player.mass, 23);
  assert.equal(advanceAttraction(pool, player, 1).length, 0);
  assert.equal(player.mass, 23);
});

test('a recycled slot rejects stale claims and collection events retain their contact position', () => {
  const player = createPlayer();
  const position = { ...player.position };
  const pool = withScrap(player, position);
  const slot = pool.slots[0];
  const [event] = advanceAttraction(pool, player, 1 / 60);
  assert.equal(slot.state, 'collected');
  assert.equal(pool.collect(event.id, event.generation), undefined);
  pool.replenish(player, fullArena);
  assert.equal(pool.slots[0], slot);
  assert.equal(slot.state, 'active');
  assert.equal(slot.generation, event.generation + 1);
  assert.equal(pool.collect(event.id, event.generation), undefined);
  assert.equal(advanceAttraction(pool, player, 1 / 60).length, 0);
  assert.equal(player.mass, 21);
  assert.deepEqual({ x: event.x, y: event.y }, position);
  assertLegalSpawn(slot, player);
  Object.assign(slot, position);
  assert.equal(advanceAttraction(pool, player, 1 / 60).length, 1);
  assert.equal(player.mass, 22);
});

test('default seeded scrap is spread across the arena and stays outside the initial field', () => {
  const player = createPlayer();
  const pool = new ParticlePool(42, player);
  const active = pool.slots.filter(({ state }) => state === 'active');
  assert.equal(pool.slots.length, 1500);
  assert.equal(active.length, 600);
  const quadrants = new Set(active.map(({ x, y }) =>
    `${x < arena.width / 2}:${y < arena.height / 2}`,
  ));
  assert.equal(quadrants.size, 4);
  for (const slot of active) assertLegalSpawn(slot, player);
});

test('full-capacity recycling reuses the original slots without increasing population', () => {
  const player = createPlayer();
  const pool = new ParticlePool(0, player, 2000);
  assert.equal(pool.slots.length, scrapConfig.capacity);
  const originalSlots = [...pool.slots];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const slot of pool.slots) Object.assign(slot, player.position);
    assert.equal(advanceAttraction(pool, player, 0).length, 1500);
    pool.replenish(player, fullArena);
    assert.equal(pool.slots.length, 1500);
    pool.slots.forEach((slot, id) => {
      assert.equal(slot, originalSlots[id]);
      assert.equal(slot.id, id);
      assert.equal(slot.state, 'active');
      assert.equal(slot.generation, cycle + 2);
      assertLegalSpawn(slot, player);
    });
  }
  assert.equal(player.mass, 4520);
});

test('respawn prefers a small legal offscreen band and can fall back when the whole arena is visible', () => {
  const player = createPlayer();
  const pool = withScrap(player, player.position);
  const view = { ...fullArena, right: arena.width - 40 };
  assert.equal(advanceAttraction(pool, player, 0).length, 1);
  pool.replenish(player, view);
  const slot = pool.slots[0];
  assert.ok(slot.x - slot.radius >= view.right);
  assertLegalSpawn(slot, player);

  Object.assign(slot, player.position);
  assert.equal(advanceAttraction(pool, player, 0).length, 1);
  pool.replenish(player, fullArena);
  assertLegalSpawn(slot, player);
});

test('the same seed and input reproduce attraction, collection, and recycled spawn sequences', () => {
  function run(seed: number) {
    const player = createPlayer();
    const pool = new ParticlePool(seed, player);
    const view = { left: 0, top: 0, right: 1600, bottom: 900 };
    const events = [];
    for (let i = 0; i < 480; i++) {
      const steering = { kind: 'joystick', point: i < 240 ? { x: 1, y: 0 } : { x: 0, y: 1 } } as const;
      advance(player, steering, 1 / 60);
      events.push(...advanceAttraction(pool, player, 1 / 60));
      pool.replenish(player, view);
    }
    assert.ok(events.length > 0);
    return { player, slots: pool.slots, events };
  }
  const first = run(2026);
  assert.deepEqual(run(2026), first);
  assert.notDeepEqual(run(2027), first);
});

for (const mass of [20, 620, 2500]) {
  test(`all walls and corners remain collectible at mass ${mass}`, () => {
    const min = scrapConfig.radius;
    const right = arena.width - min;
    const bottom = arena.height - min;
    const positions = [
      { x: min, y: min }, { x: right, y: min },
      { x: min, y: bottom }, { x: right, y: bottom },
      { x: min, y: 1600 }, { x: right, y: 1600 },
      { x: 2400, y: min }, { x: 2400, y: bottom },
      { x: right - 0.001, y: bottom - 0.001 },
    ];
    for (const position of positions) {
      const player = createPlayer();
      addMass(player, mass - player.mass);
      const pool = withScrap(player, position);
      advance(player, { kind: 'target', point: position }, 20);
      const reach = attractionReach(player.physicalScale);
      assert.ok(Math.hypot(position.x - player.position.x, position.y - player.position.y) <= reach);
      const [event] = advanceAttraction(pool, player, 1);
      assert.ok(event, `Expected scrap at (${position.x}, ${position.y}) to be collectible`);
      assert.equal(player.mass, mass + 1);
      const { x, y } = player.position;
      assert.ok(x >= player.radius && x <= arena.width - player.radius);
      assert.ok(y >= player.radius && y <= arena.height - player.radius);
      if (position.x === right) assert.equal(x, arena.width - player.radius);
      if (position.y === bottom) assert.equal(y, arena.height - player.radius);
    }
  });
}

test('maximum radius clamps movement at exact right and bottom limits without changing speed', () => {
  const player = createPlayer();
  addMass(player, 2480);
  advance(player, { kind: 'joystick', point: { x: 1, y: 0 } }, 0.5);
  assert.equal(player.velocity.x, 460);
  advance(player, { kind: 'target', point: { x: arena.width, y: arena.height } }, 20);
  assert.deepEqual(player.position, { x: 4680, y: 3080 });
});

test('collision uses physical growth while the drawing scale is still catching up', () => {
  const player = createPlayer();
  const visual = new MagnetScale();
  addMass(player, 100);
  const previousRadius = player.radius;
  visual.update(player.physicalScale, 1 / 60);
  assert.ok(visual.scale > 1 && visual.scale < player.physicalScale);
  assert.equal(player.radius, previousRadius);

  const offset = (visual.scale * 30 + previousRadius) / 2 + 5;
  const pool = withScrap(player, { x: player.position.x + offset, y: player.position.y });
  assert.equal(advanceAttraction(pool, player, 0).length, 1);
  assert.equal(player.mass, 121);
  visual.update(player.physicalScale, 5);
  near(visual.scale, player.physicalScale);
});
