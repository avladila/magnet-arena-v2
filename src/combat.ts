import { hazardConfig, theftConfig } from './competition-config';
import { growthConfig, playerConfig } from './config';
import { massForPhysicalScale, physicalScaleForMass } from './growth';
import { clamp, type Participant, type Point } from './movement';
import { Salvage, shell } from './salvage';

export { pullMultiplier } from './combat-state';
export { Salvage, salvageEligible, shell, type Debris } from './salvage';

export type CombatRules = 'impact' | 'legacy';

export function combatShell(victim: Participant): number {
  const core = clamp(Math.floor(victim.combat.highest / 4), playerConfig.initialMass, theftConfig.combatCoreCap);
  return Math.max(0, victim.mass - core);
}

export function physicalReduction(attackerScale: number, defenderScale: number): number {
  const scale = clamp(defenderScale, 1, growthConfig.maxScale);
  let base = theftConfig.sizeLoss[0][1] as number;
  for (let i = 1; i < theftConfig.sizeLoss.length; i++) {
    const [high, upper] = theftConfig.sizeLoss[i];
    if (scale > high) continue;
    const [low, lower] = theftConfig.sizeLoss[i - 1];
    base = lower + (upper - lower) * (scale - low) / (high - low);
    break;
  }
  const bonus = clamp(0.025 * Math.log2(scale / clamp(attackerScale, 1, growthConfig.maxScale)), 0, 0.05);
  return Math.min(0.5, base + bonus);
}

export function theftDamage(attacker: Participant, defender: Participant): number {
  const scale = defender.physicalScale;
  const target = Math.max(1, scale * (1 - physicalReduction(attacker.physicalScale, scale)));
  return clamp(defender.mass - massForPhysicalScale(target), 0, combatShell(defender));
}

export function legacyTheftDamage(attacker: number, defender: number, available: number): number {
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

type Request = { attacker: Participant; value: number; bearing: number };

export function resolveTheft(participants: readonly Participant[], salvage: Salvage, seconds: number,
    rules: CombatRules = 'impact'): void {
  const legacy = rules === 'legacy';
  for (const participant of participants) {
    if (participant.combat.guardFor > 0) participant.combat.guardFor = Math.max(0, participant.combat.guardFor - seconds);
  }
  let damage: Map<Participant, Request[]> | undefined;
  for (const attacker of participants) {
    const state = attacker.combat;
    const attack = state.attack;
    if (attack.phase !== 'warning' && attack.phase !== 'cooldown') continue;
    attack.remaining -= seconds;
    if (attack.remaining > 1e-9) continue;
    if (attack.phase === 'cooldown') {
      state.attack = { phase: 'idle' };
      continue;
    }
    let guarded = false;
    let contact = false;
    let damaging = false;
    for (const victim of participants) {
      if (victim === attacker || gapBetween(attacker, victim) > theftConfig.reach ||
          angleBetween(attack.bearing, bearingTo(attacker.position, victim.position)) > theftConfig.halfAngle) continue;
      if (!legacy && victim.combat.guardFor > 1e-9) {
        guarded = true;
        continue;
      }
      contact = true;
      const value = legacy ? legacyTheftDamage(attacker.mass, victim.mass, shell(victim)) : theftDamage(attacker, victim);
      if (!value) continue;
      damaging = true;
      damage ??= new Map();
      let requests = damage.get(victim);
      if (!requests) damage.set(victim, requests = []);
      const bearing = attacker.position.x === victim.position.x && attacker.position.y === victim.position.y
        ? attack.bearing + Math.PI : bearingTo(victim.position, attacker.position);
      requests.push({ attacker, value, bearing });
    }
    state.energy = Math.max(0, state.energy - (contact ? theftConfig.energy : theftConfig.missCost));
    if (damaging || (legacy && contact)) state.hits++;
    else if (contact) state.protectedHits++;
    else if (guarded) state.guarded++;
    else state.misses++;
    state.attack = { phase: 'cooldown', remaining: theftConfig.cooldown };
  }
  if (!damage) return;
  // Resolve in stable victim order in the impact rules. All requests used pre-hit geometry.
  const victims = legacy ? damage : [...damage].sort(([a], [b]) => a.id.localeCompare(b.id));
  for (const [victim, requests] of victims) detachDamage(victim, requests, salvage, legacy);
}

function detachDamage(victim: Participant, requests: Request[], salvage: Salvage, legacy: boolean): void {
  requests.sort((a, b) => a.attacker.id.localeCompare(b.attacker.id));
  let strongest = requests[0];
  if (!legacy) for (const request of requests) if (request.value > strongest.value) strongest = request;
  const brittle = victim.combat.brittle;
  if (brittle) {
    strongest.value = Math.round(strongest.value * hazardConfig.cold.damage);
    victim.combat.brittle = false;
  }
  const total = requests.reduce((sum, request) => sum + request.value, 0);
  const limit = legacy ? shell(victim) : combatShell(victim);
  const actual = Math.min(limit, legacy ? total : strongest.value);
  const originalScale = victim.physicalScale;
  const reduction = 1 - physicalScaleForMass(victim.mass - actual) / originalScale;
  const credits: { id: string; value: number }[] = [];
  let cumulative = 0;
  let credited = 0;
  let x = 0;
  let y = 0;
  for (const { attacker, value, bearing } of requests) {
    cumulative += value;
    const next = Math.floor(cumulative * actual / total);
    const share = next - credited;
    credited = next;
    if (!share) continue;
    credits.push({ id: attacker.id, value: share });
    const state = attacker.combat;
    state.detached += share;
    state.largestTheft = Math.max(state.largestTheft, share);
    state.largestReduction = Math.max(state.largestReduction, reduction);
    if (brittle) state.brittleHits++;
    x += Math.cos(bearing) * share;
    y += Math.sin(bearing) * share;
  }
  const bearing = Math.hypot(x, y) > 1e-9 ? Math.atan2(y, x) : strongest.bearing;
  const impact = { origin: victim.position, radius: victim.radius, mass: victim.mass, bearing, brittle, removed: actual, reduction };
  victim.combat.lostToTheft += legacy ? salvage.detach(victim, actual, limit)
    : salvage.detachTheft(victim, actual, limit, impact, credits);
  if (actual > 0) {
    victim.combat.impact = impact;
    if (!legacy) victim.combat.guardFor = theftConfig.guard;
  }
}
