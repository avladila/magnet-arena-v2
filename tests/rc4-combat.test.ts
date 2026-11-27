import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleBetween, arm, bearingTo, combatShell, physicalReduction, release, resolveTheft, Salvage,
  salvageEligible, shell, theftDamage } from '../src/combat';
import { hazardConfig, theftConfig } from '../src/competition-config';
import { arena } from '../src/config';
import { addMass, attractionReach, massForPhysicalScale } from '../src/growth';
import { Hazards } from '../src/hazards';
import { createParticipant, type Participant, type Point } from '../src/movement';
import { MagnetScale } from '../src/view';

function magnet(id: string, mass: number, point: Point): Participant {
  const participant = createParticipant(id, 'bot', point);
  addMass(participant, mass - 20);
  return participant;
}

function fire(attacker: Participant, target: Participant): void {
  attacker.combat.energy = theftConfig.energy;
  assert.ok(arm(attacker));
  assert.ok(release(attacker, bearingTo(attacker.position, target.position)));
}

function giantBattle(origin: Point = { x: 7880, y: 5000 }, mass = 4352, salvage = new Salvage()) {
  const attacker = magnet('attacker', 20, { x: origin.x + (origin.x < 600 ? 510 : -510), y: origin.y });
  const victim = magnet('victim', mass, origin);
  fire(attacker, victim);
  resolveTheft([attacker, victim], salvage, theftConfig.warning);
  return { attacker, victim, salvage };
}

test('diameter scaling is continuous at all five breakpoints with a bounded small-attacker advantage', () => {
  for (const [scale, loss] of [[1, 0.08], [2, 0.12], [4, 0.25], [8, 0.4], [12, 0.5]]) {
    assert.equal(physicalReduction(12, scale), loss);
    assert.ok(Math.abs(physicalReduction(12, scale - 1e-6) - physicalReduction(12, scale + 1e-6)) < 1e-6);
  }
  assert.equal(physicalReduction(12, 100), 0.5);
  assert.equal(physicalReduction(12, 0), 0.08);
  assert.equal(physicalReduction(1, 4), 0.3);
  assert.equal(physicalReduction(2, 4), 0.275);
  const attacker = magnet('equal', 4352, { x: 500, y: 500 });
  for (const [scale, minimum, maximum] of [[1, 0, 0], [2, 0.10, 0.13], [4, 0.24, 0.26], [8, 0.39, 0.41], [12, 0.49, 0.51]]) {
    const victim = magnet('v', scale === 12 ? 4352 : massForPhysicalScale(scale), { x: 1200, y: 850 });
    attacker.position = { x: victim.position.x - victim.radius - attacker.radius - 80, y: victim.position.y };
    if (attacker.combat.attack.phase === 'cooldown') resolveTheft([attacker], new Salvage(), theftConfig.cooldown);
    fire(attacker, victim);
    const preScale = victim.physicalScale;
    resolveTheft([attacker, victim], new Salvage(), theftConfig.warning);
    const shrink = 1 - victim.physicalScale / preScale;
    assert.ok(shrink >= minimum && shrink <= maximum, `${scale}× lost ${shrink}`);
    assert.equal(victim.radius, 30 * victim.physicalScale);
  }
  assert.equal(attacker.combat.protectedHits, 1);
});

test('capped and over-cap giants both drop to 1051 mass with a protected lifetime statistic', () => {
  for (const mass of [4352, 8900]) {
    const { attacker, victim, salvage } = giantBattle(undefined, mass);
    assert.equal(victim.mass, 1051);
    assert.ok(Math.abs(victim.radius - 180) < 0.03);
    assert.equal(victim.combat.highest, mass);
    assert.equal(victim.combat.guardFor, theftConfig.guard);
    assert.equal(attacker.mass, 20);
    assert.equal(attacker.combat.energy, 0);
    assert.equal(attacker.combat.detached, mass - 1051);
    assert.equal(attacker.combat.largestTheft, mass - 1051);
    assert.ok(Math.abs(attacker.combat.largestReduction - 0.5) < 0.001);
    assert.equal(salvage.chunks.reduce((sum, chunk) => sum + chunk.value, 0), mass - 1051);
  }
});

