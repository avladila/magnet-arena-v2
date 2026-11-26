import { hazardConfig } from './competition-config';
import type { Participant, Point } from './movement';

export type Attack =
  { phase: 'idle' | 'armed' } |
  { phase: 'warning'; remaining: number; bearing: number } |
  { phase: 'cooldown'; remaining: number };

export type TheftImpact = {
  origin: Point; radius: number; mass: number; bearing: number; brittle: boolean; removed: number; reduction: number;
};

export function pullMultiplier(participant: Participant): number {
  return (1 - participant.combat.heat) * (participant.combat.brittle ? hazardConfig.cold.attraction : 1);
}

export function combatState() {
  return {
    energy: 0, highest: 20, attack: { phase: 'idle' } as Attack,
    heat: 0, cold: 0, brittle: false, coldTriggered: false, coldRecovery: 0,
    corrosion: undefined as 'water' | 'acid' | undefined, corrosionIn: 0,
    ordinary: 0, gold: 0, cells: 0, salvage: 0, hits: 0, misses: 0, guarded: 0, protectedHits: 0, brittleHits: 0,
    detached: 0, lostToTheft: 0, lostToHazards: 0, resourceMass: 0,
    guardFor: 0, impact: undefined as TheftImpact | undefined,
    largestTheft: 0, largestReduction: 0, ownSalvage: 0, reclaimedSalvage: 0,
  };
}
