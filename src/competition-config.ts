export const matchConfig = { duration: 300, countdown: 3, step: 1 / 60 } as const;
export const theftConfig = {
  reach: 260, halfAngle: Math.PI / 3, warning: 0.18, cooldown: 0.8,
  energy: 100, missCost: 35, debrisCapacity: 1024, legacyDebrisCapacity: 512, flight: 0.55, lifetime: 10,
  combatCoreCap: 250, guard: 1.5, victimSalvageLock: 5, shrinkSeconds: 0.28,
  sizeLoss: [[1, 0.08], [2, 0.12], [4, 0.25], [8, 0.40], [12, 0.50]],
} as const;

export const hazardConfig = {
  flux: { count: 32, radius: 28, threshold: 120, fraction: 0.18, personalDelay: 2, discharge: 0.65 },
  heat: { count: 12, radius: 180, build: 0.25, decay: 0.35 },
  water: { count: 10, radius: 150, delay: 0.75, fraction: 0.015 },
  acid: { count: 6, radius: 115, delay: 0.5, fraction: 0.04 },
  cold: { count: 12, radius: 150, delay: 1.2, recovery: 2.5, attraction: 0.8, damage: 1.25 },
} as const;


export const tacticsConfig = {
  easy: { search: 440, decision: 4.0, pursuit: 100, arming: 0.65, reconsider: 1.6, safety: 0 },
  normal: { search: 610, decision: 3.65, pursuit: 140, arming: 0.35, reconsider: 0.8, safety: 50 },
  hard: { search: 720, decision: 2.15, pursuit: 120, arming: 0.17, reconsider: 0.4, safety: 95 },
} as const;

export const botTactics = {
  collector: { pursuit: 0.65, salvage: 0.4 },
  hunter: { pursuit: 1.45, salvage: 0.85 },
  charger: { pursuit: 1.15, salvage: 0.55 },
  scavenger: { pursuit: 0.85, salvage: 1.6 },
  roamer: { pursuit: 0.8, salvage: 0.45 },
  opportunist: { pursuit: 1, salvage: 1.15 },
} as const;

export const navigationConfig = {
  lookAheadSeconds: 0.7,
  clearance: 12,
  exitClearance: 60,
  commitmentSeconds: 0.8,
  evaluationSeconds: 0.25,
  waypointArrival: 22,
  turnRate: 240 * Math.PI / 180,
  turnLookAheadSeconds: 0.32,
  hazardTurningSpeedScale: 0.55,
  emergencyTurnRate: 360 * Math.PI / 180,
  stuckSeconds: 1,
  stuckProgress: 0.2,
  targetAdvantage: 1.2,
  pursuitEnterGap: 190,
  pursuitExitGap: 150,
} as const;