test('the capped combat core differs from the lifetime hazard core and cannot grant mass', () => {
  const victim = magnet('v', 6000, { x: 2100, y: 1100 });
  addMass(victim, -5650);
  const attacker = magnet('a', 20, { x: 1900, y: 1100 });
  assert.equal(shell(victim), 0);
  assert.equal(combatShell(victim), 100);
  fire(attacker, victim);
  const salvage = new Salvage();
  resolveTheft([attacker, victim], salvage, theftConfig.warning);
  assert.equal(victim.mass, 250);
  addMass(victim, -34);
  assert.equal(theftDamage(attacker, victim), 0);
  assert.equal(victim.mass, 216);
  const flux = new Hazards(19, [victim]);
  const site = flux.sites.find(({ kind }) => kind === 'flux')!;
  victim.position = { x: site.x, y: site.y };
  flux.step([victim], salvage, 1 / 60);
  assert.equal(victim.mass, 216);
  assert.equal(victim.combat.lostToHazards, 0);
});

test('guarded-only contact spends 35, preserves mass, and leaves environmental corrosion active', () => {
  const { attacker, victim, salvage } = giantBattle();
  const follow = magnet('follow', 20, { x: attacker.position.x + 120, y: attacker.position.y });
  fire(follow, victim);
  resolveTheft([follow, victim], salvage, theftConfig.warning);
  assert.equal(follow.combat.energy, 65);
  assert.equal(follow.combat.guarded, 1);
  assert.equal(follow.combat.misses + follow.combat.hits, 0);
  assert.equal(victim.mass, 1051);
  addMass(victim, 300);
  const hazards = new Hazards(29, [victim]);
  const acid = hazards.sites.find(({ kind }) => kind === 'acid')!;
  victim.position = { x: acid.x, y: acid.y };
  hazards.step([victim], salvage, hazardConfig.acid.delay);
  assert.ok(victim.combat.lostToHazards > 0 && victim.combat.guardFor > 0);
  resolveTheft([victim], salvage, theftConfig.guard);
  assert.equal(victim.combat.guardFor, 0);
});

test('simultaneous pulses share the strongest loss and brittle amplifies it once', () => {
  const run = (brittle: boolean, reverse: boolean) => {
    const attacker = magnet('a', 20, { x: 7400, y: 4900 });
    const rival = magnet('b', 180, { x: 7400, y: 5100 });
    const victim = magnet('v', 4352, { x: 7900, y: 5000 });
    victim.combat.brittle = brittle;
    const value = Math.max(theftDamage(attacker, victim), theftDamage(rival, victim));
    const expected = brittle ? Math.min(combatShell(victim), Math.round(value * hazardConfig.cold.damage)) : value;
    const salvage = new Salvage();
    fire(attacker, victim);
    fire(rival, victim);
    resolveTheft(reverse ? [rival, victim, attacker] : [attacker, rival, victim], salvage, theftConfig.warning);
    assert.equal(victim.combat.lostToTheft, expected);
    assert.equal(victim.combat.impact?.brittle, brittle);
    assert.equal(attacker.combat.detached + rival.combat.detached, expected);
    assert.equal(salvage.chunks.reduce((sum, chunk) => sum + chunk.value, 0), expected);
    assert.equal(victim.combat.brittle, false);
    return [attacker.combat.detached, rival.combat.detached, salvage.chunks];
  };
  assert.deepEqual(run(false, true), run(false, false));
  assert.deepEqual(run(true, true), run(true, false));
});

