import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArenaModel } from '../src/arena-model';
import { advanceAttraction } from '../src/attraction';
import { arena, botConfig, regionConfig, scrapConfig } from '../src/config';
import { addMass, attractionReach } from '../src/growth';
import { createPlayer, type Point } from '../src/movement';
import { ParticlePool, type Scrap, type WorldBounds } from '../src/particles';
import { regionAt, regionBounds } from '../src/regions';
import { ArenaCamera } from '../src/view';

const delta = 1 / 30;
const center = { x: 7680, y: 5000 };

function inside({ x, y }: Point, view: WorldBounds, padding = 0): boolean {
  return x >= view.left - padding && x <= view.right + padding && y >= view.top - padding && y <= view.bottom + padding;
}

function checkBudget(pool: ParticlePool, expected = scrapConfig.activeCount): Scrap[] {
  const active = pool.slots.filter((slot) => slot.state === 'active');
  assert.equal(active.length, expected);
  assert.ok(active.every((slot) => slot.resourceId !== undefined));
  assert.equal(new Set(active.map((slot) => slot.resourceId)).size, expected);
  assert.equal(pool.slots.length, 1500);
  return active;
}

function viewAt(point: Point): WorldBounds {
  const camera = new ArenaCamera(point);
  camera.resize(1040, 740);
  return camera.bounds;
}

test('the tenfold world keeps the center spawn and translated, jittered bot anchors', () => {
  assert.deepEqual(arena, { width: 15360, height: 10000 });
  assert.equal(arena.width * arena.height, 10 * 4800 * 3200);
  const model = new ArenaModel(2026);
  assert.deepEqual(model.player.position, center);
  const anchors = [[8340, 4920], [6260, 5940], [9090, 4010], [6340, 4230]];
  model.bots.forEach(({ position, radius }, index) => {
    const [x, y] = anchors[index];
    assert.ok(Math.abs(position.x - x) <= botConfig.spawnJitter);
    assert.ok(Math.abs(position.y - y) <= botConfig.spawnJitter);
    assert.ok(inside(position, { left: radius, top: radius, right: arena.width - radius, bottom: arena.height - radius }));
  });
});

test('region IDs remain stable at boundaries and cover the partial last row', () => {
  assert.equal(regionAt({ x: 0, y: 0 }), 0);
  assert.equal(regionAt({ x: 960 - 0.01, y: 960 - 0.01 }), 0);
  assert.equal(regionAt({ x: 960, y: 0 }), 1);
  assert.equal(regionAt({ x: 960, y: 960 }), 17);
  assert.equal(regionAt({ x: arena.width, y: arena.height }), 175);
  assert.deepEqual(regionBounds(17), { left: 960, top: 960, right: 1920, bottom: 1920 });
  assert.deepEqual(regionBounds(175), { left: 14400, top: 9600, right: 15360, bottom: 10000 });
});

test('overlapping interests share unique sites regardless of participant order', () => {
  const { participants, bots } = new ArenaModel(2026);
  bots.forEach((bot, index) => { bot.position = { x: center.x + 60 + index * 35, y: center.y - 100 }; });
  const reverse = [...participants].reverse();
  const first = new ParticlePool(912, participants);
  const second = new ParticlePool(912, reverse);
  for (const point of [center, { x: 9000, y: 6000 }, { x: 9000, y: 8100 }, center]) {
    participants[0].position = point;
    const view = viewAt(point);
    first.replenish(participants, view, 0.25);
    second.replenish(reverse, view, 0.25);
    assert.deepEqual(checkBudget(first), checkBudget(second));
    assert.deepEqual(first.regionStats, second.regionStats);
    assert.equal(first.regionStats.duplicateActivations, 0);
    assert.ok(participants.every((participant) => participant.mass === 20));
  }
});

test('opening scrap supplies the player and a resize leaves live placements intact', () => {
  for (const seed of [2026, 3881, 912, 1549, 6021]) {
    const model = new ArenaModel(seed);
    const { particles } = model;
    const opening = checkBudget(particles);
    const local = { left: center.x - 400, top: center.y - 400, right: center.x + 400, bottom: center.y + 400 };
    const count = opening.filter((slot) => inside(slot, local)).length;
    assert.ok(count >= 15 && count <= 50);
    const saved = structuredClone(opening);
    const camera = new ArenaCamera(center);
    for (const [width, height] of [[1040, 740], [390, 844], [844, 390]]) {
      camera.resize(width, height);
      model.replenish(camera.bounds);
      assert.deepEqual(checkBudget(particles), saved);
    }
    assert.equal(particles.regionStats.plans, 1);
  }
});

