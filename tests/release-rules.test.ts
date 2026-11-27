import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceAttraction } from '../src/attraction';
import { ArenaModel } from '../src/arena-model';
import { arm, cancelArm, legacyTheftDamage, release, resolveTheft, Salvage, shell, theftDamage } from '../src/combat';
import { theftConfig } from '../src/competition-config';
import { addMass } from '../src/growth';
import { Hazards } from '../src/hazards';
import { MatchClock, rankings } from '../src/match';
import { createParticipant } from '../src/movement';
import { ParticlePool, resourceKind } from '../src/particles';

test('deterministic sites approximate ordinary, gold and red energy probabilities', () => {
  const totals = { ordinary: 0, gold: 0, energy: 0 };
  for (let id = 0; id < 100_000; id++) totals[resourceKind(id)]++;
  assert.ok(Math.abs(totals.gold - 1000) < 125);
  assert.ok(Math.abs(totals.energy - 5000) < 250);
});

test('mixed resources pay exactly once and red cells never change mass', () => {
  const magnet = createParticipant('player', 'player', { x: 7000, y: 5000 });
  const pool = new ParticlePool(17, [magnet], 2, true);
  const [cell, gold] = pool.slots;
  let id = 0;
  while (resourceKind(id) !== 'energy') id++;
  Object.assign(cell, magnet.position, { resourceId: id, state: 'active' });
  while (resourceKind(id) !== 'gold') id++;
  Object.assign(gold, magnet.position, { resourceId: id, state: 'active' });
  magnet.combat.energy = 94;
  assert.equal(advanceAttraction(pool, [magnet], 0).collections.length, 2);
  assert.equal(magnet.mass, 30);
  assert.equal(magnet.combat.energy, 100);
  assert.equal(advanceAttraction(pool, [magnet], 0).collections.length, 0);
});

test('the legacy comparison rules preserve the RC3 reference damage', () => {
  const attacker = createParticipant('a', 'player', { x: 1000, y: 1000 });
  const victim = createParticipant('b', 'bot', { x: 1230, y: 1000 });
  addMass(attacker, 55);
  addMass(victim, 580);
  attacker.combat.energy = 100;
  const salvage = new Salvage();
  assert.equal(legacyTheftDamage(75, 600, shell(victim)), 108);
  assert.equal(release(attacker, 0), false);
  assert.equal(arm(attacker), true);
  cancelArm(attacker);
  assert.equal(release(attacker, 0), false);
  assert.equal(arm(attacker), true);
  assert.equal(release(attacker, 0), true);
  resolveTheft([attacker, victim], salvage, 0.17, 'legacy');
  assert.equal(victim.mass, 600);
  resolveTheft([attacker, victim], salvage, 0.01, 'legacy');
  assert.equal(victim.mass, 492);
  assert.equal(victim.combat.highest, 600);
  assert.equal(attacker.mass, 75);
  assert.equal(attacker.combat.energy, 0);
  assert.equal(salvage.chunks.length, 8);
  assert.equal(salvage.chunks.reduce((n, chunk) => n + chunk.value, 0), 108);
  salvage.step([attacker, victim], 0.3);
  assert.equal(victim.mass, 492);
  salvage.step([], 10);
  assert.equal(salvage.expiredMass, 108);
});

test('warning checks live target geometry and a miss costs only 35 energy', () => {
  const attacker = createParticipant('a', 'player', { x: 1000, y: 1000 });
  const victim = createParticipant('b', 'bot', { x: 1100, y: 1000 });
  attacker.combat.energy = 100;
  arm(attacker);
  release(attacker, 0);
  victim.position = { x: 1000, y: 900 };
  resolveTheft([attacker, victim], new Salvage(), 0.18);
  assert.equal(attacker.combat.energy, 65);
  assert.equal(attacker.combat.misses, 1);
});

test('simultaneous theft uses pre-resolution mass and can hit both directions', () => {
  const a = createParticipant('a', 'player', { x: 1000, y: 1000 });
  const b = createParticipant('b', 'bot', { x: 1120, y: 1000 });
  for (const [attacker, aim] of [[a, 0], [b, Math.PI]] as const) {
    addMass(attacker, 200);
    attacker.combat.energy = 100;
    arm(attacker);
    release(attacker, aim);
  }
  const expected = a.mass - theftDamage(b, a);
  resolveTheft([b, a], new Salvage(), 0.18);
  assert.equal(a.mass, expected);
  assert.equal(b.mass, expected);
});

