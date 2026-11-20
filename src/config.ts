export const arena = { width: 4800, height: 3200 };
export const playerConfig = {
  initialMass: 20,
  radius: 30,
  // Provisional world units per second, pending playtesting.
  speed: 460,
};
export const touch = { dragThreshold: 10, radius: 64, deadZone: 10, tapMaxMs: 350 };
export const viewConfig = {
  followRate: 8,
  rotationRate: 14,
  headingMinSpeed: 4,
  maxZoom: 1.1,
  minZoom: 0.65,
  framingSize: 620,
  maxPixelRatio: 3,
};
