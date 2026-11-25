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

export function attractionReach(physicalScale: number): number {
  const scale = Math.min(physicalScale, growthConfig.maxScale);
  if (scale <= reachTransitionScale) return Math.min(normalReachCap, baseReach * Math.sqrt(scale));
  return playerConfig.radius * scale + fieldMarginAtTransition * Math.sqrt(scale / reachTransitionScale);
}

export function addMass(participant: Participant, mass: number): void {
  participant.mass += mass;
  participant.combat.highest = Math.max(participant.combat.highest, participant.mass);
  participant.physicalScale = physicalScaleForMass(participant.mass);
  participant.radius = playerConfig.radius * participant.physicalScale;
  // Growth at a wall moves the center into bounds without changing steering velocity.
  participant.position = clampToArena(participant.position, participant.radius);
}
