import { hazardConfig, theftConfig } from './competition-config';
import { addMass, attractionReach } from './growth';
import { clampToArena, type Participant, type Point } from './movement';

export function shell(participant: Participant): number {
  return Math.max(0, participant.mass - Math.max(20, Math.floor(participant.combat.highest / 4)));
}

export function theftDamage(attacker: number, defender: number, available: number): number {
  const fraction = Math.min(0.32, 0.12 + 0.04 * Math.log2(Math.max(1, defender / attacker)));
  return available === 0 ? 0 : Math.min(available, Math.max(1, Math.round(available * fraction)));
}

export function ready(participant: Participant): boolean {
  return participant.combat.attack.phase === 'idle' && participant.combat.energy === theftConfig.energy;
}

export function arm(participant: Participant): boolean {
  if (!ready(participant)) return false;
  participant.combat.attack = { phase: 'armed' };
  return true;
}

export function cancelArm(participant: Participant): void {
  if (participant.combat.attack.phase === 'armed') participant.combat.attack = { phase: 'idle' };
}

export function release(participant: Participant, bearing: number): boolean {
  if (participant.combat.attack.phase !== 'armed' || !Number.isFinite(bearing)) return false;
  participant.combat.attack = { phase: 'warning', bearing, remaining: theftConfig.warning };
  return true;
}

export function bearingTo(from: Point, to: Point): number {
  // Zero radians (east) is the deterministic bearing for coincident centers.
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function gapBetween(from: Participant, to: Participant): number {
  return Math.max(0, Math.hypot(from.position.x - to.position.x, from.position.y - to.position.y) - from.radius - to.radius);
}

export function angleBetween(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export type Debris = Point & { destination: Point; origin: Point; value: number; age: number };

export class Salvage {
  readonly chunks: Debris[] = [];
  readonly pending: { origin: Point; value: number; age: number }[] = [];
  expiredMass = 0;

  detach(victim: Participant, requested: number): number {
    const value = Math.min(requested, shell(victim));
    if (value <= 0) return 0;
    const origin = { ...victim.position };
    addMass(victim, -value);
    this.emit(origin, value, 0, Math.min(8, value));
    return value;
  }

  private emit(origin: Point, value: number, age: number, desired: number): void {
    const count = Math.min(desired, theftConfig.debrisCapacity - this.chunks.length);
    if (!count) {
      this.pending.push({ origin, value, age });
      return;
    }
    const each = Math.floor(value / count);
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count + origin.x * 0.01;
      const destination = clampToArena({
        x: origin.x + 145 * Math.cos(angle), y: origin.y + 145 * Math.sin(angle),
      }, 5);
      this.chunks.push({ ...origin, origin, destination, age, value: each + Number(i < value % count) });
    }
  }

  step(participants: readonly Participant[], seconds: number): void {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const chunk = this.chunks[i];
      chunk.age += seconds;
      if (chunk.age >= theftConfig.lifetime) {
        this.expiredMass += chunk.value;
        this.chunks.splice(i, 1);
        continue;
      }
      if (chunk.age - seconds < theftConfig.flight) {
        const t = Math.min(1, chunk.age / theftConfig.flight);
        chunk.x = chunk.origin.x + (chunk.destination.x - chunk.origin.x) * t;
        chunk.y = chunk.origin.y + (chunk.destination.y - chunk.origin.y) * t;
        if (t < 1) continue;
      }
      let winner: Participant | undefined;
      let bestGap = Infinity;
      for (const participant of participants) {
        const distance = Math.hypot(chunk.x - participant.position.x, chunk.y - participant.position.y);
        const contact = participant.radius + 5;
        const margin = Math.max(0, attractionReach(participant.physicalScale) - contact) * pullMultiplier(participant);
        const gap = distance - contact;
        if (gap <= margin && (gap < bestGap || (gap === bestGap && winner && participant.id < winner.id))) {
          bestGap = gap;
          winner = participant;
        }
      }
      if (!winner) continue;
      const travel = 520 * seconds * pullMultiplier(winner);
      if (bestGap <= travel) {
        winner.combat.salvage += chunk.value;
        addMass(winner, chunk.value);
        this.chunks.splice(i, 1);
      } else {
        const fraction = travel / (bestGap + winner.radius + 5);
        chunk.x += (winner.position.x - chunk.x) * fraction;
        chunk.y += (winner.position.y - chunk.y) * fraction;
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const event = this.pending[i];
      event.age += seconds;
      if (event.age >= theftConfig.lifetime) this.expiredMass += event.value;
      else if (this.chunks.length < theftConfig.debrisCapacity) this.emit(event.origin, event.value, event.age, 1);
      else continue;
      this.pending.splice(i, 1);
    }
  }
}

export function pullMultiplier(participant: Participant): number {
  return (1 - participant.combat.heat) * (participant.combat.brittle ? hazardConfig.cold.attraction : 1);
}

export function resolveTheft(participants: readonly Participant[], salvage: Salvage, seconds: number): void {
  const damage = new Map<Participant, { attacker: Participant; value: number }[]>();
  for (const attacker of participants) {
    const attack = attacker.combat.attack;
    if (attack.phase !== 'warning' && attack.phase !== 'cooldown') continue;
    attack.remaining -= seconds;
    if (attack.remaining > 1e-9) continue;
    if (attack.phase === 'cooldown') {
      attacker.combat.attack = { phase: 'idle' };
      continue;
    }
    let hit = false;
    for (const victim of participants) {
      if (victim === attacker || gapBetween(attacker, victim) > theftConfig.reach ||
          angleBetween(attack.bearing, bearingTo(attacker.position, victim.position)) > theftConfig.halfAngle) continue;
      hit = true;
      const value = theftDamage(attacker.mass, victim.mass, shell(victim));
      if (!value) continue;
      const requests = damage.get(victim) ?? [];
      requests.push({ attacker, value });
      damage.set(victim, requests);
    }
    attacker.combat.energy -= hit ? theftConfig.energy : theftConfig.missCost;
    attacker.combat[hit ? 'hits' : 'misses']++;
    attacker.combat.attack = { phase: 'cooldown', remaining: theftConfig.cooldown };
  }
  for (const [victim, requests] of damage) {
    // Stable participant IDs decide which simultaneous hit consumes brittle.
    requests.sort((a, b) => a.attacker.id.localeCompare(b.attacker.id));
    if (victim.combat.brittle) {
      requests[0].value = Math.round(requests[0].value * hazardConfig.cold.damage);
      victim.combat.brittle = false;
    }
    const total = requests.reduce((sum, request) => sum + request.value, 0);
    const actual = salvage.detach(victim, total);
    victim.combat.lostToTheft += actual;
    let cumulative = 0;
    let credited = 0;
    for (const { attacker, value } of requests) {
      cumulative += value;
      const next = Math.floor(cumulative * actual / total);
      attacker.combat.detached += next - credited;
      credited = next;
    }
  }
}
