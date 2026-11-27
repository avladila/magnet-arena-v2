import { arm, bearingTo, cancelArm, forecastTheft, gapBetween, release, type CombatRules } from './combat';
import type { Bot } from './bots';
import { tacticsConfig, theftConfig, type CriticalRules } from './competition-config';
import { playerConfig } from './config';
import type { CriticalMass } from './critical-mass';
import type { Hazard } from './hazards';
import type { Difficulty } from './match';
import { clampToArena, type Participant, type Point, type Steering } from './movement';
import { segmentDistanceSquared } from './bot-navigation';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const idle: Steering = { kind: 'idle' };
const emptySites: readonly Hazard[] = [];

export function escapeRoute(actor: Participant, center: Point, rules: CriticalRules, hazards: readonly Hazard[]): Point {
  const from = actor.position;
  const distanceOut = distance(center, from);
  const safe = rules.radius + actor.radius + rules.escapeMargin;
  const targetRadius = Math.max(safe + 155, distanceOut + 155);
  const away = distanceOut > 1 ? bearingTo(center, from) : actor.heading;
  let best = from;
  let bestCost = Infinity;
  for (let i = 0; i < 12; i++) {
    const angle = away + Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI / 6;
    const point = clampToArena({ x: center.x + Math.cos(angle) * targetRadius,
      y: center.y + Math.sin(angle) * targetRadius }, actor.radius + 3);
    const reached = distance(center, point);
    if (reached < safe) continue;
    let cost = distance(from, point);
    if (distanceOut > safe && segmentDistanceSquared(from, point, center) < safe ** 2) cost += targetRadius * 3;
    for (const site of hazards) {
      const clearance = site.radius + actor.radius + 18;
      if (segmentDistanceSquared(from, point, site) < clearance * clearance) cost += clearance * 1.35;
    }
    if (cost < bestCost) { bestCost = cost; best = point; }
  }
  return best;
}

type Plan = { serial: number; goal: Point; escape: boolean; movingOut: boolean };

export class CriticalTactics {
  private readonly plans = new WeakMap<Bot, Plan>();

  intent(bot: Bot, active: CriticalMass): 'escape' | 'pursuit' | undefined {
    const plan = this.plans.get(bot);
    if (plan && plan.serial === active.warning?.serial) return plan.escape ? 'escape' : 'pursuit';
  }

  steer(bot: Bot, endgame: CriticalMass, hazards: readonly Hazard[], difficulty: Difficulty,
      combat: CombatRules, seconds: number): Steering | undefined {
    const { claim, blast, rules } = endgame;
    const warning = claim ?? blast;
    if (!warning || claim?.actor === bot) return;
    const gap = distance(bot.position, warning.center) - bot.radius;
    if (!blast && gap > rules.radius + 320) return;
    const sites = blast ? emptySites : hazards;
    let plan = this.plans.get(bot);
    if (claim && plan?.serial === claim.serial && !plan.escape && bot.combat.attack.phase === 'warning') return idle;
    if (!plan || plan.serial !== warning.serial || (blast && !plan.movingOut) || bot.navigation.takeReplanRequest()) {
      plan = { serial: warning.serial, goal: escapeRoute(bot, warning.center, rules, sites), escape: true, movingOut: Boolean(blast) };
      this.plans.set(bot, plan);
    }
    const safety = tacticsConfig[difficulty].safety;
    if (claim && this.canInterrupt(bot, claim.actor, claim.remaining, rules, combat, plan.goal)) {
      plan.escape = false;
      if (gapBetween(bot, claim.actor) <= theftConfig.reach - 1 && claim.actor.combat.guardFor <= theftConfig.warning) {
        arm(bot);
        release(bot, bearingTo(bot.position, claim.center));
        return idle;
      }
      const angle = bearingTo(claim.center, bot.position);
      const reach = claim.actor.radius + bot.radius + theftConfig.reach - 22;
      const target = { x: claim.center.x + Math.cos(angle) * reach, y: claim.center.y + Math.sin(angle) * reach };
      return bot.navigation.steer(bot, target, sites, safety, true, seconds, false);
    }
    cancelArm(bot);
    plan.escape = true;
    return bot.navigation.steer(bot, plan.goal, sites, safety, true, seconds, true);
  }

  private canInterrupt(bot: Bot, claimant: Participant, remaining: number, rules: CriticalRules, combat: CombatRules, exit: Point): boolean {
    if (bot.strategy !== 'hunter' && bot.strategy !== 'charger' && bot.strategy !== 'opportunist') return false;
    const phase = bot.combat.attack.phase;
    if (bot.combat.energy !== theftConfig.energy || (phase !== 'idle' && phase !== 'armed')) return false;
    const gap = gapBetween(bot, claimant);
    const approach = Math.max(0, gap - theftConfig.reach + 16) / playerConfig.speed;
    const fireBy = Math.max(approach, claimant.combat.guardFor - theftConfig.warning) + theftConfig.warning;
    if (fireBy + 0.07 >= remaining || forecastTheft(bot, claimant, combat) <= claimant.mass - rules.threshold) return false;
    const retreat = distance(bot.position, exit) / playerConfig.speed;
    const waveDelay = Math.max(0, Math.min(1, (distance(bot.position, claimant.position) - bot.radius) / rules.radius)) * rules.expansion;
    if (bot.strategy === 'hunter') return fireBy <= 0.5 || fireBy + .48 * retreat < remaining + waveDelay;
    if (bot.strategy === 'charger') return fireBy <= 0.62 && fireBy + .72 * retreat < remaining + waveDelay;
    return fireBy + retreat < remaining + waveDelay;
  }
}
