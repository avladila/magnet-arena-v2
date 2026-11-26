import { pullMultiplier, type TheftImpact } from './combat-state';
import { theftConfig } from './competition-config';
import { arena, playerConfig } from './config';
import { addMass, attractionReach } from './growth';
import { clamp, clampToArena, type Participant, type Point } from './movement';

const radius = 5;
const turn = Math.PI * 2;
const frontShare = 0.65;

type Credit = { id: string; value: number };
type Provenance = { victimId: string; credits: readonly Credit[] };
export type Debris = Point & {
  destination: Point; origin: Point; value: number; age: number;
  source?: Provenance; offset?: number;
};

export function shell(participant: Participant): number {
  return Math.max(0, participant.mass - Math.max(playerConfig.initialMass, Math.floor(participant.combat.highest / 4)));
}

export function salvageEligible(chunk: Debris, id: string): boolean {
  return chunk.age + 1e-9 >= theftConfig.flight &&
    (chunk.source?.victimId !== id || chunk.age + 1e-9 >= theftConfig.flight + theftConfig.victimSalvageLock);
}

function chunkCount(value: number): number {
  if (value <= 40) return Math.min(value, 4 + Math.floor(value / 10));
  if (value <= 180) return 8 + Math.floor(value / 45);
  if (value <= 800) return 12 + Math.floor(value * 6 / 800);
  return Math.min(24, 18 + Math.floor(value / 550));
}

function landingPoint(origin: Point, distance: number, preferred: number, placed: readonly Point[]): Point {
  let nearest: Point | undefined;
  for (let step = 0; step <= 48; step++) {
    const angle = preferred + Math.ceil(step / 2) * Math.PI / 24 * (step % 2 ? 1 : -1);
    const x = origin.x + Math.cos(angle) * distance;
    const y = origin.y + Math.sin(angle) * distance;
    if (x < radius || y < radius || x > arena.width - radius || y > arena.height - radius) continue;
    nearest ??= { x, y };
    if (placed.every((point) => (point.x - x) ** 2 + (point.y - y) ** 2 >= 12 ** 2)) return { x, y };
  }
  // The maximum throw is much shorter than either arena axis, so an inward arc always exists.
  return nearest!;
}

export class Salvage {
  readonly chunks: Debris[] = [];
  readonly pending: Debris[] = [];
  expiredMass = 0;

  constructor(readonly capacity: number = theftConfig.debrisCapacity) {}

  detach(victim: Participant, requested: number, limit = shell(victim)): number {
    const origin = victim.position;
    const value = this.remove(victim, requested, limit);
    if (value === 0) return 0;
    const count = Math.min(8, value, this.capacity - this.chunks.length) || 1;
    for (let i = 0; i < count; i++) {
      const angle = i * turn / count + origin.x * 0.01;
      const destination = clampToArena({ x: origin.x + 145 * Math.cos(angle), y: origin.y + 145 * Math.sin(angle) }, radius);
      this.queue({ ...origin, origin, destination, age: 0, value: Math.floor(value / count) + Number(i < value % count) });
    }
    return value;
  }

  detachTheft(victim: Participant, requested: number, limit: number, impact: TheftImpact, credits: readonly Credit[]): number {
    const value = this.remove(victim, requested, limit);
    if (value === 0) return 0;
    const { origin, radius: originalRadius, bearing } = impact;
    const source = { victimId: victim.id, credits };
    const minimum = Math.max(145, originalRadius + 40, attractionReach(victim.physicalScale) + 35);
    const count = chunkCount(value);
    const frontMass = Math.round(value * frontShare);
    const frontCount = clamp(Math.round(count * frontShare), count - (value - frontMass), frontMass);
    const placed: Point[] = [];
    let offset = 0;
    for (let i = 0; i < count; i++) {
      const front = i < frontCount;
      const groupCount = front ? frontCount : count - frontCount;
      const mass = front ? frontMass : value - frontMass;
      const index = front ? i : i - frontCount;
      const fraction = (index + 0.5) / groupCount;
      const preferred = bearing + (front ? (fraction * 2 - 1) * Math.PI / 3 : Math.PI / 3 + fraction * 4 * Math.PI / 3);
      const fling = minimum * (1 + ((7 * i) % 11) * 0.022);
      const destination = landingPoint(origin, fling, preferred, placed);
      const part = Math.floor(mass / groupCount) + Number(index < mass % groupCount);
      placed.push(destination);
      this.queue({ ...origin, origin, destination, age: 0, value: part, offset, source });
      offset += part;
    }
    return value;
  }

