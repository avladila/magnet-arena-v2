import { angleBetween, bearingTo, forecastTheft, gapBetween } from './combat';
import { theftConfig } from './competition-config';
import { arena } from './config';
import type { ArenaModel } from './arena-model';
import type { Participant, Point } from './movement';
import type { ResourceKind, Scrap, WorldBounds } from './particles';
import { salvageEligible, type Debris } from './salvage';

const awareness = 600;
const concern = 400;
const exitAwareness = 700;
const resourceReach = 330;
const reviewSeconds = 0.12;
const commitmentSeconds = 0.35;
const switchAdvantage = 1.2;
const cellSize = 240;
const columns = Math.floor(arena.width / cellSize) + 1;

type Rival = { kind: 'opponent'; actor: Participant };
type Resource = { kind: ResourceKind; scrap: Scrap; generation: number } | { kind: 'salvage'; chunk: Debris };
export type AttentionTarget = Rival | Resource;
export type Observation = { target: AttentionTarget; point: Point; danger: boolean };
type Choice = { target: AttentionTarget; tier: number; score: number; danger: boolean; aimed?: boolean };
type ArenaRead = Pick<ArenaModel, 'participants' | 'particles' | 'salvage'>;

function pointOf(target: AttentionTarget): Point {
  if (target.kind === 'opponent') return target.actor.position;
  return target.kind === 'salvage' ? target.chunk : target.scrap;
}

function sameTarget(a: AttentionTarget, b: AttentionTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'opponent') return b.kind === 'opponent' && a.actor === b.actor;
  if (a.kind === 'salvage') return b.kind === 'salvage' && a.chunk === b.chunk;
  return 'scrap' in b && a.scrap === b.scrap && a.generation === b.generation;
}

