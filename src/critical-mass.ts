import { cancelArm } from './combat';
import { criticalMassConfig, type CriticalOverrides, type CriticalRules } from './competition-config';
import { compareRank } from './match';
import { captureStandings, detonationResult, ordinaryResult, type FinalStanding, type Interruption, type MatchResult } from './match-result';
import type { Participant, Point } from './movement';

const epsilon = 1e-9;

export type Claim = Readonly<{ serial: number; actor: Participant; center: Readonly<Point>; remaining: number }>;
export type Blast = Readonly<{ serial: number; winner: Participant; center: Readonly<Point>; at: number; radius: number; elapsed: number }>;
export type CriticalEvent =
  | { type: 'claim'; claim: Claim }
  | { type: 'interrupted'; interruption: Interruption }
  | { type: 'detonation'; blast: Blast }
  | { type: 'destroyed'; id: string; point: Readonly<Point>; radius: number; heading: number; mass: number };

type State = { kind: 'play' } | { kind: 'countdown'; claim: Claim }
  | { kind: 'detonation' | 'shockwave'; blast: Blast }
  | { kind: 'results'; result: MatchResult; blast?: Blast };

type Commit = Readonly<{ standings: readonly FinalStanding[]; bestPlace?: number }>;

/** Intersect a moving disc with a linearly expanding, filled circle over one fixed step. */
export function sweptBlastHit(from: Point, to: Point, center: Point, body: number, start: number, end: number): boolean {
  const x = from.x - center.x, y = from.y - center.y;
  const dx = to.x - from.x, dy = to.y - from.y;
  const radius = start + body, growth = end - start;
  const a = dx * dx + dy * dy - growth * growth;
  const b = 2 * (x * dx + y * dy - radius * growth);
  const c = x * x + y * y - radius * radius;
  if (c <= epsilon || a + b + c <= epsilon) return true;
  const t = -b / (2 * a);
  return a > 0 && t > 0 && t < 1 && (a * t + b) * t + c <= epsilon;
}

const freezePoint = ({ x, y }: Point) => Object.freeze({ x, y });
const stop = (actor: Participant) => { actor.velocity = { x: 0, y: 0 }; };

export class CriticalMass {
  readonly rules: CriticalRules;
  private phase: State = { kind: 'play' };
  private serial = 0;
  private commit?: Commit;
  private readonly eliminated = new Set<string>();
  private readonly history: Interruption[] = [];
  private readonly changes: CriticalEvent[] = [];

  constructor(overrides?: CriticalOverrides) {
    this.rules = Object.freeze({ ...criticalMassConfig, ...overrides });
  }

  get state(): State['kind'] { return this.phase.kind; }
  get claim(): Claim | undefined { return this.phase.kind === 'countdown' ? this.phase.claim : undefined; }
  get blast(): Blast | undefined {
    return 'blast' in this.phase ? this.phase.blast : undefined;
  }
  get committed() { return this.commit !== undefined; }
  get finished() { return this.phase.kind === 'results'; }
  get result() { return this.phase.kind === 'results' ? this.phase.result : undefined; }
  get interruptions(): readonly Interruption[] { return this.history; }
  get events(): readonly CriticalEvent[] { return this.changes; }
  get warning() { return this.claim ?? this.blast; }
  get destroyedCount() { return this.eliminated.size; }

  destroyed(actor: Participant): boolean { return this.eliminated.has(actor.id); }
  removed(actor: Participant): boolean {
    return this.destroyed(actor) || actor === this.blast?.winner || (this.committed && this.result?.winnerId === actor.id);
  }