test('giant salvage lands beyond both body and field, with 65% toward the attacker', () => {
  const { victim, salvage } = giantBattle();
  assert.ok(salvage.chunks.length >= 18 && salvage.chunks.length <= 24);
  let toward = 0;
  for (const chunk of salvage.chunks) {
    const distance = Math.hypot(chunk.destination.x - chunk.origin.x, chunk.destination.y - chunk.origin.y);
    assert.ok(distance >= Math.max(400, attractionReach(victim.physicalScale) + 35) - 1e-8);
    if (angleBetween(bearingTo(chunk.origin, chunk.destination), Math.PI) <= Math.PI / 3) toward += chunk.value;
    assert.ok(Number.isInteger(chunk.value) && chunk.value > 0);
  }
  assert.equal(toward, Math.round(3301 * 0.65));
  for (const origin of [{ x: 360, y: 360 }, { x: 360, y: 5000 }, { x: arena.width - 360, y: arena.height - 360 }]) {
    const { salvage } = giantBattle(origin);
    assert.equal(salvage.chunks.length, 24);
    const sites = salvage.chunks.map(({ destination: { x, y } }) => {
      assert.ok(x >= 5 && y >= 5 && x <= arena.width - 5 && y <= arena.height - 5);
      assert.ok(Math.hypot(x - origin.x, y - origin.y) >= 400 - 1e-8);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    assert.equal(new Set(sites).size, sites.length);
  }
});

test('victim lock includes contact, with third-party and attacker claims allowed after landing', () => {
  const { attacker, victim, salvage } = giantBattle();
  salvage.step([victim], theftConfig.flight / 2);
  assert.equal(victim.mass, 1051);
  assert.ok(salvage.chunks.every((chunk) => !salvageEligible(chunk, attacker.id)));
  salvage.step([victim], theftConfig.flight / 2);
  assert.equal(victim.mass, 1051);
  const first = salvage.chunks[0];
  victim.position = { x: first.x, y: first.y };
  salvage.step([victim], 4.99);
  assert.equal(victim.mass, 1051);
  assert.equal(first.x, first.destination.x);
  const third = magnet('third', 20, first.destination);
  salvage.step([third], 0);
  assert.ok(third.combat.salvage >= first.value);
  assert.equal(third.combat.ownSalvage, 0);
  assert.ok(!salvage.chunks.includes(first));
  const second = salvage.chunks[0];
  attacker.position = second.destination;
  salvage.step([attacker], 0);
  assert.ok(attacker.combat.ownSalvage >= second.value);
  const thirdChunk = salvage.chunks[0];
  victim.position = thirdChunk.destination;
  salvage.step([victim], 0.011);
  assert.ok(victim.combat.reclaimedSalvage >= thirdChunk.value);
  assert.equal(salvage.chunks.reduce((sum, chunk) => sum + chunk.value, 0) + attacker.combat.salvage +
    victim.combat.salvage + third.combat.salvage, 3301);
});

test('pending chunks keep provenance and landing time until collection or explicit expiry', () => {
  const { attacker, victim, salvage } = giantBattle(undefined, 4352, new Salvage(1));
  assert.equal(salvage.chunks.length, 1);
  assert.equal(salvage.pending.length, 23);
  const waiting = salvage.pending[0];
  salvage.step([], 0.7);
  attacker.position = salvage.chunks[0].destination;
  salvage.step([attacker], 0);
  assert.equal(salvage.chunks[0], waiting);
  assert.equal(waiting.age, 0.7);
  assert.equal(waiting.source?.victimId, victim.id);
  assert.deepEqual({ x: waiting.x, y: waiting.y }, waiting.destination);
  assert.equal(salvageEligible(waiting, victim.id), false);
  salvage.step([], 10);
  assert.equal(salvage.pending.length + salvage.chunks.length, 0);
  assert.equal(salvage.expiredMass + attacker.combat.ownSalvage, 3301);
});

test('rendered shrink finishes in the impact interval after the physical radius has changed', () => {
  const scale = new MagnetScale();
  scale.scale = 12;
  scale.update(6, 0.12, 3301);
  assert.ok(scale.scale > 6 && scale.scale < 8);
  scale.update(6, theftConfig.shrinkSeconds - 0.12, 3301);
  assert.ok(Math.abs(scale.scale - 6) < 1e-9);
});
