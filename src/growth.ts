import { growthConfig, playerConfig } from './config';
import { clampToArena, type Player } from './movement';

export function physicalScaleForMass(mass: number): number {
  return Math.min(
    growthConfig.maxScale,
    1 + growthConfig.scaleFactor * (Math.sqrt(mass / playerConfig.initialMass) - 1),
  );
}

export function attractionReach(physicalScale: number): number {
  return Math.min(growthConfig.maxReach, growthConfig.baseReach * Math.sqrt(physicalScale));
}

export function addMass(player: Player, mass: number): void {
  player.mass += mass;
  player.physicalScale = physicalScaleForMass(player.mass);
  player.radius = playerConfig.radius * player.physicalScale;
  // Growth at a wall moves the center into bounds without changing steering velocity.
  player.position = clampToArena(player.position, player.radius);
}
