export const arena = { width: 4800, height: 3200 };
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
  // Provisional population and pull speeds for single-player playtesting.
  activeCount: 600,
  pullMinSpeed: 300,
  pullMaxSpeed: 700,
  massPerPickup: 1,
  radius: 5,
};
export const scrapColors = [0x278982, 0x8055b2, 0x4574b4, 0x54824b];
export const touch = { dragThreshold: 10, radius: 64, deadZone: 10, tapMaxMs: 350 };
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
