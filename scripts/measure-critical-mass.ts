import { ArenaModel } from '../src/arena-model';
import { arm, bearingTo, cancelArm, forecastTheft, gapBetween, release } from '../src/combat';
import { matchConfig, theftConfig } from '../src/competition-config';
import { MatchClock, rankings, type Difficulty } from '../src/match';
import type { Participant, Point } from '../src/movement';
import { ArenaCamera } from '../src/view';
import { GameplayPilot, onScreen, strategies, type Strategy } from './gameplay-pilot';

const levels: Difficulty[] = ['easy', 'normal', 'hard'];
const settings: Record<string, { threshold?: number; countdown?: number; radius?: number }> = {
  stock: {}, mass10000: { threshold: 10_000 }, mass15000: { threshold: 15_000 },
  time2: { countdown: 2 }, time4: { countdown: 4 }, radius1000: { radius: 1_000 }, radius1800: { radius: 1_800 },
};
const step = matchConfig.step;
const dt = Number(process.env.MAGNET_STEP ?? step);
const cohort = process.env.MAGNET_COHORT ?? 'principal';
const variant = process.env.MAGNET_VARIANT ?? 'stock';
const preset = settings[variant];
const enabled = variant !== 'baseline';
if (enabled && !preset) throw new Error('Unknown Critical Mass variant');
const planEscape = enabled ? (await import('../src/critical-tactics')).escapeRoute : undefined;

function run(seed: number, difficulty: Difficulty, strategy: Strategy, mobile: boolean) {
  // The disabled case can also execute at the untouched RC7A revision.
  const model = new ArenaModel(seed, difficulty, false, enabled ? { mode: 'arena', critical: preset } : {});
  const critical = model.critical;
  const { player } = model;
  const clock = new MatchClock('arena');
  clock.countdown = 0;
  const view = new ArenaCamera(player.position);
  view.resize(...(mobile ? [390, 844] : [1366, 768]) as [number, number]);
  const pilot = new GameplayPilot(strategy);
  let aimed: Participant | undefined;
  let fireAt = 0;
  let escape: { serial: number; point: Point } | undefined;
  let inside = new Set<string>();
  let seenClaim = 0;
  let firstClaim: number | undefined;
  let attemptsToInterrupt = 0;
  let quiet = 0;
  let nextObservation = 0;
  const before = performance.now();
  while (!clock.ended) {
    const warning = critical?.warning;
    const claim = critical?.claim;
    if (claim && seenClaim !== claim.serial) {
      seenClaim = claim.serial;
      firstClaim ??= clock.elapsed;
      inside = new Set(model.participants.filter(p => p.id !== claim.actor.id &&
        Math.hypot(p.position.x - claim.center.x, p.position.y - claim.center.y) - p.radius <= critical!.rules.radius).map(p => p.id));
    }
    const bounds = view.bounds;
    const danger = critical && warning && Math.hypot(player.position.x - warning.center.x, player.position.y - warning.center.y) -
      player.radius <= critical.rules.radius + 140;
    let choice: { point?: Point; victim?: Participant };
    if (critical?.removed(player) || claim?.actor === player || strategy === 'inactive') choice = {};
    else if (danger && warning) {
      if (escape?.serial !== warning.serial) {
        escape = { serial: warning.serial, point: planEscape!(player, warning.center, critical!.rules, model.hazards?.sites ?? []) };
      }
      const possible = claim && ['energy','hunter','salvage','balanced'].includes(strategy) &&
        gapBetween(player, claim.actor) <= theftConfig.reach - 10 &&
        claim.remaining > .23 + (aimed === claim.actor ? 0 : .22) && claim.actor.combat.guardFor <= .16 &&
        forecastTheft(player, claim.actor, model.combatRules) > claim.actor.mass - critical!.rules.threshold;
      choice = possible ? { victim: claim.actor } : { point: escape.point };
    } else choice = critical?.committed ? {} : pilot.decide(model, bounds, clock.elapsed);
    if (!critical?.committed && !player.combat.attackBlocked) {
      if (aimed && clock.elapsed >= fireAt) {
        if (gapBetween(player, aimed) <= theftConfig.reach && aimed.combat.guardFor <= theftConfig.warning &&
            (aimed === claim?.actor || onScreen(aimed.position, bounds, aimed.radius))) {
          if (release(player, bearingTo(player.position, aimed.position)) && aimed === claim?.actor) attemptsToInterrupt++;
        } else cancelArm(player);
        aimed = undefined;
      } else if (!aimed && choice.victim && gapBetween(player, choice.victim) <= theftConfig.reach - 25 && arm(player)) {
        aimed = choice.victim;
        fireAt = clock.elapsed + .22;
      }
    } else aimed = undefined;
    clock.advance(dt, seconds => {
      model.step(choice.point ? { kind: 'target', point: choice.point } : { kind: 'idle' }, seconds);
      view.follow(player.position, seconds, player.mass);
      model.replenish(view.bounds);
    }, critical);
    if (clock.elapsed >= nextObservation) {
      if (!model.bots.some(bot => onScreen(bot.position, bounds, bot.radius))) quiet += 1;
      nextObservation += 1;
    }
  }
  const final = enabled ? model.finish('arena', clock.elapsed) : undefined;
  const fallback = rankings(model.participants);
  const human = final?.standings.find(p => p.id === player.id);
  const destroyed = final?.standings.filter(p => p.outcome === 'destroyed') ?? [];
  const survived = final?.standings.filter(p => p.outcome === 'survivor') ?? [];
  const detonation = final?.cause === 'detonation';
  return { cohort, variant, seed, difficulty, strategy, dt, mobile, finish: final?.cause ?? 'timeout', time: clock.elapsed,
    rank: human?.place ?? fallback.find(p => p.participant === player)!.place, mass: player.mass, peak: player.combat.highest,
    winner: final?.winnerId ?? fallback[0].participant.id, winnerMass: final?.standings[0].mass ?? fallback[0].participant.mass,
    firstClaim, claims: seenClaim, interruptions: critical?.interruptions ?? [], attemptsToInterrupt,
    playerOutcome: human?.outcome, playerPoints: human?.survivalPoints ?? 0, playerInitiallyInside: detonation && inside.has(player.id),
    destroyed: destroyed.length, survived: survived.length, inside: detonation ? inside.size : 0,
    insideSurvived: survived.filter(p => inside.has(p.id)).length,
    distantSurvived: survived.filter(p => !inside.has(p.id)).length,
    quiet, hits: player.combat.hits, salvage: player.combat.salvage, wallSeconds: (performance.now() - before) / 1000 };
}

const choices = process.env.MAGNET_RUNS?.split(',').map(Number) ?? Array.from({ length: 24 }, (_, i) => i);
for (const index of choices) {
  const strategy = strategies[index % strategies.length];
  const difficulty = levels[Math.floor(index / 8) % levels.length];
  const seed = (cohort === 'independent' ? 673983 : 8269) + (index % 8) * 421;
  console.log(JSON.stringify(run(seed, difficulty, strategy, (cohort === 'independent' ? index + 1 : index) % 2 === 1)));
}
