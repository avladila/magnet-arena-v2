import { test } from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../brand/asset-manifest.json';
import anchors from '../brand/face-anchors.json';
import roster from '../brand/roster.json';
import { CharacterPose, expressions } from '../src/character-pose';
import type { Observation } from '../src/character-attention';
import { addMass } from '../src/growth';
import { createParticipant, createPlayer } from '../src/movement';

function observed(kind: 'opponent' | 'gold' | 'energy' | 'ordinary', danger = false): Observation {
  const point = { x: 50, y: 10 };
  if (kind === 'opponent') return { target: { kind, actor: createParticipant('rival', 'bot', point, 'Rival') }, point, danger };
  const scrap = { ...point, id: 1, radius: 5, state: 'active' as const, generation: 1, colorIndex: 1 };
  return { target: { kind, scrap, generation: 1 }, point, danger };
}

test('all six shells and twelve moods have consistent faceplates and synchronized layers', () => {
  const frames = new Set(manifest.atlases.faces);
  const shells = new Set(manifest.atlases.magnets);
  const mounts: Readonly<Record<string, number[][]>> = anchors.mounts;
  const sockets: Readonly<Record<string, number[][]>> = anchors.eyes;
  for (const id of ['player', ...roster.map((bot) => bot.id)]) {
    assert.equal(mounts[id].length, 6);
    for (const [stage, mount] of mounts[id].entries()) {
      assert.ok(shells.has(`${id}-${stage}`));
      assert.equal(mount.length, 3);
      assert.ok(mount.every(Number.isFinite));
      assert.ok(mount[0] < 0 && mount[2] >= .89 && mount[2] <= 1);
      if (stage) assert.ok(Math.abs(mounts[id][stage - 1][0] - mount[0]) < .25);
    }
    for (const mood of expressions) {
      const key = `${id}-${mood}`;
      for (const part of ['eyes', 'brows', 'mouth']) assert.ok(frames.has(`${key}-${part}`), key);
      const [left, right] = sockets[key];
      assert.equal(sockets[key].length, 2);
      assert.ok(left[0] < right[0] && Math.abs(left[1] - right[1]) < 3);
      for (const eye of [left, right]) assert.ok(eye.length === 6 && eye.every(Number.isFinite));
    }
    assert.ok(frames.has(`${id}-blink-eyes`));
  }
});

test('ordinary transitions wait for a stable cue and retain concern briefly after a rival leaves', () => {
  const player = createPlayer();
  const pose = new CharacterPose();
  const observe = (target?: Observation, seconds = .08) => {
    const before = structuredClone(player);
    pose.update(player, seconds, false, undefined, target);
    assert.deepEqual(player, before);
    return pose.expression;
  };
  assert.equal(observe(), 'relaxed');
  player.velocity = { x: -460, y: 0 };
  assert.equal(observe(observed('ordinary')), 'curious');
  assert.ok(pose.stretchX > 1);
  assert.equal(observe(observed('gold'), .02), 'curious');
  assert.equal(observe(observed('gold')), 'excited');
  player.pickupsCollected++;
  assert.equal(observe(observed('energy')), 'satisfied');
  player.combat.energy = 100;
  assert.equal(observe(observed('opponent')), 'worried');
  assert.equal(observe(undefined, .33), 'worried');
  assert.equal(observe(undefined, .10), 'relaxed');
});

test('damage outranks attack and fear, which outrank environmental and collection emotions', () => {
  const player = createPlayer();
  const pose = new CharacterPose();
  const observe = (target?: Observation, seconds = .08) => {
    pose.update(player, seconds, false, undefined, target);
    return pose.expression;
  };
  addMass(player, 380);
  player.combat.heat = .55;
  assert.equal(observe(observed('opponent')), 'overheated');
  assert.equal(observe(observed('opponent', true), .001), 'frightened');
  assert.equal(pose.blink, false);
  player.combat.attack = { phase: 'armed' };
  assert.equal(observe(observed('opponent', true), .001), 'aggressive');
  assert.ok(pose.stretchX < 1);
  player.combat.attack = { phase: 'warning', bearing: 0, remaining: .18 };
  assert.equal(observe(), 'aggressive');
  assert.ok(pose.recoil > 0);
  addMass(player, -180);
  player.combat.lostToTheft += 180;
  assert.equal(observe(observed('opponent', true), .001), 'shocked');
  assert.ok(pose.shock > .9);
  assert.equal(pose.blink, false);
  player.combat.heat = 0;
  player.combat.attack = { phase: 'idle' };
  player.combat.brittle = true;
  assert.equal(observe(undefined, .42), 'frozen');
  player.combat.brittle = false;
  player.combat.corrosion = 'water';
  assert.equal(observe(), 'corroded');
});

test('reduced motion preserves concern, fear, damage, and the original injury recovery condition', () => {
  const player = createPlayer();
  const pose = new CharacterPose();
  addMass(player, 380);
  pose.update(player, .08, true, undefined, observed('opponent'));
  assert.equal(pose.expression, 'worried');
  pose.update(player, .016, true, undefined, observed('opponent', true));
  assert.equal(pose.expression, 'frightened');
  addMass(player, -180);
  player.combat.lostToTheft = 180;
  pose.update(player, .016, true);
  assert.equal(pose.expression, 'shocked');
  assert.deepEqual([pose.stretchX, pose.stretchY, pose.recoil, pose.faceSqueeze, pose.blink], [1, 1, 0, 1, false]);
  pose.update(player, .41, true);
  assert.equal(pose.expression, 'injured');
  addMass(player, 120);
  pose.update(player, .08, true);
  assert.equal(pose.expression, 'relaxed');
});