function inside({ x, y }: Point, bounds: WorldBounds): boolean {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function better(candidate: Choice, best: Choice | undefined): boolean {
  return !best || candidate.tier > best.tier || candidate.tier === best.tier && candidate.score > best.score;
}

function worthSwitching(candidate: Choice, current: Choice): boolean {
  return candidate.tier > current.tier || candidate.tier === current.tier && candidate.score > switchAdvantage * current.score;
}

/** Shared read-only view of the actors and resources eligible for on-screen attention. */
export class AttentionWorld {
  private bounds?: WorldBounds;
  private model?: ArenaRead;
  private readonly rivals = new Map<Participant, Rival>();
  private readonly visibleRivals = new Set<Participant>();
  private readonly prepared: Rival[] = [];
  private readonly bins = new Map<number, Resource[]>();
  private readonly liveSalvage = new Set<Debris>();
  private refresh = 0;
  private playerAim = 0;

  reset(): void {
    this.model = this.bounds = undefined;
    this.rivals.clear();
    this.visibleRivals.clear();
    this.prepared.length = 0;
    this.bins.clear();
    this.liveSalvage.clear();
    this.refresh = 0;
  }

  update(model: ArenaRead, bounds: WorldBounds, seconds: number, playerAim: number,
      resources: readonly Scrap[] = model.particles.slots): void {
    if (model !== this.model) this.reset();
    this.model = model;
    this.bounds = bounds;
    this.playerAim = playerAim;
    this.visibleRivals.clear();
    this.prepared.length = 0;
    for (const actor of model.participants) {
      if (!inside(actor.position, bounds)) continue;
      const rival = this.rivals.get(actor) ?? { kind: 'opponent', actor };
      this.rivals.set(actor, rival);
      this.visibleRivals.add(actor);
      if (actor.combat.attack.phase === 'warning' || actor.combat.attack.phase === 'armed') this.prepared.push(rival);
    }
    this.liveSalvage.clear();
    for (const chunk of model.salvage.chunks) this.liveSalvage.add(chunk);
    this.refresh -= seconds;
    if (this.refresh > 0) return;
    this.refresh = reviewSeconds;
    this.bins.clear();
    for (const scrap of resources) {
      if (scrap.state === 'active' && inside(scrap, bounds)) {
        this.index({ kind: model.particles.kind(scrap), scrap, generation: scrap.generation }, scrap);
      }
    }
    for (const chunk of this.liveSalvage) if (inside(chunk, bounds)) this.index({ kind: 'salvage', chunk }, chunk);
  }

  private index(resource: Resource, position: Point): void {
    const key = Math.floor(position.x / cellSize) + Math.floor(position.y / cellSize) * columns;
    const bin = this.bins.get(key);
    if (bin) bin.push(resource);
    else this.bins.set(key, [resource]);
  }

  private attackBearing(actor: Participant): number {
    const phase = actor.combat.attack;
    return phase.phase === 'warning' ? phase.bearing : actor.kind === 'player' ? this.playerAim : actor.heading;
  }

  private inCone(attacker: Participant, defender: Participant, gap: number): boolean {
    return gap <= theftConfig.reach && angleBetween(this.attackBearing(attacker),
      bearingTo(attacker.position, defender.position)) <= theftConfig.halfAngle;
  }

  imminent(observer: Participant): Choice | undefined {
    let best: Choice | undefined;
    for (const target of this.prepared) {
      if (observer === target.actor || observer.combat.guardFor > 1e-9) continue;
      const gap = gapBetween(observer, target.actor);
      if (!this.inCone(target.actor, observer, gap)) continue;
      const candidate = this.opponent(observer, target, gap);
      if (candidate.danger && better(candidate, best)) best = candidate;
    }
    return best;
  }

  best(observer: Participant): Choice | undefined {
    let best: Choice | undefined;
    let aimed: Choice | undefined;
    const ownAttack = observer.combat.attack.phase;
    for (const actor of this.visibleRivals) {
      if (observer === actor) continue;
      const target = this.rivals.get(actor)!;
      const gap = gapBetween(observer, actor);
      if (gap > awareness) continue;
      const candidate = this.opponent(observer, target, gap);
      if (better(candidate, best)) best = candidate;
      if ((ownAttack === 'armed' || ownAttack === 'warning') && actor.combat.guardFor <= 1e-9 && this.inCone(observer, actor, gap)) {
        const score = forecastTheft(observer, actor, 'impact') / (100 + gap);
        if (score > 0 && (!aimed || score > aimed.score)) aimed = { ...candidate, score, aimed: true };
      }
    }
    if (aimed && !best?.danger) return aimed;
    if (best) return best;

    // Only nearby cells are searched. One scene-wide pass refreshes the index, using live slot references.
    const radius = observer.radius + resourceReach + 65;
    const { x, y } = observer.position;
    for (let row = Math.max(0, Math.floor((y - radius) / cellSize)); row <= Math.floor((y + radius) / cellSize); row++) {
      const last = Math.min(columns - 1, Math.floor((x + radius) / cellSize));
      for (let col = Math.max(0, Math.floor((x - radius) / cellSize)); col <= last; col++) {
        const bin = this.bins.get(row * columns + col);
        if (!bin) continue;
        for (const target of bin) {
          const candidate = this.current(observer, target, false);
          if (candidate && better(candidate, best)) best = candidate;
        }
      }
    }
    return best;
  }

  current(observer: Participant, target: AttentionTarget, retained = true): Choice | undefined {
    const point = pointOf(target);
    if (!this.bounds || !inside(point, this.bounds)) return;
    if (target.kind === 'opponent') {
      if (!this.visibleRivals.has(target.actor)) return;
      const gap = gapBetween(observer, target.actor);
      if (gap <= (retained ? exitAwareness : awareness)) return this.opponent(observer, target, gap);
      return;
    }
    const gap = Math.max(0, Math.hypot(point.x - observer.position.x, point.y - observer.position.y) - observer.radius);
    if (gap > resourceReach + (retained ? 70 : 0)) return;
    if (target.kind === 'salvage') {
      if (!this.liveSalvage.has(target.chunk) || !salvageEligible(target.chunk, observer.id)) return;
    } else if (target.scrap.state !== 'active' || target.generation !== target.scrap.generation ||
        target.kind === 'energy' && observer.combat.energy >= theftConfig.energy) return;
    const tier = target.kind === 'energy' ? 3 : target.kind === 'gold' ? 2 : 1;
    const reward = target.kind === 'salvage' ? 1 + Math.min(0.27, target.chunk.value / 240) : 1;
    return { target, tier, score: reward / (110 + gap), danger: false };
  }

  private opponent(observer: Participant, target: Rival, gap: number): Choice {
    const rival = target.actor;
    const phase = rival.combat.attack.phase;
    const preparing = phase === 'warning' || phase === 'armed';
    const charged = rival.combat.energy >= theftConfig.energy;
    const loss = observer.combat.guardFor <= 1e-9 && (preparing || charged) ? forecastTheft(rival, observer, 'impact') : 0;
    const incoming = preparing && loss > 0 && this.inCone(rival, observer, gap);
    const threat = loss > 0 && (incoming || charged && phase !== 'cooldown' &&
      (gap <= theftConfig.reach || gap <= concern && loss >= Math.max(12, observer.mass * 0.06) && this.closingIn(rival, observer)));
    const tier = incoming ? (phase === 'warning' ? 9 : 8) : threat ? 7 : preparing ? 6 : charged ? 5 : 4;
    return { target, tier, score: (1 + Math.min(0.2, loss / observer.mass)) / (200 + gap), danger: threat };
  }

  private closingIn(rival: Participant, observer: Participant): boolean {
    const x = observer.position.x - rival.position.x;
    const y = observer.position.y - rival.position.y;
    const closing = (rival.velocity.x - observer.velocity.x) * x + (rival.velocity.y - observer.velocity.y) * y;
    return closing > 185 * Math.hypot(x, y);
  }
}

export class CharacterAttention {
  private focus?: AttentionTarget;
  private review = 0;
  private commitment = 0;

  reset(): void {
    this.focus = undefined;
    this.review = this.commitment = 0;
  }

  update(observer: Participant, world: AttentionWorld, seconds: number): Observation | undefined {
    this.review -= seconds;
    this.commitment -= seconds;
    const incoming = world.imminent(observer);
    let current = this.focus && world.current(observer, this.focus);
    if (incoming && (!current || worthSwitching(incoming, current))) {
      current = this.follow(incoming);
    } else if (this.review <= 0 || this.focus && !current) {
      const stagger = (observer.id.charCodeAt(observer.id.length - 1) + 3 * observer.id.length) % 8;
      this.review = observer.kind === 'player' ? reviewSeconds : .105 + .006 * stagger;
      const best = world.best(observer);
      if (best && (!current || !sameTarget(current.target, best.target) && (
        best.danger && !current.danger || best.aimed || this.commitment <= 0 && worthSwitching(best, current)
      ))) current = this.follow(best);
    }
    if (!current) {
      this.focus = undefined;
      return;
    }
    return { target: current.target, point: pointOf(current.target), danger: current.danger };
  }

  private follow(choice: Choice): Choice {
    if (!this.focus || !sameTarget(this.focus, choice.target)) this.commitment = commitmentSeconds;
    this.focus = choice.target;
    return choice;
  }
}