  private remove(victim: Participant, requested: number, limit: number): number {
    const value = Math.max(0, Math.min(Math.floor(requested), limit, victim.mass));
    if (value > 0) addMass(victim, -value);
    return value;
  }

  private queue(chunk: Debris): void {
    (this.chunks.length < this.capacity ? this.chunks : this.pending).push(chunk);
  }

  step(participants: readonly Participant[], seconds: number): void {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const chunk = this.chunks[i];
      const airborne = chunk.age < theftConfig.flight;
      chunk.age += seconds;
      if (chunk.age + 1e-9 >= theftConfig.lifetime) {
        this.expiredMass += chunk.value;
        this.chunks.splice(i, 1);
        continue;
      }
      if (airborne) {
        this.flightPosition(chunk);
        if (chunk.age + 1e-9 < theftConfig.flight) continue;
      }
      if (this.pull(chunk, participants, seconds)) this.chunks.splice(i, 1);
    }
    let waiting = 0;
    for (const chunk of this.pending) {
      chunk.age += seconds;
      if (chunk.age + 1e-9 >= theftConfig.lifetime) this.expiredMass += chunk.value;
      else if (this.chunks.length < this.capacity) {
        this.flightPosition(chunk);
        this.chunks.push(chunk);
      } else this.pending[waiting++] = chunk;
    }
    this.pending.length = waiting;
  }

  private flightPosition(chunk: Debris): void {
    const t = Math.min(1, chunk.age / theftConfig.flight);
    chunk.x = chunk.origin.x + (chunk.destination.x - chunk.origin.x) * t;
    chunk.y = chunk.origin.y + (chunk.destination.y - chunk.origin.y) * t;
  }

  private pull(chunk: Debris, participants: readonly Participant[], seconds: number): boolean {
    let winner: Participant | undefined;
    let bestGap = Infinity;
    let speed = 0;
    for (const magnet of participants) {
      if (!salvageEligible(chunk, magnet.id)) continue;
      const contact = magnet.radius + radius;
      const reach = attractionReach(magnet.physicalScale);
      const squared = (chunk.x - magnet.position.x) ** 2 + (chunk.y - magnet.position.y) ** 2;
      if (squared > Math.max(contact, reach) ** 2) continue;
      const modifier = pullMultiplier(magnet);
      const gap = Math.sqrt(squared) - contact;
      if (gap <= Math.max(0, reach - contact) * modifier &&
          (gap < bestGap || (gap === bestGap && winner && magnet.id < winner.id))) {
        bestGap = gap;
        speed = 520 * modifier;
        winner = magnet;
      }
    }
    if (!winner) return false;
    const travel = speed * seconds;
    if (bestGap <= travel) {
      winner.combat.salvage += chunk.value;
      const source = chunk.source;
      if (source?.victimId === winner.id) winner.combat.reclaimedSalvage += chunk.value;
      if (source) {
        const start = chunk.offset!;
        let offset = 0;
        for (const credit of source.credits) {
          if (credit.id === winner.id) {
            winner.combat.ownSalvage += Math.max(0, Math.min(start + chunk.value, offset + credit.value) - Math.max(start, offset));
            break;
          }
          offset += credit.value;
        }
      }
      addMass(winner, chunk.value);
      return true;
    }
    const fraction = travel / (bestGap + winner.radius + radius);
    chunk.x += (winner.position.x - chunk.x) * fraction;
    chunk.y += (winner.position.y - chunk.y) * fraction;
    return false;
  }
}
