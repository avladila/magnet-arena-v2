import type { Point } from './movement';

export type EyeAperture = readonly [x: number, y: number, radiusX: number, radiusY: number, pupilX: number, pupilY: number];

/** Fit the entire pupil along one ray, in the space shared by the eye and its lid. */
export function pupilInEye([x, y, rx, ry, px, py]: EyeAperture, gaze: Point, size = 1) {
  const pupilX = px * size;
  const pupilY = py * size;
  const length = Math.hypot(gaze.x, gaze.y);
  const inset = Math.max(0, 1 - Math.max((pupilX + .43) / rx, (pupilY + .43) / ry));
  const along = length > 0 ? inset * Math.min(length, 1) / Math.hypot(gaze.x / rx, gaze.y / ry) : 0;
  return { x: x + along * gaze.x, y: y + along * gaze.y, pupilX, pupilY };
}

/** Filter attention in world space so continuing to watch a target survives body rotation. */
export class EyeTracking {
  private x = 0;
  private y = 0;
  private initialized = false;

  reset(): void { this.initialized = false; }

  update(origin: Point, motion: Point, heading: number, target: Point | undefined,
      seconds: number, scaleX = 1, scaleY = 1): Point {
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    let x = .28 * c;
    let y = .28 * s;
    const dx = target ? target.x - origin.x : motion.x;
    const dy = target ? target.y - origin.y : motion.y;
    const length = Math.hypot(dx, dy);
    if (length > (target ? .01 : 18)) {
      const strength = target ? .96 : .70;
      x = strength * dx / length;
      y = strength * dy / length;
    }
    const blend = this.initialized ? -Math.expm1(-16 * seconds) : 1;
    this.x += (x - this.x) * blend;
    this.y += (y - this.y) * blend;
    this.initialized = true;
    const localX = (this.x * c + this.y * s) / scaleX;
    const localY = (-this.x * s + this.y * c) / scaleY;
    const adjusted = Math.hypot(localX, localY);
    const strength = adjusted > 0 ? Math.hypot(this.x, this.y) / adjusted : 0;
    return { x: localX * strength, y: localY * strength };
  }
}
