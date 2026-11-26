import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArenaActivity } from '../src/arena-activity';
import { ArenaModel } from '../src/arena-model';
import { activityConfig } from '../src/competition-config';
import { ArenaCamera } from '../src/view';

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test('seeded hotspots are spaced, ramp up, and rotate when their lifetime ends', () => {
  const { particles, participants } = new ArenaModel(41, 'normal');
  const a = new ArenaActivity(41);
  const b = new ArenaActivity(41);
  for (const manager of [a, b]) manager.update(0, particles.slots, participants);
  assert.equal(a.hotspots.length, activityConfig.count);
  assert.deepEqual(a.hotspots, b.hotspots);
  const first = [...a.hotspots];
  assert.ok(first.every(({ strength }) => strength === 0));
  for (const [i, spot] of first.entries()) {
    assert.ok(first.slice(i + 1).every((other) => distance(spot, other) > activityConfig.spacing));
  }
  for (const manager of [a, b]) manager.update(activityConfig.fade + 1, particles.slots, participants);
  assert.ok(a.hotspots.every(({ strength }) => strength === 1));
  const expiry = Math.min(...first.map((spot) => spot.expires));
  for (const manager of [a, b]) manager.update(expiry, particles.slots, participants);
  assert.ok(a.hotspots.every(({ expires }) => expires > expiry));
  assert.deepEqual(a.hotspots, b.hotspots);
});

test('public signals select a region with scrap and reachable competitors, then clear on depletion', () => {
  const { particles, participants } = new ArenaModel(61, 'normal');
  const manager = new ArenaActivity(61);
  manager.update(activityConfig.firstSignal - 0.1, particles.slots, participants);
  assert.ok(!Boolean(manager.signal));
  manager.update(activityConfig.firstSignal + activityConfig.signalJitter, particles.slots, participants);
  const spot = manager.signal;
  assert.ok(spot);
  assert.ok(spot.resources >= activityConfig.signalMinimum);
  assert.ok(participants.filter((who) => distance(who.position, spot) <= 2645).length >= 3);
  for (const scrap of particles.slots) if (distance(scrap, spot) < activityConfig.radius + 1) scrap.state = 'inactive';
  manager.update(spot.starts + 1, particles.slots, participants);
  assert.equal(manager.signal, undefined);
});

test('hotspot weighting keeps natural supply, visible coordinates and slot identities', () => {
  const model = new ArenaModel(101, 'normal');
  const { particles, participants, player } = model;
  const camera = new ArenaCamera(player.position);
  camera.resize(1366, 768);
  const bounds = camera.bounds;
  const active = particles.slots.filter((scrap) => scrap.state === 'active' &&
    scrap.x >= bounds.left && scrap.x <= bounds.right && scrap.y >= bounds.top && scrap.y <= bounds.bottom);
  const visible = active.map(({ id, x, y, generation, resourceId }) => ({ id, x, y, generation, resourceId }));
  const zone = { ...player.position, radius: 500, starts: 0, expires: 42, strength: 1 };
  for (let i = 0; i < 8; i++) particles.replenish(participants, bounds, 0.3, [zone]);
  for (const old of visible) {
    const now = particles.slots[old.id];
    assert.deepEqual({ id: now.id, x: now.x, y: now.y, generation: now.generation, resourceId: now.resourceId }, old);
  }
  const live = particles.slots.filter(({ state }) => state === 'active');
  assert.equal(live.length, 2880);
  assert.equal(new Set(live.map(({ resourceId }) => resourceId)).size, live.length);
  assert.equal(particles.regionStats.duplicateActivations, 0);
  assert.equal(particles.regionStats.visibleFallbacks, 0);
});

test('training never creates hotspot or signal objectives', () => {
  const model = new ArenaModel(46, 'normal', true);
  model.step({ kind: 'idle' }, 120);
  assert.deepEqual(model.hotspots, []);
  assert.equal(model.signal, undefined);
});
