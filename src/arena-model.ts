import { angleBetween, arm, bearingTo, gapBetween, release, resolveTheft, Salvage, shell } from './combat';
import { tacticsConfig, theftConfig } from './competition-config';
import { Hazards } from './hazards';
import { Tutorial } from './tutorial';
import type { Difficulty } from './match';
import type { Point } from './movement';
import { advanceAttraction, type AttractionResult } from './attraction';
import { BotAI } from './bot-ai';
import { createBots, type Bot } from './bots';
import { advance, createPlayer, type Participant, type Steering } from './movement';
import { ParticlePool, type WorldBounds } from './particles';

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
  private readonly fireAt = new Map<Bot, number>();
  private readonly tacticsAt = new Map<Bot, number>();

  constructor(seed: number, private readonly difficulty?: Difficulty, tutorial = false) {
    this.bots = createBots(seed);
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
      for (const bot of this.bots) advance(bot, this.botSteering(bot), seconds);
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

  private botSteering(bot: Bot): Steering {
    let target = bot.target?.point;
    if (!this.difficulty || !this.hazards) return target ? { kind: 'target', point: target } : { kind: 'idle' };
    const hard = this.difficulty === 'hard';
    const easy = this.difficulty === 'easy';
    const tactics = tacticsConfig[this.difficulty];
    let victim: Participant | undefined;
    let score = 0;
    for (const candidate of this.participants) {
      if (candidate === bot) continue;
      const gap = gapBetween(bot, candidate);
      if (gap > theftConfig.reach + tactics.pursuit) continue;
      const threat = candidate.combat.attack;
      if (hard && threat.phase === 'warning' && gap < theftConfig.reach &&
          angleBetween(threat.bearing, bearingTo(candidate.position, bot.position)) < theftConfig.halfAngle) {
        const angle = bearingTo(candidate.position, bot.position);
        const cross = Math.sin(angle - threat.bearing) >= 0 ? 1 : -1;
        target = { x: bot.position.x + Math.cos(angle + cross * Math.PI / 3) * 300,
          y: bot.position.y + Math.sin(angle + cross * Math.PI / 3) * 300 };
        return { kind: 'target', point: target };
      }
      const utility = shell(candidate) / (1 + gap / 100);
      if (utility > score) {
        score = utility;
        victim = candidate;
      }
    }
    if (this.signal && !easy) {
      const distance = Math.hypot(this.signal.x - bot.position.x, this.signal.y - bot.position.y);
      if (distance < (hard ? 1050 : 1900) && distance > 270 &&
          (bot.strategy === 'roamer' || bot.combat.energy === theftConfig.energy)) target = this.signal;
    }
    if (victim && bot.combat.energy === theftConfig.energy) {
      if (!easy && gapBetween(bot, victim) > 170) target = victim.position;
      if (gapBetween(bot, victim) < theftConfig.reach * 0.8 && this.elapsed >= (this.tacticsAt.get(bot) ?? 0)) {
        if (arm(bot)) this.fireAt.set(bot, this.elapsed + tactics.arming);
        this.tacticsAt.set(bot, this.elapsed + tactics.reconsider);
      }
    }
    const fire = this.fireAt.get(bot);
    if (fire !== undefined && this.elapsed >= fire) {
      release(bot, victim ? bearingTo(bot.position, victim.position) : bot.heading);
      this.fireAt.delete(bot);
    }
    for (const hazard of this.hazards.sites) {
      if (hazard.kind === 'flux' && bot.mass < 120 || hazard.kind === 'cold' && !victim) continue;
      const distance = Math.hypot(bot.position.x - hazard.x, bot.position.y - hazard.y);
      if (distance > bot.radius + hazard.radius + tactics.safety) continue;
      const away = bearingTo(hazard, bot.position);
      target = { x: bot.position.x + 300 * Math.cos(away), y: bot.position.y + 300 * Math.sin(away) };
      break;
    }
    return target ? { kind: 'target', point: target } : { kind: 'idle' };
  }

  replenish(view: WorldBounds): void {
    if (this.tutorial) return;
    this.particles.replenish(this.participants, view, this.elapsedSinceReplenish);
    this.elapsedSinceReplenish = 0;
  }
}
