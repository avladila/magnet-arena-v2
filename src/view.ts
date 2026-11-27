import { arena, playerConfig, viewConfig } from './config';
import { theftConfig } from './competition-config';
import { attractionReach, physicalScaleForMass } from './growth';
import { clamp, type Point } from './movement';
import type { WorldBounds } from './particles';

const smoothing = (rate: number, seconds: number) => 1 - Math.exp(-rate * seconds);

export function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export class Heading {
  angle = 0;

  update(target: number, seconds: number): void {
    this.angle += shortestAngle(this.angle, target) * smoothing(viewConfig.rotationRate, seconds);
  }
}

export class MagnetScale {
  scale = 1;
  private lost = 0;
  private from = 1;
  private elapsed = theftConfig.shrinkSeconds as number;

  update(physicalScale: number, seconds: number, lostToTheft = 0): void {
    if (lostToTheft > this.lost && physicalScale < this.scale) {
      this.from = this.scale;
      this.elapsed = 0;
    }
    this.lost = lostToTheft;
    if (this.elapsed < theftConfig.shrinkSeconds && physicalScale < this.from) {
      this.elapsed = Math.min(theftConfig.shrinkSeconds, this.elapsed + seconds);
      const remaining = 1 - this.elapsed / theftConfig.shrinkSeconds;
      this.scale = physicalScale + (this.from - physicalScale) * remaining ** 3;
    } else {
      this.elapsed = theftConfig.shrinkSeconds;
      this.scale += (physicalScale - this.scale) * smoothing(viewConfig.scaleRate, seconds);
    }
  }
}

export function massZoomMultiplier(mass: number): number {
  const { transitionMass, earlyExponent, lateExponent, minimum } = viewConfig.growthZoom;
  const multiplier = mass <= transitionMass
    ? (mass / playerConfig.initialMass) ** earlyExponent
    : (transitionMass / playerConfig.initialMass) ** earlyExponent *
      (mass / transitionMass) ** lateExponent;
  return clamp(multiplier, minimum, 1);
}

export class ArenaCamera {
  private center: Point;
  private width = 1;
  private height = 1;
  private baseline = 1;
  private coverageFloor = 0;
  private mass = playerConfig.initialMass;
  zoom = 1;

  constructor(position: Point) {
    this.center = { ...position };
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.coverageFloor = Math.max(width / arena.width, height / arena.height);
    this.baseline = clamp(Math.min(width, height) / viewConfig.framingSize, viewConfig.minZoom, viewConfig.maxZoom);
    this.zoom = this.targetZoom();
    this.constrain();
  }

  follow(position: Point, seconds: number, mass = this.mass): void {
    this.mass = mass;
    const factor = smoothing(viewConfig.followRate, seconds);
    this.zoom += (this.targetZoom() - this.zoom) * smoothing(viewConfig.zoomRate, seconds);
    this.center.x += (position.x - this.center.x) * factor;
    this.center.y += (position.y - this.center.y) * factor;
    this.constrain();
  }

  get midpoint(): Point {
    return { ...this.center };
  }

  get bounds(): WorldBounds {
    const topLeft = this.toWorld({ x: 0, y: 0 });
    const bottomRight = this.toWorld({ x: this.width, y: this.height });
    return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
  }

  toScreen(point: Point): Point {
    return {
      x: (point.x - this.center.x) * this.zoom + this.width / 2,
      y: (point.y - this.center.y) * this.zoom + this.height / 2,
    };
  }

  toWorld(point: Point): Point {
    return {
      x: this.center.x + (point.x - this.width / 2) / this.zoom,
      y: this.center.y + (point.y - this.height / 2) / this.zoom,
    };
  }

  private targetZoom(): number {
    const massZoom = this.baseline * massZoomMultiplier(this.mass);
    const reach = attractionReach(physicalScaleForMass(this.mass));
    const fieldZoom = Math.min(this.width, this.height) * viewConfig.growthZoom.fieldDiameterFraction / (2 * reach);
    return Math.max(this.coverageFloor, Math.min(massZoom, fieldZoom));
  }

  private constrain(): void {
    const halfWidth = this.width / (2 * this.zoom);
    const halfHeight = this.height / (2 * this.zoom);
    this.center.x = clamp(this.center.x, halfWidth, arena.width - halfWidth);
    this.center.y = clamp(this.center.y, halfHeight, arena.height - halfHeight);
  }
}
