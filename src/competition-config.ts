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
  easy: { search: 380, decision: 5.4, density: 0.10, gold: 1, charge: 7, energy: 1,
    evaluate: 0.40, pursuit: 65, chase: 1.55, arming: 0.72, reconsider: 2, safety: 16,
    aimGap: 192, lead: 0, reward: 38, threat: 0.34, salvageTravel: 0.76 },
  normal: { search: 655, decision: 3.4, density: 0.28, gold: 2.6, charge: 10, energy: 1.8,
    evaluate: 0.25, pursuit: 170, chase: 2.4, arming: 0.35, reconsider: 0.9, safety: 50,
    aimGap: 215, lead: 0.09, reward: 24, threat: 0.25, salvageTravel: 0.91 },
  hard: { search: 870, decision: 2.55, density: 0.34, gold: 5.5, charge: 13, energy: 2.4,
    evaluate: 0.18, pursuit: 235, chase: 3.1, arming: 0.20, reconsider: 0.7, safety: 85,
    aimGap: 236, lead: 0.18, reward: 32, threat: 0.19, salvageTravel: 1 },
} as const;

export const botTactics = {
  collector: { pursuit: 0.45, salvage: 0.45, charge: 0, signal: 0.92 },
  hunter: { pursuit: 1.45, salvage: 0.88, charge: 0.62, signal: 0.82 },
  charger: { pursuit: 1.16, salvage: 0.60, charge: 1, signal: 0.90 },
  scavenger: { pursuit: 0.72, salvage: 1.6, charge: 0, signal: 1.28 },
  roamer: { pursuit: 0.60, salvage: 0.45, charge: 0, signal: 0.72 },
  opportunist: { pursuit: 1.08, salvage: 1.15, charge: 0.43, signal: 1.21 },
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
  pursuitExitGap: 150,
} as const;

export const activityConfig = {
  count: 3, radius: 500, spacing: 1780, lifetime: 33, lifetimeJitter: 9, fade: 6, streamWeight: 0.32,
  firstSignal: 23, signalJitter: 5, signalInterval: 38, signalDuration: 24, signalMinimum: 18, depleted: 9,
  signalTravel: 2500, hotspotTravel: 1750, signalFollowers: 7, hotspotFollowers: 4,
} as const;
