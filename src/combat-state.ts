export type Attack =
  { phase: 'idle' | 'armed' } |
  { phase: 'warning'; remaining: number; bearing: number } |
  { phase: 'cooldown'; remaining: number };

export function combatState() {
  return {
    energy: 0, highest: 20, attack: { phase: 'idle' } as Attack,
    heat: 0, cold: 0, brittle: false, coldTriggered: false, coldRecovery: 0,
    corrosion: undefined as 'water' | 'acid' | undefined, corrosionIn: 0,
    ordinary: 0, gold: 0, cells: 0, salvage: 0, hits: 0, misses: 0,
    detached: 0, lostToTheft: 0, lostToHazards: 0, resourceMass: 0,
  };
}
