import { growthConfig, playerConfig } from './config';
import { clampToArena, type Participant } from './movement';

const { baseReach, normalReachCap, reachTransitionScale } = growthConfig;
const reachAtTransition = Math.min(normalReachCap, baseReach * Math.sqrt(reachTransitionScale));
const fieldMarginAtTransition = reachAtTransition - playerConfig.radius * reachTransitionScale;

export function physicalScaleForMass(mass: number): number {
  return Math.min(
    growthConfig.maxScale,
    1 + growthConfig.scaleFactor * (Math.sqrt(mass / playerConfig.initialMass) - 1),
  );
}

export function massForPhysicalScale(scale: number): number {
  return Math.round(playerConfig.initialMass * (1 + (scale - 1) / growthConfig.scaleFactor) ** 2);
}

export function attractionReach(physicalScale: number): number {
  const scale = Math.min(physicalScale, growthConfig.maxScale);
  if (scale <= reachTransitionScale) return Math.min(normalReachCap, baseReach * Math.sqrt(scale));
  return playerConfig.radius * scale + fieldMarginAtTransition * Math.sqrt(scale / reachTransitionScale);
}

export function addMass(participant: Participant, mass: number): void {
  participant.mass += mass;
  const combat = participant.combat;
  combat.highest = Math.max(combat.highest, participant.mass);
  const impact = combat.impact;
  if (mass > 0 && impact) {
    const restored = impact.removed - Math.max(0, impact.mass - participant.mass);
    combat.bestRecovery = Math.max(combat.bestRecovery, restored);
  }
  participant.physicalScale = physicalScaleForMass(participant.mass);
  participant.radius = playerConfig.radius * participant.physicalScale;
  // Growth at a wall moves the center into bounds without changing steering velocity.
  participant.position = clampToArena(participant.position, participant.radius);
}
