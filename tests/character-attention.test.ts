import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttentionWorld, CharacterAttention, type Observation } from '../src/character-attention';
import { theftConfig } from '../src/competition-config';
import { addMass } from '../src/growth';
import { createParticipant, createPlayer } from '../src/movement';
import { ParticlePool, resourceKind, type ResourceKind, type WorldBounds } from '../src/particles';
import { Salvage } from '../src/salvage';

const view = { left: 600, right: 2500, top: 700, bottom: 2600 };

function fixture() {
  const player = createPlayer();
  player.position = { x: 1500, y: 1500 };
  const participants = [player] as ReturnType<typeof createParticipant>[];
  const particles = new ParticlePool(9, participants, 0, true, 10);
  const salvage = new Salvage();
  const world = new AttentionWorld();
  const attention = new CharacterAttention();
  const model = { participants, particles, salvage };
  const look = (seconds = .125, bounds: WorldBounds = view, aim = 0) => {
    world.update(model, bounds, seconds, aim);
    return attention.update(player, world, seconds);
  };
  function rival(id: string, dx: number, dy = 0, mass = 20) {
    const bot = createParticipant(id, 'bot', { x: player.position.x + dx, y: player.position.y + dy });
    addMass(bot, mass - 20);
    participants.push(bot);
    return bot;
  }
  function scrap(index: number, kind: ResourceKind, dx: number, dy = 0) {
    let resourceId = 0;
    while (resourceKind(resourceId) !== kind) resourceId++;
    return Object.assign(particles.slots[index], { state: 'active', resourceId,
      x: player.position.x + dx, y: player.position.y + dy });
  }
  return { player, model, world, attention, look, rival, scrap };
}

function watching(value: Observation | undefined) {
  return value?.target.kind === 'opponent' ? value.target.actor.id : value?.target.kind;
}

test('visible opponents outrank charge cells while the player steers away', () => {
  const scene = fixture();
  scene.scrap(0, 'energy', -120);
  const rival = scene.rival('east', 380);
  scene.player.velocity = { x: -460, y: 0 };
  assert.equal(watching(scene.look()), 'east');
  rival.position = { x: rival.position.x, y: 1610 };
  const attention = scene.look(.016);
  assert.equal(attention?.point, rival.position);
  assert.equal(attention?.danger, false);
  // The rival remains nearby in world units when its center leaves the legitimate view.
  assert.equal(watching(scene.look(.016, { ...view, right: 1700 })), 'energy');
});

test('a charged small rival takes priority over an uncharged giant and can frighten a giant', () => {
  const scene = fixture();
  addMass(scene.player, 4332);
  scene.rival('giant', -660, 0, 4352);
  const small = scene.rival('small', 580);
  small.combat.energy = theftConfig.energy;
  const choice = scene.look();
  assert.equal(watching(choice), 'small');
  assert.equal(choice?.danger, true);
  scene.player.combat.guardFor = 1;
  assert.equal(scene.look(.016)?.danger, false);
});

test('an incoming warning uses the real cone and overrides a recent ordinary commitment', () => {
  const scene = fixture();
  addMass(scene.player, 180);
  scene.rival('closer', -170);
  assert.equal(watching(scene.look()), 'closer');
  const shooter = scene.rival('preparing', 320);
  shooter.combat.energy = 90;
  shooter.combat.attack = { phase: 'warning', bearing: 0, remaining: .18 };
  assert.equal(watching(scene.look(.03)), 'closer');
  shooter.combat.attack.bearing = Math.PI;
  const choice = scene.look(.016);
  assert.equal(watching(choice), 'preparing');
  assert.equal(choice?.danger, true);
});

test('an ordinary prepared rival outranks idle charge, and a fast closing attacker is a danger', () => {
  const scene = fixture();
  addMass(scene.player, 380);
  const charging = scene.rival('charged', 440);
  charging.combat.energy = 100;
  const preparing = scene.rival('preparing', -625);
  preparing.combat.attack = { phase: 'armed' };
  assert.equal(watching(scene.look()), 'preparing');
  charging.velocity = { x: -420, y: 0 };
  const choice = scene.look(.125);
  assert.equal(watching(choice), 'charged');
  assert.equal(choice?.danger, true);
});

