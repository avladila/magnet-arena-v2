export const arena = { width: 15360, height: 10000 };
export const playerConfig = {
  initialMass: 20,
  radius: 30,
  // Provisional world units per second, pending playtesting.
  speed: 460,
};
export const growthConfig = {
  scaleFactor: 0.32,
  maxScale: 4,
  baseReach: 118,
  maxReach: 230,
};
export const scrapConfig = {
  capacity: 1500,
  activeCount: 720,
  colorCount: 10 as const,
  // Provisional pull speeds for playtesting.
  pullMinSpeed: 300,
  pullMaxSpeed: 700,
  massPerPickup: 1,
  radius: 5,
};
export const regionConfig = {
  size: 960,
  sitesPerUnitArea: 720 / (4800 * 3200),
  planSeconds: 0.2,
  reserveSites: 160,
  cacheLimit: 80,
  cacheSeconds: 30,
  prefetchOffset: 620,
  retentionMargin: 160,
  visibilityMargin: 32,
};
export const botConfig = {
  // Provisional AI tuning. All magnets use the shared movement speed.
  spawnJitter: 100,
  collector: {
    decisionSeconds: 2.3,
    minCommitmentSeconds: 1.5,
    searchRadius: 720,
    cellSize: 240,
    densityWeight: 0.28,
    distanceBias: 300,
    turnPenalty: 0.4,
    wallMargin: 60,
    arrivalRadiusRatio: 0.4,
  },
  roamer: {
    waypointMinDistance: 600,
    waypointMaxDistance: 1500,
    wallInset: 100,
    arrivalRadius: 12,
    reconsiderMinSeconds: 2.6,
    reconsiderMaxSeconds: 4.2,
  },
};
export const touch = { dragThreshold: 10, radius: 64, deadZone: 10, tapMaxMs: 350 };
export const arenaArt = {
  gridSpacing: 80,
  referenceSpacing: 480,
  referenceSize: 64,
  cacheSpacing: 240,
};
export const growthFeedback = {
  milestones: [50, 100, 200, 400],
  haloRate: 10,
  pulseSeconds: 0.34,
};
export const viewConfig = {
  followRate: 8,
  rotationRate: 14,
  headingMinSpeed: 4,
  maxZoom: 1.1,
  minZoom: 0.65,
  framingSize: 620,
  maxPixelRatio: 3,
  // Provisional presentation timing.
  scaleRate: 12,
  zoomRate: 4,
  collectionEffectSeconds: 0.22,
  maxCollectionEffects: 20,
  growthZoom: {
    transitionMass: 120,
    earlyExponent: -0.075,
    lateExponent: -0.17,
    minimum: 0.58,
  },
};
