import type { ArenaModel } from '../src/arena-model';
import { gapBetween, salvageEligible, theftDamage } from '../src/combat';
import { hazardConfig, theftConfig } from '../src/competition-config';
import { playerConfig } from '../src/config';
import { attractionReach, physicalScaleForMass } from '../src/growth';
import { clampToArena, type Participant, type Point } from '../src/movement';
import type { WorldBounds } from '../src/particles';

export const strategies = ['inactive', 'beginner', 'collector', 'energy', 'hunter', 'defensive', 'salvage', 'balanced'] as const;
export type Strategy = typeof strategies[number];
const preferences = {
  collector: { energy: 0.48, salvage: 0.83, attack: 0.72, risk: 1.05 },
  energy: { energy: 2.8, salvage: 0.8, attack: 1.05, risk: 1 },
  hunter: { energy: 2.1, salvage: 1, attack: 1.8, risk: 0.72 },
  defensive: { energy: 0.96, salvage: 0.82, attack: 0.85, risk: 1.85 },
  salvage: { energy: 1.2, salvage: 2.2, attack: 1.1, risk: 1.2 },
  balanced: { energy: 1.5, salvage: 1.35, attack: 1.15, risk: 1.35 },
} as const;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function onScreen(point: Point, bounds: WorldBounds, radius = 0): boolean {
  return point.x + radius >= bounds.left && point.x - radius <= bounds.right &&
    point.y + radius >= bounds.top && point.y - radius <= bounds.bottom;
}

export type PilotChoice = { point?: Point; victim?: Participant };

/** A view-limited route sweep with committed input between decisions. The caller performs aiming and release. */
export class GameplayPilot {
  private nextDecision = 0;
  private choice: PilotChoice = {};

  constructor(readonly strategy: Strategy) {}

  decide(model: ArenaModel, bounds: WorldBounds, time: number): PilotChoice {
    if (this.strategy === 'inactive') return this.choice;
    if (time < this.nextDecision) return this.choice;
    const player = model.player;
    const start = player.position;
    this.nextDecision = time + (this.strategy === 'beginner' ? 0.75 : 0.29);
    const resources = model.particles.slots.filter((scrap) => scrap.state === 'active' && onScreen(scrap, bounds));
    if (this.strategy === 'beginner') {
      let nearest = Infinity;
      let point: Point | undefined;
      for (const scrap of resources) {
        const value = distance(start, scrap) / (model.particles.kind(scrap) === 'gold' ? 1.5 : 1);
        if (value >= nearest) continue;
        nearest = value;
        point = scrap;
      }
      const heading = player.heading + (point ? 0 : 0.22);
      return this.choice = { point: point ? { x: point.x, y: point.y }
        : clampToArena({ x: start.x + 440 * Math.cos(heading), y: start.y + 440 * Math.sin(heading) }, player.radius) };
    }

    const profile = preferences[this.strategy];
    const reach = attractionReach(player.physicalScale);
    const energyReach = Math.max(player.radius + 25, 72, 156 / Math.sqrt(player.physicalScale));
    const charged = player.combat.energy === theftConfig.energy;
    const found = resources.map((scrap) => {
      const kind = model.particles.kind(scrap);
      return { x: scrap.x - start.x, y: scrap.y - start.y,
        reward: kind === 'gold' ? 9.5 : kind === 'energy' ? (charged ? 0.3 : profile.energy * 5) : 1,
        reach: (kind === 'energy' ? energyReach : reach) * 0.84 };
    });
    const opponents = model.bots.filter((bot) => onScreen(bot.position, bounds, bot.radius));
    const threats: { bot: Participant; danger: number }[] = [];
    let victim: Participant | undefined;
    let attackValue = 0;
    for (const bot of opponents) {
      const gap = gapBetween(player, bot);
      if (gap < 680 && player.combat.guardFor <= 0 && bot.combat.energy === theftConfig.energy) {
        const expected = theftDamage(bot, player);
        if (expected > 0) threats.push({ bot, danger: 1 - physicalScaleForMass(player.mass - expected) / player.physicalScale });
      }
      if (!charged || bot.combat.guardFor > 0 || gap > (this.strategy === 'hunter' ? 405 : 307)) continue;
      const value = theftDamage(player, bot);
      if (value < (this.strategy === 'defensive' ? 55 : 21)) continue;
      const utility = Math.sqrt(value) * profile.attack / (1 + gap / 245);
      if (utility > attackValue) { attackValue = utility; victim = bot; }
    }
    for (const chunk of model.salvage.chunks) {
      if (!onScreen(chunk, bounds) || !salvageEligible(chunk, player.id)) continue;
      const d = distance(start, chunk);
      const eta = Math.max(0, d - reach) / playerConfig.speed + 0.32;
      if (chunk.age + eta >= theftConfig.lifetime) continue;
      found.push({ x: chunk.x - start.x, y: chunk.y - start.y,
        reward: Math.min(30, 1.8 * Math.sqrt(chunk.value)) * profile.salvage, reach: reach * 0.75 });
    }
    const sites = (model.hazards?.sites ?? []).filter((site) => onScreen(site, bounds, site.radius) &&
      (site.kind !== 'flux' || player.mass >= hazardConfig.flux.threshold));
    let best = -Infinity;
    let point: Point | undefined;
    for (let i = 0; i < 24; i++) {
      const angle = player.heading + i * Math.PI / 12;
      const ux = Math.cos(angle), uy = Math.sin(angle);
      const aim = clampToArena({ x: start.x + ux * 660, y: start.y + uy * 660 }, player.radius);
      const length = distance(aim, start);
      if (length < 65) continue;
      let score = 3 * Math.cos(angle - player.heading);
      for (const item of found) {
        const along = ux * item.x + uy * item.y;
        if (along < -item.reach * 0.25 || along > length + 10) continue;
        if (Math.abs(uy * item.x - ux * item.y) > item.reach) continue;
        score += item.reward / (1 + Math.max(0, along) / 640);
      }
      for (const site of sites) {
        const dx = site.x - start.x, dy = site.y - start.y;
        const along = Math.max(0, Math.min(length * 0.57, ux * dx + uy * dy));
        const clearance = Math.hypot(dx - along * ux, dy - along * uy) - site.radius - player.radius;
        const severity = site.kind === 'flux' ? 50 : site.kind === 'acid' ? 27 : site.kind === 'water' ? 13 : site.kind === 'heat' ? 17 : 8;
        if (clearance < 30) score -= severity * profile.risk;
      }
      for (const { bot, danger } of threats) {
        const futureGap = distance(aim, bot.position) - player.radius - bot.radius;
        if (futureGap < 420) score -= (420 - futureGap) / 420 * danger * 74 * profile.risk;
      }
      if (victim && attackValue >= 2.5) {
        const gap = gapBetween(player, victim);
        const futureGap = distance(aim, victim.position) - player.radius - victim.radius;
        const toward = ((victim.position.x - start.x) * ux + (victim.position.y - start.y) * uy) / Math.max(1, distance(start, victim.position));
        score += toward * Math.min(34, attackValue) * (gap > 130 ? 1 : 0.46) + Number(futureGap < 220) * 3;
      }
      const signal = model.signal;
      if (signal && distance(start, signal) < 2200 && this.strategy !== 'defensive') {
        score += Math.max(-3, Math.min(6, (distance(start, signal) - distance(aim, signal)) / 100));
      }
      if (score > best) { best = score; point = aim; }
    }
    return this.choice = { point, victim };
  }
}