test('an active attack can focus a visible victim in its actual bearing', () => {
  const scene = fixture();
  scene.rival('behind', -180, 0, 300);
  scene.rival('aimed', 270, 0, 240);
  assert.equal(watching(scene.look()), 'behind');
  scene.player.combat.energy = 100;
  scene.player.combat.attack = { phase: 'armed' };
  assert.equal(watching(scene.look(.13)), 'aimed');
});

test('energy and gold outrank ordinary scrap, following live positions and ignoring energy when full', () => {
  const scene = fixture();
  const cell = scene.scrap(0, 'energy', 180, 28);
  const gold = scene.scrap(1, 'gold', -190);
  scene.scrap(2, 'ordinary', -40);
  assert.equal(watching(scene.look()), 'energy');
  cell.x -= 12;
  assert.equal(scene.look(.016)?.point.x, cell.x);
  scene.player.combat.energy = 100;
  assert.equal(watching(scene.look(.016)), 'gold');
  gold.state = 'collected';
  assert.equal(watching(scene.look(.016)), 'ordinary');
});

test('collected slots and recycled generations cannot keep attention', () => {
  const scene = fixture();
  const cell = scene.scrap(0, 'energy', -80);
  scene.scrap(1, 'ordinary', 120);
  assert.equal(watching(scene.look()), 'energy');
  cell.generation++;
  cell.x += 190;
  assert.equal(watching(scene.look(.016)), 'ordinary');
  scene.model.particles.slots[1].state = 'collected';
  const reused = scene.look(.13);
  assert.equal(watching(reused), 'energy');
  assert.equal(reused?.point.x, cell.x);
});

test('salvage joins attention only while landed and available to this magnet', () => {
  const scene = fixture();
  const position = { x: 1590, y: 1500 };
  const chunk = { ...position, origin: position, destination: position, age: .1, value: 75,
    source: { victimId: scene.player.id, credits: [] } };
  scene.model.salvage.chunks.push(chunk);
  assert.equal(watching(scene.look()), undefined);
  chunk.age = theftConfig.flight + 1;
  assert.equal(watching(scene.look()), undefined);
  chunk.age = theftConfig.flight + theftConfig.victimSalvageLock + .02;
  assert.equal(watching(scene.look()), 'salvage');
  scene.model.salvage.chunks.length = 0;
  assert.equal(watching(scene.look(.016)), undefined);
});

test('a stable target survives a 350 ms hold and needs a twenty percent same-tier advantage', () => {
  const scene = fixture();
  const first = scene.rival('first', 320);
  const next = scene.rival('next', 420);
  assert.equal(watching(scene.look()), 'first');
  next.position.x = scene.player.position.x + 140;
  assert.equal(watching(scene.look(.24)), 'first');
  next.position.x = scene.player.position.x + 279;
  assert.equal(watching(scene.look(.13)), 'first');
  next.position.x = scene.player.position.x + 150;
  assert.equal(watching(scene.look(.13)), 'next');
  next.position.x = scene.player.position.x + 710;
  first.position.x = scene.player.position.x + 930;
  assert.equal(watching(scene.look(.016)), 'next', 'retained opponent stays until its exit gap');
  next.position.x = scene.player.position.x + 765;
  assert.equal(watching(scene.look(.016)), undefined);
});

test('world and character resets discard old candidates and attention only reads model data', () => {
  const before = fixture();
  before.rival('old', 121);
  const original = structuredClone(before.model);
  assert.equal(watching(before.look()), 'old');
  assert.deepEqual(structuredClone(before.model), original);
  const after = fixture();
  after.scrap(0, 'gold', 160);
  before.world.reset();
  before.attention.reset();
  before.world.update(after.model, view, 0, 0);
  assert.equal(watching(before.attention.update(after.player, before.world, 0)), 'gold');
});
