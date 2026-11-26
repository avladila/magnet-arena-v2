import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArenaModel } from '../src/arena-model';
import { BotAI } from '../src/bot-ai';
import type { Bot } from '../src/bots';
import { theftConfig } from '../src/competition-config';
import { addMass } from '../src/growth';
import type { Difficulty } from '../src/match';
import type { Participant } from '../src/movement';
import type { Scrap } from '../src/particles';

const dt = 1 / 60;

function situation(difficulty: Difficulty) {
  const model = new ArenaModel(903, difficulty);
  for (const bot of model.bots) bot.position = { x: 1000, y: 1000 };
  model.hazards!.sites.length = 0;
  const internals = model as unknown as {
    elapsed: number;
    botSteering: (bot: Bot, dt: number) => unknown;
    tactics: Map<Bot, { victim?: Participant; pursuing: boolean }>;
  };
  return { model, internals };
}

test('Chargers favor energy while below full charge and switch to collection at full energy', () => {
  const { model } = situation('normal');
  const collector = model.bots[0];
  const charger = model.bots.find(({ strategy }) => strategy === 'charger')!;
  for (const bot of [collector, charger]) bot.position = { x: 7680, y: 4920 };
  const cellScrap = (x: number, id: number): Scrap =>
    ({ x, y: 4920, id, generation: 1, state: 'active', radius: 5, colorIndex: 0 });
  const slots = [cellScrap(7320, 0), cellScrap(7324, 1),
    ...Array.from({ length: 12 }, (_, id) => cellScrap(8040 + id, id + 2))];
  const ai = new BotAI();
  const kind = (scrap: Scrap) => scrap.id < 2 ? 'energy' as const : 'ordinary' as const;
  ai.update([collector, charger], slots, dt, 'normal', kind);
  assert.ok(collector.target!.point.x > collector.position.x);
  assert.ok(charger.target!.point.x < charger.position.x);
  charger.combat.energy = theftConfig.energy;
  charger.decisionIn = 0;
  ai.update([charger], slots, dt, 'normal', kind);
  assert.ok(charger.target!.point.x > charger.position.x);
});

test('a Hunter leaves a chase without closing the gap and Easy makes a shorter commitment', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const { model, internals } = situation(difficulty);
    const hunter = model.bots.find(({ strategy }) => strategy === 'hunter')!;
    hunter.position = { x: 7000, y: 5000 };
    hunter.combat.energy = theftConfig.energy;
    addMass(model.player, 380);
    model.player.position = { x: hunter.position.x + hunter.radius + model.player.radius + 420, y: 5000 };
    internals.botSteering(hunter, dt);
    assert.equal(internals.tactics.get(hunter)!.pursuing, difficulty !== 'easy');
    internals.elapsed = 1.3;
    internals.botSteering(hunter, dt);
    assert.equal(internals.tactics.get(hunter)!.victim, undefined);
    assert.equal(internals.tactics.get(hunter)!.pursuing, false);
  }
});

test('Scavengers pass over a valuable fragment with insufficient time to reach it', () => {
  const { model, internals } = situation('normal');
  const bot = model.bots.find(({ strategy }) => strategy === 'scavenger')!;
  bot.position = { x: 7000, y: 5000 };
  const far = { x: 7610, y: 5000 };
  const near = { x: 6750, y: 5000 };
  model.salvage.chunks.push(
    { ...far, origin: far, destination: far, age: theftConfig.lifetime - 0.3, value: 360 },
    { ...near, origin: near, destination: near, age: 1, value: 105 },
  );
  internals.botSteering(bot, dt);
  assert.deepEqual(bot.navigation.strategicTarget, near);
});

test('an Easy Collector in an open field keeps moving when changing collection plans', () => {
  const { model } = situation('easy');
  const bot = model.bots[0];
  bot.position = { x: 10000, y: 5000 };
  bot.target = { kind: 'waypoint', point: { x: 11300, y: 5000 } };
  bot.decisionIn = 0.1;
  for (let i = 0; i < 40; i++) {
    model.step({ kind: 'idle' }, dt);
    assert.ok(Math.hypot(bot.velocity.x, bot.velocity.y) > 50);
  }
});