  afterStep(participants: readonly Participant[], seconds: number, at: number, bestPlace?: number,
      loss?: { attackerId?: string; hazard: boolean }): void {
    const active = this.claim;
    if (active && Number.isFinite(active.actor.mass) && active.actor.mass >= this.rules.threshold) {
      const remaining = Math.max(0, active.remaining - seconds);
      if (remaining <= epsilon) this.detonate(active, participants, at, bestPlace);
      else this.phase = { kind: 'countdown', claim: { ...active, remaining } };
      return;
    }
    if (active) {
      const actor = active.actor;
      actor.combat.attackBlocked = undefined;
      const interruption: Interruption = Object.freeze({ claimantId: actor.id, at,
        cause: loss?.attackerId ? 'theft' : loss?.hazard ? 'hazard' : 'mass', attackerId: loss?.attackerId });
      this.history.push(interruption);
      this.changes.push({ type: 'interrupted', interruption });
      this.phase = { kind: 'play' };
    }
    if (this.phase.kind !== 'play') return;
    let claimant: Participant | undefined;
    for (const actor of participants) {
      if (!Number.isFinite(actor.mass) || actor.mass < this.rules.threshold ||
          !Number.isFinite(actor.position.x) || !Number.isFinite(actor.position.y)) continue;
      const rank = claimant ? compareRank(actor, claimant) : -1;
      if (rank < 0 || rank === 0 && claimant && actor.id < claimant.id) claimant = actor;
    }
    if (!claimant) return;
    const claim: Claim = { serial: ++this.serial, actor: claimant, center: freezePoint(claimant.position), remaining: this.rules.countdown };
    cancelArm(claimant);
    claimant.combat.attackBlocked = true;
    stop(claimant);
    this.phase = { kind: 'countdown', claim };
    this.changes.push({ type: 'claim', claim });
  }

  private detonate(claim: Claim, participants: readonly Participant[], at: number, bestPlace?: number): void {
    this.commit = Object.freeze({ standings: captureStandings(participants, 'arena', this.rules), bestPlace });
    const blast: Blast = Object.freeze({ serial: claim.serial, winner: claim.actor, center: claim.center, at, radius: 0, elapsed: 0 });
    this.phase = { kind: 'detonation', blast };
    this.changes.push({ type: 'detonation', blast });
    for (const actor of participants) {
      actor.combat.attackBlocked = true;
      actor.combat.attack = { phase: 'idle' };
      if (actor === claim.actor) stop(actor);
      else if (sweptBlastHit(actor.position, actor.position, blast.center, actor.radius, 0, 0)) this.destroy(actor);
    }
  }

  advanceWave(participants: readonly Participant[], seconds: number, move: (actor: Participant, dt: number) => void): void {
    const blast = this.blast;
    if (!blast || this.finished || !this.commit || !(seconds > 0)) return;
    const done = blast.elapsed + seconds >= this.rules.expansion - epsilon;
    const elapsed = done ? this.rules.expansion : blast.elapsed + seconds;
    const radius = this.rules.radius * elapsed / this.rules.expansion;
    for (const actor of participants) {
      if (this.removed(actor)) continue;
      const previous = actor.position;
      move(actor, elapsed - blast.elapsed);
      if (sweptBlastHit(previous, actor.position, blast.center, actor.radius, blast.radius, radius)) this.destroy(actor);
    }
    if (done) {
      this.phase = { kind: 'results', result: detonationResult(blast.winner.id, blast.at, blast.center,
        this.commit.standings, this.eliminated, this.rules.survivalReward, this.history, this.commit.bestPlace),
        blast: { ...blast, elapsed, radius } };
    } else this.phase = { kind: 'shockwave', blast: { ...blast, elapsed, radius } };
  }

  finishTimeout(participants: readonly Participant[], at: number, bestPlace?: number): MatchResult | undefined {
    if (this.committed) return this.result;
    if (this.result) return this.result;
    if (this.claim) this.claim.actor.combat.attackBlocked = undefined;
    const result = ordinaryResult('arena', participants, at, bestPlace, this.history, this.rules);
    this.phase = { kind: 'results', result };
    return result;
  }

  private destroy(actor: Participant): void {
    this.eliminated.add(actor.id);
    stop(actor);
    this.changes.push({ type: 'destroyed', id: actor.id, point: freezePoint(actor.position), radius: actor.radius,
      heading: actor.heading, mass: actor.mass });
  }
}