test('scrap pulled across a region line keeps its slot binding and pays one winner', () => {
  const player = createPlayer();
  const { bots: [bot] } = new ArenaModel(7);
  player.position = { x: 1050, y: 600 };
  bot.position = { ...player.position };
  const participants = [player, bot];
  const pool = new ParticlePool(7, participants, 1);
  const [slot] = pool.slots;
  const { id, generation, resourceId } = slot;
  Object.assign(slot, { x: 954, y: 600 });
  const before = regionAt(slot);
  assert.equal(advanceAttraction(pool, participants, 0.04).collections.length, 0);
  assert.notEqual(regionAt(slot), before);
  pool.replenish(participants, viewAt(player.position), 0.25);
  assert.equal(slot.generation, generation);
  assert.equal(slot.resourceId, resourceId);
  assert.equal(pool.regionStats.renewed, 0);

  const { collections } = advanceAttraction(pool, participants, 1);
  assert.deepEqual(collections.map((event) => [event.id, event.generation, event.ownerId]), [[id, generation, bot.id]]);
  assert.equal(player.mass, 20);
  assert.equal(bot.mass, 21);
  assert.equal(pool.collect(id, generation, player.id), undefined);
  pool.replenish(participants, viewAt(player.position), 0.25);
  assert.equal(pool.regionStats.renewed, 1);
  assert.equal(slot.generation, generation + 1);
  assert.equal(pool.collect(id, generation, player.id), undefined);
  for (const p of participants) {
    assert.ok(Math.hypot(slot.x - p.position.x, slot.y - p.position.y) > attractionReach(p.physicalScale));
  }
  assert.equal(advanceAttraction(pool, participants, delta).collections.length, 0);
  checkBudget(pool, 1);
});

test('rapid crossings preserve visible slot bindings and a cached area restores sleeping sites on return', () => {
  const player = createPlayer();
  player.position = { x: 959, y: 959 };
  const view = viewAt(player.position);
  const pool = new ParticlePool(912, [player], 240);
  const saved = checkBudget(pool, 240).filter((slot) => inside(slot, view)).map((slot) => ({ ...slot }));
  assert.ok(saved.length >= 15);
  for (let i = 0; i < 16; i++) {
    player.position.x = i % 2 ? 959 : 961;
    pool.replenish([player], view, regionConfig.planSeconds);
    for (const slot of saved) assert.deepEqual(pool.slots[slot.id], slot);
  }

  const away = { x: 6000, y: 7000 };
  player.position = away;
  pool.replenish([player], viewAt(away), 0.25);
  const moved = saved.find(({ id, generation }) => pool.slots[id].generation !== generation)!;
  assert.ok(moved);
  assert.equal(pool.collect(moved.id, moved.generation, player.id), undefined);
  player.position = { x: 959, y: 959 };
  pool.replenish([player], viewAt(away), 0.25);
  const returned = new Map(checkBudget(pool, 240).map((slot) => [slot.resourceId, slot]));
  assert.ok(saved.every(({ resourceId, x, y, colorIndex }) => {
    const slot = returned.get(resourceId);
    return slot?.x === x && slot.y === y && slot.colorIndex === colorIndex;
  }));
  assert.equal(pool.regionStats.evicted, 0);
  assert.equal(pool.regionStats.renewed, 0);
  assert.equal(player.mass, 20);
});

test('dormant regions refresh deterministically after expiry with bounded site history', () => {
  const sweep: Point[] = [];
  for (const y of [200, 3500, 6800, 9800]) {
    for (const x of [200, 3900, 7600, 11300, 15100]) sweep.push({ x, y });
  }
  function run() {
    const player = createPlayer();
    const pool = new ParticlePool(1549, [player]);
    const layout = () => new Map(checkBudget(pool).map(({ resourceId, x, y }) => [resourceId, { x, y }]));
    const initial = layout();
    for (const point of sweep) {
      player.position = point;
      pool.replenish([player], viewAt(point), 0.25);
      checkBudget(pool);
      assert.ok(pool.regionStats.cachedRegions <= regionConfig.cacheLimit);
      assert.ok(pool.regionStats.logicalSites <= regionConfig.cacheLimit * 43);
    }
    assert.ok(pool.regionStats.evicted > 0);
    const evictions = pool.regionStats.evicted;
    pool.replenish([player], viewAt(player.position), regionConfig.cacheSeconds + 1);
    assert.ok(pool.regionStats.evicted > evictions);
    player.position = { ...center };
    pool.replenish([player], viewAt(sweep.at(-1)!), 0.25);
    const refreshed = layout();
    assert.ok([...refreshed].some(([id, point]) => initial.has(id) && initial.get(id)!.x !== point.x));
    assert.equal(pool.regionStats.duplicateActivations, 0);
    assert.equal(player.mass, 20);
    return { refreshed, stats: pool.regionStats };
  }
  assert.deepEqual(run(), run());
});

