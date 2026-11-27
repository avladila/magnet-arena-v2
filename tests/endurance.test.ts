import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArenaModel } from '../src/arena-model';
import { arena, resourceBudget } from '../src/config';
import { arm, bearingTo, gapBetween, release } from '../src/combat';
import { theftConfig } from '../src/competition-config';

test('30 simulated minutes preserve bounds and account for all player, bot, and salvage mass', () => {
  const model = new ArenaModel(65119, 'hard');
  const { player, bots, participants, particles, salvage } = model;
  for (let frame = 0; frame < 30 * 60 * 60; frame++) {
    const bot = bots[Math.floor(frame / 1440) % bots.length];
    if (gapBetween(player, bot) < 210 && arm(player)) release(player, bearingTo(player.position, bot.position));
    model.step({ kind: 'target', point: bot.position }, 1 / 60);
    if (frame % 2 === 0) {
      const { x, y } = player.position;
      model.replenish({ left: x - 650, right: x + 650, top: y - 500, bottom: y + 500 });
    }
    if (frame % 60 !== 0) continue;
    for (const p of participants) {
      assert.ok(Number.isFinite(p.mass) && p.mass >= 20);
      assert.ok(p.combat.energy >= 0 && p.combat.energy <= 100);
      assert.ok(p.position.x >= p.radius && p.position.x <= arena.width - p.radius);
      assert.ok(p.position.y >= p.radius && p.position.y <= arena.height - p.radius);
    }
    assert.equal(particles.slots.length, resourceBudget(participants.length).capacity);
    assert.ok(salvage.chunks.length <= theftConfig.debrisCapacity);
    const worldMass = participants.reduce((sum, p) => sum + p.mass, 0);
    const mintedMass = participants.reduce((sum, p) => sum + p.combat.resourceMass, participants.length * 20);
    const detached = [...salvage.chunks, ...salvage.pending].reduce((sum, chunk) => sum + chunk.value, 0);
    assert.equal(worldMass + detached + salvage.expiredMass, mintedMass);
  }
  assert.ok(salvage.expiredMass > 0, 'expiry sink was exercised');
});
