import { test } from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../brand/asset-manifest.json';
import anchors from '../brand/face-anchors.json';
import roster from '../brand/roster.json';
import { CharacterPose, type Expression } from '../src/character-pose';
import { addMass } from '../src/growth';
import { createPlayer } from '../src/movement';

const moods: readonly Expression[] = ['idle', 'move', 'collect', 'ready', 'attack', 'hit', 'hurt', 'hot', 'cold', 'rust'];

test('every player and rival expression has a packed face with two pupil anchors', () => {
  const frames = new Set(manifest.atlases.faces);
  const sockets: Readonly<Record<string, number[][]>> = anchors;
  for (const id of ['player', ...roster.map((bot) => bot.id)]) {
    for (const mood of moods) {
      const key = `${id}-${mood}`;
      assert.ok(frames.has(key), key);
      assert.equal(sockets[key].length, 2);
      for (const eye of sockets[key]) assert.ok(eye.length === 4 && eye.every(Number.isFinite));
    }
  }
});

test('magnet acting follows movement, collections, readiness, release and exposure', () => {
  const player = createPlayer();
  const pose = new CharacterPose();
  const observe = (seconds = 0.016) => {
    const before = structuredClone(player);
    pose.update(player, seconds, false);
    assert.deepEqual(player, before);
    return pose.expression;
  };
  assert.equal(observe(), 'idle');
  player.velocity = { x: 460, y: 0 };
  assert.equal(observe(), 'move');
  assert.ok(pose.stretchX > 1);
  player.pickupsCollected++;
  assert.equal(observe(), 'collect');
  player.combat.energy = 100;
  assert.equal(observe(), 'ready');
  player.combat.attack = { phase: 'armed' };
  assert.equal(observe(), 'attack');
  assert.ok(pose.stretchX < 1);
  player.combat.attack = { phase: 'warning', bearing: 0, remaining: 0.18 };
  assert.equal(observe(), 'attack');
  assert.ok(pose.recoil > 0);
  player.combat.attack = { phase: 'idle' };
  player.combat.energy = 0;
  player.combat.heat = 0.55;
  assert.equal(observe(0.3), 'hot');
  player.combat.heat = 0;
  player.combat.brittle = true;
  assert.equal(observe(), 'cold');
  player.combat.brittle = false;
  player.combat.corrosion = 'water';
  assert.equal(observe(), 'rust');
});

test('a severe hit holds the reaction and regrowth clears the wound in reduced motion', () => {
  const player = createPlayer();
  const pose = new CharacterPose();
  addMass(player, 380);
  pose.update(player, 0.1, false);
  addMass(player, -180);
  player.combat.lostToTheft = 180;
  pose.update(player, 0.016, true);
  assert.equal(pose.expression, 'hit');
  assert.deepEqual([pose.stretchX, pose.stretchY, pose.recoil], [1, 1, 0]);
  pose.update(player, 0.41, true);
  assert.equal(pose.expression, 'hurt');
  addMass(player, 120);
  pose.update(player, 0.016, true);
  assert.equal(pose.expression, 'idle');
});