test('all five magnets get local scrap with widely separated corner interests', () => {
  for (const seed of [2026, 3881, 912, 1549, 6021]) {
    const { player, participants, bots, particles } = new ArenaModel(seed);
    const positions = [{ x: 105, y: 105 }, { x: 15255, y: 105 }, { x: 105, y: 9895 },
      { x: 15255, y: 9895 }, { x: 7680, y: 9895 }];
    participants.forEach((p, index) => { p.position = positions[index]; });
    particles.replenish(participants, viewAt(center), 0.25);
    const active = checkBudget(particles);
    for (const { position } of [player, ...bots]) {
      const left = Math.min(arena.width - 800, Math.max(0, position.x - 400));
      const top = Math.min(arena.height - 800, Math.max(0, position.y - 400));
      const local = { left, top, right: left + 800, bottom: top + 800 };
      const count = active.filter((slot) => inside(slot, local)).length;
      assert.ok(count >= 14, `Seed ${seed} has ${count} nearby pieces at ${position.x}, ${position.y}`);
    }
  }
});

test('continuous corner travel streams offscreen and distant bots keep collecting', () => {
  const model = new ArenaModel(2026);
  const { player, bots, particles } = model;
  const camera = new ArenaCamera(player.position);
  camera.resize(390, 844);
  const path = new Set<number>();
  const offscreenOwners = new Set<string>();
  const outsideOldArea = new Set<string>();
  const oldArea = { left: 5280, top: 3400, right: 10080, bottom: 6600 };
  for (let frame = 0; frame < 26 * 30; frame++) {
    const result = model.step({ kind: 'target', point: { x: 0, y: 0 } }, delta)!;
    camera.follow(player.position, delta, player.mass);
    const view = camera.bounds;
    assert.ok(view.left >= -1e-7 && view.top >= -1e-7 && view.right <= arena.width + 1e-7 && view.bottom <= arena.height + 1e-7);
    const visible = particles.slots.filter((slot) => slot.state === 'active' && inside(slot, view, slot.radius))
      .map(({ id, generation }) => [id, generation]);
    model.replenish(view);
    const active = checkBudget(particles);
    assert.deepEqual(active.filter((slot) => inside(slot, view, slot.radius)).map(({ id, generation }) => [id, generation]), visible);
    path.add(regionAt(player.position));
    for (const bot of bots) {
      if (!inside(bot.position, oldArea)) outsideOldArea.add(bot.strategy);
      if (!inside(bot.position, view) && result.collections.some((event) => event.ownerId === bot.id)) offscreenOwners.add(bot.id);
    }
  }
  assert.ok(path.size >= 10);
  assert.equal(player.position.x, player.radius);
  assert.equal(player.position.y, player.radius);
  assert.ok(player.pickupsCollected >= 40);
  assert.deepEqual([...offscreenOwners].sort(), bots.map(({ id }) => id));
  assert.deepEqual([...outsideOldArea].sort(), ['collector', 'roamer']);
  assert.equal(particles.regionStats.visibleFallbacks, 0);
});

test('overlapping giant fields reserve safe scrap as the player grows and travels to a wall', () => {
  const model = new ArenaModel(2026);
  const { player, bots, participants, particles } = model;
  for (const participant of participants) addMass(participant, (participant === player ? 3900 : 4352) - participant.mass);
  bots[0].position = { x: player.position.x + 200, y: player.position.y };
  const camera = new ArenaCamera(player.position);
  camera.resize(390, 844);
  camera.follow(player.position, 10, player.mass);

  const generations = new Uint32Array(scrapConfig.capacity);
  const offscreenOwners = new Set<string>();
  let contested = 0;
  for (let frame = 0; frame < 30 * 30; frame++) {
    const corner = frame < 22 * 30 ? { x: 0, y: 0 } : { x: arena.width, y: 0 };
    const result = model.step({ kind: 'target', point: corner }, delta)!;
    contested += result.contestedCollections;
    camera.follow(player.position, delta, player.mass);
    const view = camera.bounds;
    const visible = particles.slots.filter((slot) => slot.state === 'active' && inside(slot, view, slot.radius));
    const before = visible.map(({ id, generation }) => [id, generation]);
    for (const slot of particles.slots) generations[slot.id] = slot.generation;
    model.replenish(view);
    const active = checkBudget(particles);
    assert.deepEqual(active.filter((slot) => inside(slot, view, slot.radius)).map(({ id, generation }) => [id, generation]), before);
    for (const slot of active) {
      if (slot.generation === generations[slot.id]) continue;
      for (const participant of participants) {
        const { x, y } = participant.position;
        assert.ok((x - slot.x) ** 2 + (y - slot.y) ** 2 > attractionReach(participant.physicalScale) ** 2);
      }
    }
    for (const event of result.collections) {
      assert.equal(particles.collect(event.id, event.generation, player.id), undefined);
      const bot = bots.find(({ id }) => id === event.ownerId);
      if (bot && !inside(bot.position, view, bot.radius)) offscreenOwners.add(bot.id);
    }
  }
  assert.equal(player.position.y, player.radius);
  assert.ok(player.mass > 4000);
  assert.ok(contested > 0);
  assert.deepEqual([...offscreenOwners].sort(), bots.map(({ id }) => id));
  assert.ok(particles.regionStats.peakCachedRegions <= regionConfig.cacheLimit);
  assert.equal(particles.regionStats.duplicateActivations, 0);
  assert.equal(particles.regionStats.visibleFallbacks, 0);
});
