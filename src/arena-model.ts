import { angleBetween, arm, bearingTo, cancelArm, gapBetween, legacyTheftDamage, release, resolveTheft,
  Salvage, salvageEligible, shell, theftDamage, type CombatRules, type Debris } from './combat';
import { activityConfig, botTactics, navigationConfig, tacticsConfig, theftConfig } from './competition-config';
import { ArenaActivity, type Hotspot, type SalvageSignal } from './arena-activity';
import { playerConfig, populationConfig, resourceBudget } from './config';
import { physicalScaleForMass } from './growth';
import { Hazards } from './hazards';
import type { Attack } from './combat-state';
import { Tutorial } from './tutorial';
import { rankings, type Difficulty } from './match';
import type { Point } from './movement';
import { advanceAttraction, AttractionGrid, type AttractionResult } from './attraction';
import { BotAI } from './bot-ai';
import { createBots, type Bot } from './bots';
import { advance, clampToArena, createPlayer, type Participant, type Steering } from './movement';
import { ParticlePool, type Scrap, type WorldBounds } from './particles';

type Opportunity = Hotspot | SalvageSignal;
type BotTactics = {
  nextEvaluation: number;
  nextAttack: number;
  fireAt?: number;
  armedFor?: Participant;
  victim?: Participant;
  pursuing: boolean;
  opportunity?: { area: Opportunity; point: Point };
  visited?: Opportunity;
  dodge?: { attack: Attack; target: Point };
  retreat?: { point: Point; until: number };
  salvage?: { chunk: Debris; point: Point };
  abandoned?: Debris;
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const noHotspots: readonly Hotspot[] = [];

export class ArenaModel {
  readonly player = createPlayer();
  readonly bots: readonly Bot[];
  readonly participants: readonly Participant[];
  readonly particles: ParticlePool;
  private readonly botAI = new BotAI();
  private elapsedSinceReplenish = 0;

  readonly salvage: Salvage;
  readonly hazards?: Hazards;
  readonly combatRules: CombatRules;
  readonly tutorial?: Tutorial;
  private readonly activity?: ArenaActivity;
  private elapsed = 0;
  private readonly tactics = new Map<Bot, BotTactics>();
  private readonly attractionGrid?: AttractionGrid;
  private readonly populated: boolean;
  private readonly places = new Map<Participant, number>();
  private nextRanking = 0;
  private readonly kindOf = (scrap: Scrap) => this.particles.kind(scrap);
  private readonly hardWeight = (scrap: Scrap) => {
    const kind = this.kindOf(scrap);
    return kind === 'gold' ? 5 : kind === 'energy' ? 2 : 1;
  };

  constructor(seed: number, private readonly difficulty?: Difficulty, tutorial = false,
      options: { participantCount?: number; combat?: CombatRules } = {}) {
    const count = tutorial ? populationConfig.tutorial
      : options.participantCount ?? (difficulty ? populationConfig.competitive : populationConfig.legacy);
    this.bots = createBots(seed, Math.max(0, count - 1));
    for (const bot of this.bots) this.tactics.set(bot, { nextEvaluation: 0, nextAttack: 0, pursuing: false });
    this.participants = [this.player, ...this.bots];
    this.populated = this.participants.length > populationConfig.legacy;
    if (this.populated) this.attractionGrid = new AttractionGrid();
    this.combatRules = options.combat ?? 'impact';
    this.salvage = new Salvage(this.combatRules === 'legacy' ? theftConfig.legacyDebrisCapacity : theftConfig.debrisCapacity);
    const { activeCount, capacity } = resourceBudget(this.participants.length);
    this.particles = new ParticlePool(seed, this.participants,
      tutorial ? 0 : activeCount, Boolean(difficulty || tutorial), tutorial ? populationConfig.tutorialSlots : capacity);
    if (difficulty || tutorial) this.hazards = new Hazards(seed, this.participants);
    if (difficulty && !tutorial) this.activity = new ArenaActivity(seed);
    if (tutorial) this.tutorial = new Tutorial(this);
  }

  get signal() { return this.activity?.signal; }
  get hotspots() { return this.activity?.hotspots ?? noHotspots; }

  step(steering: Steering, seconds: number): AttractionResult | undefined {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return;
    if (!this.tutorial) this.elapsedSinceReplenish += seconds;
    if (!this.tutorial) {
      this.botAI.update(this.bots, this.particles.slots, seconds, this.difficulty,
        this.difficulty === 'hard' ? this.hardWeight : undefined, this.populated ? this.kindOf : undefined);
    }
    advance(this.player, steering, seconds);
    this.elapsed += seconds;
    if (!this.tutorial) {
      if (this.difficulty) {
        this.activity?.update(this.elapsed, this.particles.slots, this.participants);
        if (this.populated && this.elapsed >= this.nextRanking) {
          for (const row of rankings(this.participants)) this.places.set(row.participant, row.place);
          this.nextRanking = this.elapsed + navigationConfig.evaluationSeconds;
        }
      }
      for (const bot of this.bots) advance(bot, this.botSteering(bot, seconds), seconds);
    }
    if (this.hazards) {
      this.salvage.step(this.tutorial ? [this.player] : this.participants, seconds);
      resolveTheft(this.participants, this.salvage, seconds, this.combatRules);
      this.hazards.step(this.participants, this.salvage, seconds);
    }
    this.tutorial?.step();
    return advanceAttraction(this.particles, this.tutorial ? [this.player] : this.participants, seconds, this.attractionGrid);
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
    const opportunity = state.opportunity;
    if (opportunity && this.activeOpportunity(opportunity.area)) target = opportunity.point;
    if (state.salvage) target = state.salvage.point;
    if (victim && victim.combat.guardFor <= 1e-9 && !state.retreat && bot.combat.energy === theftConfig.energy) {
      const gap = gapBetween(bot, victim);
      if (state.pursuing && (!state.salvage || bot.strategy !== 'scavenger')) {
        const angle = bearingTo(victim.position, bot.position);
        const approach = victim.radius + bot.radius + navigationConfig.pursuitExitGap;
        target = gap > navigationConfig.pursuitExitGap
          ? { x: victim.position.x + Math.cos(angle) * approach,
              y: victim.position.y + Math.sin(angle) * approach }
          : bot.position;
      }
      if (gap < theftConfig.reach * 0.8 && this.elapsed >= state.nextAttack) {
        if (arm(bot)) {
          state.fireAt = this.elapsed + tactics.arming;
          state.armedFor = victim;
        }
        state.nextAttack = this.elapsed + tactics.reconsider;
      }
    }
    if (state.fireAt !== undefined && this.elapsed >= state.fireAt) {
      // Attack bearings are resolved from live geometry, independent of the visible body yaw.
      const opponent = state.armedFor;
      if (opponent && opponent.combat.guardFor <= 1e-9 && !state.retreat) {
        release(bot, bearingTo(bot.position, opponent.position));
      } else cancelArm(bot);
      state.fireAt = undefined;
      state.armedFor = undefined;
    }
    if (this.difficulty === 'hard') this.updateDodge(bot, state);
    const steering = bot.navigation.steer(bot, state.dodge?.target ?? state.retreat?.point ?? target, this.hazards.sites,
      tactics.safety, victim !== undefined || state.retreat !== undefined, seconds, Boolean(state.dodge || state.retreat));
    if (bot.navigation.takeReplanRequest()) {
      bot.target = undefined;
      bot.decisionIn = 0;
      state.pursuing = false;
      state.visited = state.opportunity?.area;
      state.opportunity = undefined;
      state.abandoned = state.salvage?.chunk;
      state.salvage = undefined;
      state.retreat = undefined;
    }
    return steering;
  }

  private evaluateTactics(bot: Bot, state: BotTactics): void {
    const difficulty = this.difficulty!;
    const preference = this.populated ? botTactics[bot.strategy].pursuit : 1;
    const range = theftConfig.reach + tacticsConfig[difficulty].pursuit * preference;
    const previous = state.victim;
    const previousGap = previous ? gapBetween(bot, previous) : Infinity;
    const held = previous && previousGap <= range + navigationConfig.exitClearance
      ? this.attackUtility(bot, previous, previousGap) : 0;
    let score = held * navigationConfig.targetAdvantage;
    let victim = held > 0 ? previous : undefined;
    for (const candidate of this.participants) {
      if (candidate === bot || candidate === previous && held > 0) continue;
      const gap = gapBetween(bot, candidate);
      if (gap > range) continue;
      const utility = this.attackUtility(bot, candidate, gap);
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

    if (this.populated) {
      this.evaluateRetreat(bot, state);
      this.evaluateSalvage(bot, state);
      if (bot.strategy === 'collector' && victim && !committed && this.projectedLoss(bot, victim) < 70) state.pursuing = false;
    }

    this.evaluateOpportunity(bot, state, charged);
  }

  private activeOpportunity(area: Opportunity): boolean {
    return area.expires > this.elapsed && ('resources' in area ? this.signal === area : this.hotspots.includes(area));
  }

  private evaluateOpportunity(bot: Bot, state: BotTactics, charged: boolean): void {
    const current = state.opportunity;
    if (current && this.activeOpportunity(current.area) && !state.retreat) {
      if (distance(bot.position, current.point) > Math.max(90, bot.radius * 0.55)) return;
      state.visited = current.area;
    }
    state.opportunity = undefined;
    if (state.retreat || state.salvage || state.pursuing || bot.navigation.mode !== 'direct') return;
    const opportunities: Opportunity[] = this.signal ? [this.signal, ...this.hotspots] : [...this.hotspots];
    let selected: Opportunity | undefined;
    let best = 0.29;
    for (const area of opportunities) {
      if (area === state.visited) continue;
      const remaining = distance(bot.position, area);
      const publicSignal = 'resources' in area;
      const range = publicSignal ? activityConfig.signalTravel : activityConfig.hotspotTravel;
      if (remaining <= 290 || remaining > range || this.elapsed + remaining / playerConfig.speed + 1.2 >= area.expires) continue;
      let followers = 0;
      for (const other of this.tactics.values()) if (other.opportunity?.area === area) followers++;
      if (followers >= (publicSignal ? activityConfig.signalFollowers : activityConfig.hotspotFollowers)) continue;
      const role = botTactics[bot.strategy];
      const interest = publicSignal ? 0.72 + role.salvage * 0.36 + (charged ? 0.17 : 0)
        : (bot.strategy === 'roamer' ? 1.15 : 0.98) - (role.pursuit - 1) * 0.2;
      const value = publicSignal ? Math.min(1.5, area.resources / 23) : 0.72 + area.strength * 0.36;
      const score = value * interest / (1 + remaining / 1500 + followers * 0.17);
      if (score <= best) continue;
      best = score;
      selected = area;
    }
    if (!selected) return;
    const route = bearingTo(bot.position, selected) + (Number(bot.id.slice(4)) % 7 - 3) * 0.24;
    const point = clampToArena({ x: selected.x + Math.cos(route) * 310, y: selected.y + Math.sin(route) * 310 }, bot.radius);
    state.opportunity = { area: selected, point };
  }

  private projectedLoss(attacker: Participant, victim: Participant): number {
    return this.combatRules === 'impact' ? theftDamage(attacker, victim)
      : legacyTheftDamage(attacker.mass, victim.mass, shell(victim));
  }

  private attackUtility(bot: Bot, victim: Participant, gap: number): number {
    if (victim.combat.guardFor > 1e-9) return 0;
    if (!this.populated) return shell(victim) / (1 + gap / 100);
    const rank = this.places.get(victim) ?? Infinity;
    const contender = rank < (this.places.get(bot) ?? Infinity) && rank <= 5 ? 1.24 : 1;
    return this.projectedLoss(bot, victim) * contender / (1 + gap / 120);
  }

  private evaluateRetreat(bot: Bot, state: BotTactics): void {
    if (state.retreat && this.elapsed < state.retreat.until) return;
    state.retreat = undefined;
    if (bot.physicalScale < 4 || bot.combat.guardFor > 0) return;
    let threat: Participant | undefined;
    let worst = 0;
    for (const opponent of this.participants) {
      if (opponent === bot || opponent.combat.energy < theftConfig.energy || opponent.combat.attack.phase === 'cooldown') continue;
      const gap = gapBetween(bot, opponent);
      if (gap > theftConfig.reach + 95) continue;
      const postScale = physicalScaleForMass(bot.mass - this.projectedLoss(opponent, bot));
      const reduction = 1 - postScale / bot.physicalScale;
      if (reduction < 0.26 || reduction <= worst) continue;
      if (bot.strategy === 'hunter' && bot.combat.energy === theftConfig.energy && reduction < 0.4) continue;
      worst = reduction;
      threat = opponent;
    }
    if (!threat) return;
    const away = bearingTo(threat.position, bot.position);
    let best = bot.position;
    let score = -Infinity;
    for (const offset of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
      const angle = away + offset;
      const point = clampToArena({ x: bot.position.x + Math.cos(angle) * 520,
        y: bot.position.y + Math.sin(angle) * 520 }, bot.radius + 12);
      const hazards = this.hazards!.sites;
      let risk = 0;
      for (const site of hazards) risk += Math.max(0, site.radius + bot.radius - distance(point, site));
      const value = distance(point, threat.position) - risk * 3;
      if (value <= score) continue;
      score = value;
      best = point;
    }
    state.retreat = { point: best, until: this.elapsed + 1.15 };
  }

  private evaluateSalvage(bot: Bot, state: BotTactics): void {
    const preference = botTactics[bot.strategy].salvage;
    const chunks = this.salvage.chunks;
    const range = 480 + 260 * preference;
    if (state.abandoned && !chunks.includes(state.abandoned)) state.abandoned = undefined;
    const current = state.salvage;
    let selected: Debris | undefined;
    let score = 3;
    for (const chunk of chunks) {
      if (chunk === state.abandoned || !salvageEligible(chunk, bot.id)) continue;
      const dx = chunk.x - bot.position.x;
      const dy = chunk.y - bot.position.y;
      if (dx * dx + dy * dy > (range + bot.radius) ** 2) continue;
      const own = chunk.source?.credits.some(({ id }) => id === bot.id);
      const value = Math.sqrt(chunk.value) * (preference + (own ? 0.75 : 0)) *
        (chunk === current?.chunk ? navigationConfig.targetAdvantage : 1) / (1 + Math.hypot(dx, dy) / 400);
      if (value <= score) continue;
      score = value;
      selected = chunk;
    }
    state.salvage = selected && (current?.chunk === selected && distance(current.point, selected) < 82
      ? current : { chunk: selected, point: { x: selected.x, y: selected.y } });
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
    this.particles.replenish(this.participants, view, this.elapsedSinceReplenish, this.hotspots);
    this.elapsedSinceReplenish = 0;
  }
}
