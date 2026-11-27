import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ArenaModel } from '../src/arena-model';
import { advanceAttraction, AttractionGrid } from '../src/attraction';
import { brand } from '../src/brand';
import { arena, populationConfig, resourceBudget } from '../src/config';
import { addMass } from '../src/growth';
import { advance } from '../src/movement';

const dt = 1 / 60;

test('twenty complete competitors start in seeded legal positions with fair local resources', () => {
  const roster = new ArenaModel(11, 'normal').bots;
  const { frames } = JSON.parse(readFileSync('public/magnets.json', 'utf8'));
  assert.deepEqual(Object.fromEntries([...new Set(roster.map(({ strategy }) => strategy))].map((strategy) =>
    [strategy, roster.filter((bot) => bot.strategy === strategy).length])),
  { collector: 5, hunter: 4, charger: 3, scavenger: 3, roamer: 2, opportunist: 2 });
  for (const bot of roster) {
    assert.ok(bot.name.length > 0);
    for (let stage = 0; stage < brand.shellStages.length; stage++) assert.ok(frames[`${bot.id}-${stage}`]);
  }
  assert.equal(new Set(roster.map(({ accent }) => accent)).size, roster.length);
  for (const seed of [1, 10, 43, 211, 8481, 19414]) {
    const { bots, player, participants, particles, hazards } = new ArenaModel(seed, 'normal');
    assert.equal(participants.length, 20);
    assert.equal(new Set(participants.map(({ id }) => id)).size, participants.length);
    const budget = resourceBudget(participants.length);
    const live = particles.slots.filter(({ state }) => state === 'active');
    assert.deepEqual(budget, { activeCount: 2880, capacity: 3600 });
    assert.equal(live.length, budget.activeCount);
    assert.equal(particles.slots.length, budget.capacity);
    assert.equal(new Set(live.map(({ resourceId }) => resourceId)).size, live.length);
    assert.equal(hazards!.sites.length, 72);
    assert.equal(particles.regionStats.cacheLimit, 176);
    assert.ok(particles.regionStats.cachedRegions <= particles.regionStats.cacheLimit);
    let localBots = 0;
    for (const magnet of participants) {
      const { position: { x, y }, radius } = magnet;
      assert.ok(x >= radius && y >= radius && x <= arena.width - radius && y <= arena.height - radius);
      for (const other of participants) {
        if (other !== magnet) assert.ok(Math.hypot(x - other.position.x, y - other.position.y) > radius + other.radius);
      }
      for (const site of hazards!.sites) assert.ok(Math.hypot(x - site.x, y - site.y) > radius + site.radius);
      assert.ok(live.filter((piece) => (piece.x - x) ** 2 + (piece.y - y) ** 2 < 800 ** 2).length >= 20);
      const gap = Math.hypot(x - player.position.x, y - player.position.y);
      if (gap >= 400 && gap <= 1600) localBots++;
    }
    assert.ok(localBots >= 4 && localBots <= 6);
    assert.deepEqual(bots.map(({ position }) => position), new ArenaModel(seed, 'normal').bots.map(({ position }) => position));
  }
});

test('legacy population and isolated training both retain their own pool sizes', () => {
  const legacy = new ArenaModel(42, 'normal', false, { participantCount: populationConfig.legacy, combat: 'legacy' });
  const tutorial = new ArenaModel(42, 'normal', true);
  assert.equal(legacy.participants.length, 5);
  assert.equal(legacy.particles.slots.length, 1500);
  assert.equal(legacy.particles.slots.filter(({ state }) => state === 'active').length, 720);
  assert.equal(legacy.particles.regionStats.cacheLimit, 80);
  assert.equal(tutorial.participants.length, 2);
  assert.equal(tutorial.tutorial?.dummy, tutorial.bots[0]);
  assert.equal(tutorial.particles.slots.length, populationConfig.tutorialSlots);
});

test('indexed pickup claims match the full scan with twenty competitors across hazards, edges and sizes', () => {
  const indexed = new ArenaModel(141, 'normal');
  const exact = new ArenaModel(141, 'normal');
  const grid = new AttractionGrid();
  for (const model of [indexed, exact]) {
    for (const [i, participant] of model.participants.entries()) {
      addMass(participant, [0, 80, 380, 1480, 4332][i % 5]);
      participant.combat.heat = i % 4 === 0 ? 1 : i % 3 * 0.2;
      participant.combat.brittle = i % 2 === 0;
    }
  }
  let collected = 0;
  for (let frame = 0; frame < 140; frame++) {
    const steer = { kind: 'target' as const, point: { x: frame < 80 ? 7000 : 8100, y: 4960 } };
    for (const model of [indexed, exact]) {
      for (const participant of model.participants) advance(participant, steer, dt);
    }
    const a = advanceAttraction(indexed.particles, indexed.participants, dt, grid);
    const b = advanceAttraction(exact.particles, exact.participants, dt);
    collected += a.collections.length;
    assert.deepEqual(a, b);
  }
  assert.ok(collected > 20);
  assert.deepEqual(indexed.particles.slots, exact.particles.slots);
  assert.deepEqual(indexed.participants.map(({ mass, combat }) => ({ mass, combat })),
    exact.participants.map(({ mass, combat }) => ({ mass, combat })));
});

test('the populated AI retreats from a smaller ready rival and excludes guarded targets', () => {
  const model = new ArenaModel(83, 'normal');
  const giant = model.bots[0];
  const hunter = model.bots.find(({ strategy }) => strategy === 'hunter')!;
  model.hazards!.sites.length = 0;
  for (const bot of model.bots) bot.position = { x: 1600, y: 1500 };
  giant.position = { x: 8100, y: 5000 };
  model.player.position = { x: 7630, y: 5000 };
  addMass(giant, 1900);
  model.player.combat.energy = 100;
  model.step({ kind: 'idle' }, dt);
  assert.ok(giant.navigation.strategicTarget!.x > giant.position.x + 400);

  hunter.combat.energy = 100;
  hunter.position = { x: 7660, y: 4970 };
  model.player.position = { x: 12000, y: 7200 };
  giant.combat.guardFor = 1.5;
  for (let i = 0; i < 36; i++) model.step({ kind: 'idle' }, dt);
  const tactics = (model as unknown as { tactics: Map<object, { victim?: object }> }).tactics;
  assert.notEqual(tactics.get(hunter)!.victim, giant);
  assert.equal(hunter.combat.energy, 100);
});

test('a scavenger can chase contested salvage but avoids its own locked fragments', () => {
  const model = new ArenaModel(393, 'normal');
  const scavenger = model.bots.find(({ strategy }) => strategy === 'scavenger')!;
  const position = { x: 8100, y: 5000 };
  model.hazards!.sites.length = 0;
  for (const bot of model.bots) bot.position = { x: 1600, y: 1500 };
  scavenger.position = position;
  function fragment(x: number, victimId: string, value: number) {
    const point = { x, y: position.y };
    return { ...point, origin: point, destination: point, age: 0.7, value,
      source: { victimId, credits: [{ id: model.bots[0].id, value }] }, offset: 0 };
  }
  const locked = fragment(position.x + 185, scavenger.id, 200);
  const contested = fragment(position.x - 260, model.bots[1].id, 100);
  model.salvage.chunks.push(locked, contested);
  model.step({ kind: 'idle' }, dt);
  assert.deepEqual(scavenger.navigation.strategicTarget, contested.destination);
  assert.equal(scavenger.combat.salvage, 0);
});