test('Flux damages on entry, respects shell limits and cannot repeat while touching', () => {
  const magnet = createParticipant('p', 'player', { x: 1000, y: 1000 });
  const hazards = new Hazards(42, [magnet]);
  const flux = hazards.sites.find((site) => site.kind === 'flux')!;
  const salvage = new Salvage();
  assert.equal(hazards.sites.length, 72);
  for (const site of hazards.sites) {
    assert.ok(Math.hypot(site.x - magnet.position.x, site.y - magnet.position.y) > site.radius + 450);
  }
  addMass(magnet, 180);
  magnet.position = { x: flux.x, y: flux.y };
  hazards.step([magnet], salvage, 1 / 60);
  assert.equal(magnet.mass, 173);
  for (let i = 0; i < 360; i++) hazards.step([magnet], salvage, 1 / 60);
  assert.equal(magnet.mass, 173);
});

test('water, acid, heat and cold follow exposure timers', () => {
  const model = new ArenaModel(48, 'normal');
  const { player, hazards, salvage } = model;
  addMass(player, 180);
  function expose(kind: 'heat' | 'cold' | 'water' | 'acid', frames: number) {
    const { x, y } = hazards!.sites.find((site) => site.kind === kind)!;
    player.position = { x, y };
    for (let i = 0; i < frames; i++) hazards!.step([player], salvage, 1 / 60);
  }
  expose('water', 44);
  assert.equal(player.mass, 200);
  expose('water', 1);
  assert.equal(player.mass, 198);
  expose('acid', 30);
  assert.equal(player.mass, 192);
  expose('heat', 240);
  assert.ok(player.combat.heat > 0.999);
  expose('cold', 72);
  assert.equal(player.combat.brittle, true);
});

test('countdown and deadline bound all Arena payouts and ranking shares exact ties', () => {
  const clock = new MatchClock('arena');
  let simulated = 0;
  const step = (dt: number) => { simulated += dt; };
  clock.advance(2, step);
  assert.equal(simulated, 0);
  clock.advance(2, step);
  assert.equal(simulated, 1);
  clock.advance(900, step);
  assert.equal(simulated, 300);
  assert.equal(clock.ended, true);
  clock.advance(1, step);
  assert.equal(simulated, 300);
  const model = new ArenaModel(11, 'normal');
  assert.deepEqual(rankings(model.participants).map(({ place }) => place), Array(20).fill(1));
});

test('a saturated debris pool keeps detached mass pending until explicit expiry', () => {
  const victim = createParticipant('b', 'bot', { x: 1000, y: 1000 });
  const salvage = new Salvage();
  addMass(victim, 6000);
  for (let i = 0; i < theftConfig.debrisCapacity / 8 + 6; i++) assert.equal(salvage.detach(victim, 8), 8);
  assert.equal(salvage.chunks.length, theftConfig.debrisCapacity);
  assert.equal(salvage.pending.reduce((sum, event) => sum + event.value, 0), 48);
  salvage.step([], 10);
  assert.equal(salvage.expiredMass, theftConfig.debrisCapacity + 48);
  assert.equal(salvage.pending.length + salvage.chunks.length, 0);
});

test('complete heat overload blocks remote attraction but keeps physical collection', () => {
  const magnet = createParticipant('p', 'player', { x: 7000, y: 5000 });
  magnet.combat.heat = 1;
  const pool = new ParticlePool(17, [magnet], 1);
  const [scrap] = pool.slots;
  Object.assign(scrap, { x: magnet.position.x + magnet.radius + scrap.radius + 1, y: magnet.position.y });
  assert.equal(advanceAttraction(pool, [magnet], 1).collections.length, 0);
  scrap.x -= 1;
  assert.equal(advanceAttraction(pool, [magnet], 1).collections.length, 1);
});

test('progress defaults safely when storage is blocked and validates individual preferences', async () => {
  const { loadProgress, saveProgress } = await import('../src/progress');
  const snapshot = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let value = '{invalid JSON';
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => value,
        setItem: (_key: string, next: string) => { value = next; },
      },
    });
    assert.equal(loadProgress().difficulty, 'normal');
    value = JSON.stringify({ arenaMass: 180, completed: -1, difficulty: 'hard', music: 0, volume: 101 });
    const preferences = loadProgress();
    assert.equal(preferences.arenaMass, 180);
    assert.equal(preferences.completed, 0);
    assert.equal(preferences.difficulty, 'hard');
    assert.equal(preferences.music, 0);
    assert.equal(preferences.volume, 45);
    saveProgress(preferences);
    assert.deepEqual(loadProgress(), preferences);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    assert.equal(loadProgress().difficulty, 'normal');
    assert.doesNotThrow(() => saveProgress(preferences));
  } finally {
    if (snapshot) Object.defineProperty(globalThis, 'localStorage', snapshot);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
