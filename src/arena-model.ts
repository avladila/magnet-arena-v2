import { angleBetween, arm, bearingTo, gapBetween, release, resolveTheft, Salvage, shell } from './combat';
import { navigationConfig, tacticsConfig, theftConfig } from './competition-config';
import { Hazards } from './hazards';
import type { Attack } from './combat-state';
import { Tutorial } from './tutorial';
import type { Difficulty } from './match';
import type { Point } from './movement';
import { advanceAttraction, type AttractionResult } from './attraction';
import { BotAI } from './bot-ai';
import { createBots, type Bot } from './bots';
import { advance, createPlayer, type Participant, type Steering } from './movement';
import { ParticlePool, type WorldBounds } from './particles';

type BotTactics = {
  nextEvaluation: number;
  nextAttack: number;
  fireAt?: number;
  victim?: Participant;
  pursuing: boolean;
  signal?: Point;
  visitedSignal?: Point;
  dodge?: { attack: Attack; target: Point };
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export class ArenaModel {
  readonly player = createPlayer();
  readonly bots: readonly Bot[];
  readonly participants: readonly Participant[];
  readonly particles: ParticlePool;
  private readonly botAI = new BotAI();
  private elapsedSinceReplenish = 0;

  readonly salvage = new Salvage();
  readonly hazards?: Hazards;
  signal?: Point;
  readonly tutorial?: Tutorial;
  private elapsed = 0;
  private nextSignal = 45;
  private readonly tactics = new Map<Bot, BotTactics>();

  constructor(seed: number, private readonly difficulty?: Difficulty, tutorial = false) {
    this.bots = createBots(seed);
    for (const bot of this.bots) this.tactics.set(bot, { nextEvaluation: 0, nextAttack: 0, pursuing: false });
    this.participants = [this.player, ...this.bots];
    this.particles = new ParticlePool(seed, this.participants, undefined, Boolean(difficulty));
    if (difficulty) this.hazards = new Hazards(seed, this.participants);
    if (tutorial) this.tutorial = new Tutorial(this);
  }

  step(steering: Steering, seconds: number): AttractionResult | undefined {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return;
    if (!this.tutorial) this.elapsedSinceReplenish += seconds;
    if (!this.tutorial) {
      this.botAI.update(this.bots, this.particles.slots, seconds, this.difficulty, this.difficulty === 'hard' ? (scrap) => {
        const kind = this.particles.kind(scrap);
        return kind === 'gold' ? 5 : kind === 'energy' ? 2 : 1;
      } : undefined);
    }
    advance(this.player, steering, seconds);
    this.elapsed += seconds;
    if (!this.tutorial) {
      if (this.difficulty) this.updateSignal();
      for (const bot of this.bots) advance(bot, this.botSteering(bot, seconds), seconds);
    }
    if (this.hazards) {
      this.salvage.step(this.tutorial ? [this.player] : this.participants, seconds);
      resolveTheft(this.participants, this.salvage, seconds);
      this.hazards.step(this.participants, this.salvage, seconds);
    }
    this.tutorial?.step();
    return advanceAttraction(this.particles, this.tutorial ? [this.player] : this.participants, seconds);
  }

  private updateSignal(): void {
    if (this.elapsed >= this.nextSignal - 35) this.signal = undefined;
    if (this.elapsed < this.nextSignal) return;
    this.nextSignal += 60;
    const counts = new Map<string, { point: Point; count: number }>();
    for (const scrap of this.particles.slots) {
      if (scrap.state !== 'active') continue;
      const x = Math.floor(scrap.x / 500);
      const y = Math.floor(scrap.y / 500);
      const key = x + ',' + y;
      const area = counts.get(key) ?? { point: { x: x * 500 + 250, y: y * 500 + 250 }, count: 0 };
      area.count++;
      counts.set(key, area);
    }
    let best = -Infinity;
    for (const { point, count } of counts.values()) {
      const distances = this.participants.map(({ position }) =>
        Math.hypot(position.x - point.x, position.y - point.y)).sort((a, b) => a - b);
      const score = count - (distances[0] + distances[1]) / 350;
      if (score > best) {
        best = score;
        this.signal = point;
      }
    }
  }

  private botSteering(bot: Bot, seconds: number): Steering {
    let target = bot.target?.point;
    if (!this.difficulty || !this.hazards) return target ? { kind: 'target', point: target } : { kind: 'idle' };
    const tactics = tacticsConfig[this.difficulty];
    const state = this.tactics.get(bot)!;
    if (this.elapsed >= state.nextEvaluation) {
      this.evaluateTactics(bot, state);
      state.nextEvaluation = this.elapsed + navigationConfig.evaluationSeconds;
    }

    const victim = state.victim;
    if (state.signal === this.signal && state.signal) target = state.signal;
    if (victim && bot.combat.energy === theftConfig.energy) {
      const gap = gapBetween(bot, victim);
      if (state.pursuing) {
        const angle = bearingTo(victim.position, bot.position);
        const approach = victim.radius + bot.radius + navigationConfig.pursuitExitGap;
        target = gap > navigationConfig.pursuitExitGap
          ? { x: victim.position.x + Math.cos(angle) * approach,
              y: victim.position.y + Math.sin(angle) * approach }
          : bot.position;
      }
      if (gap < theftConfig.reach * 0.8 && this.elapsed >= state.nextAttack) {
        if (arm(bot)) state.fireAt = this.elapsed + tactics.arming;
        state.nextAttack = this.elapsed + tactics.reconsider;
      }
    }
    if (state.fireAt !== undefined && this.elapsed >= state.fireAt) {
      // Attack bearings are resolved from live geometry, independent of the visible body yaw.
      release(bot, victim ? bearingTo(bot.position, victim.position) : bot.heading);
      state.fireAt = undefined;
    }
    if (this.difficulty === 'hard') this.updateDodge(bot, state);
    const steering = bot.navigation.steer(bot, state.dodge?.target ?? target, this.hazards.sites,
      tactics.safety, victim !== undefined, seconds, state.dodge !== undefined);
    if (bot.navigation.takeReplanRequest()) {
      bot.target = undefined;
      bot.decisionIn = 0;
      state.pursuing = false;
      state.visitedSignal = state.signal;
      state.signal = undefined;
    }
    return steering;
  }

  private evaluateTactics(bot: Bot, state: BotTactics): void {
    const difficulty = this.difficulty!;
    const range = theftConfig.reach + tacticsConfig[difficulty].pursuit;
    const previous = state.victim;
    const previousGap = previous ? gapBetween(bot, previous) : Infinity;
    const held = previous && previousGap <= range + navigationConfig.exitClearance
      ? shell(previous) / (1 + previousGap / 100) : 0;
    let score = held * navigationConfig.targetAdvantage;
    let victim = held > 0 ? previous : undefined;
    for (const candidate of this.participants) {
      if (candidate === bot || candidate === previous && held > 0) continue;
      const gap = gapBetween(bot, candidate);
      if (gap > range) continue;
      const utility = shell(candidate) / (1 + gap / 100);
      if (utility > score) {
        score = utility;
        victim = candidate;
      }
    }
    state.victim = victim;

    const charged = bot.combat.energy === theftConfig.energy;
    const committed = victim === previous && state.pursuing;
    const gap = victim ? gapBetween(bot, victim) : 0;
    state.pursuing = difficulty !== 'easy' && charged &&
      (gap > (committed ? navigationConfig.pursuitExitGap : navigationConfig.pursuitEnterGap) ||
        (committed && bot.combat.attack.phase === 'armed'));

    const signal = this.signal;
    if (state.visitedSignal !== signal) state.visitedSignal = undefined;
    if (!signal || difficulty === 'easy' || (bot.strategy !== 'roamer' && !charged) ||
        state.visitedSignal === signal) {
      state.signal = undefined;
      return;
    }
    const remaining = distance(bot.position, signal);
    const following = state.signal === signal;
    if (following && remaining <= 270) state.visitedSignal = signal;
    const signalRange = difficulty === 'hard' ? 1050 : 1900;
    state.signal = remaining > 270 &&
      remaining < signalRange + (following ? navigationConfig.exitClearance : 0) ? signal : undefined;
  }

  private updateDodge(bot: Bot, state: BotTactics): void {
    if (state.dodge?.attack.phase === 'warning' && state.dodge.attack.remaining > 0) return;
    state.dodge = undefined;
    for (const opponent of this.participants) {
      if (opponent === bot) continue;
      const attack = opponent.combat.attack;
      if (attack.phase !== 'warning' || gapBetween(bot, opponent) >= theftConfig.reach) continue;
      const angle = bearingTo(opponent.position, bot.position);
      if (angleBetween(attack.bearing, angle) >= theftConfig.halfAngle) continue;
      const side = Math.sin(angle - attack.bearing) >= 0 ? 1 : -1;
      const dodgeAngle = angle + side * Math.PI / 3;
      state.dodge = { attack, target: { x: bot.position.x + Math.cos(dodgeAngle) * 300,
        y: bot.position.y + Math.sin(dodgeAngle) * 300 } };
      return;
    }
  }

  replenish(view: WorldBounds): void {
    if (this.tutorial) return;
    this.particles.replenish(this.participants, view, this.elapsedSinceReplenish);
    this.elapsedSinceReplenish = 0;
  }
}
