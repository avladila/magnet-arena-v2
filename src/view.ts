import { arena, viewConfig } from './config';
import { clamp, type Point } from './movement';

const smoothing = (rate: number, seconds: number) => 1 - Math.exp(-rate * seconds);

export function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export class Heading {
  angle = 0;
  private target = 0;

  update(velocity: Point, seconds: number): void {
    if (Math.hypot(velocity.x, velocity.y) >= viewConfig.headingMinSpeed) {
      this.target = Math.atan2(velocity.y, velocity.x);
    }
    this.angle += shortestAngle(this.angle, this.target) * smoothing(viewConfig.rotationRate, seconds);
  }
}

export class ArenaCamera {
  private center: Point;
  private width = 1;
  private height = 1;
  zoom = 1;

  constructor(position: Point) {
    this.center = { ...position };
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.zoom = Math.max(
      width / arena.width,
      height / arena.height,
      clamp(Math.min(width, height) / viewConfig.framingSize, viewConfig.minZoom, viewConfig.maxZoom),
    );
    this.constrain();
  }

  follow(position: Point, seconds: number): void {
    const factor = smoothing(viewConfig.followRate, seconds);
    this.center.x += (position.x - this.center.x) * factor;
    this.center.y += (position.y - this.center.y) * factor;
    this.constrain();
  }

  get midpoint(): Point {
    return { ...this.center };
  }

  toWorld(point: Point): Point {
    return {
      x: this.center.x + (point.x - this.width / 2) / this.zoom,
      y: this.center.y + (point.y - this.height / 2) / this.zoom,
    };
  }

  private constrain(): void {
    const halfWidth = this.width / (2 * this.zoom);
    const halfHeight = this.height / (2 * this.zoom);
    this.center.x = clamp(this.center.x, halfWidth, arena.width - halfWidth);
    this.center.y = clamp(this.center.y, halfHeight, arena.height - halfHeight);
  }
}
