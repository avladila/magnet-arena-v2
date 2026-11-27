import type Phaser from 'phaser';
import type { TheftImpact } from './combat-state';
import type { Point } from './movement';
import type { WorldBounds } from './particles';
import type { Quality } from './progress';

const light = { grade: 'light', seconds: 0.14, plates: 0, spokes: 0, width: 2.1 } as const;
const medium = { grade: 'medium', seconds: 0.22, plates: 3, spokes: 1, width: 3.1 } as const;
const heavy = { grade: 'heavy', seconds: 0.31, plates: 8, spokes: 2, width: 4.6 } as const;
const fracture = { grade: 'fracture', seconds: 0.39, plates: 14, spokes: 3, width: 5.5 } as const;

export function impactStyle(reduction: number) {
  if (reduction >= 0.40) return fracture;
  if (reduction >= 0.25) return heavy;
  return reduction >= 0.10 ? medium : light;
}

type Plate = {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  roll: number;
  size: number;
  age: number;
  life: number;
};

const limit = 72;
const plateFrame = ['fracture-shard-0', 'fracture-shard-1', 'fracture-shard-2'];

/** Detached illustrated plating is separate from real salvage. */
export class FracturePlates {
  private readonly pool: Plate[] = [];
  private next = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  reset(): void {
    this.next = 0;
    for (const plate of this.pool) {
      plate.life = 0;
      plate.sprite.setVisible(false);
    }
  }

  emit(impact: TheftImpact, quality: Quality): void {
    const count = Math.min(impactStyle(impact.reduction).plates,
      quality === 'low' ? 3 : quality === 'balanced' ? 10 : 14);
    this.spray(impact.origin, impact.radius, impact.bearing, 2.2, count, 1);
  }

  explode(origin: Point, radius: number, bearing: number, quality: Quality, center: boolean): void {
    const count = quality === 'low' ? 3 : quality === 'balanced' ? 7 : 10;
    this.spray(origin, radius, bearing, 2 * Math.PI, center ? count * 3 : count, center ? 1.72 : 1.22);
  }

  private spray(origin: Point, radius: number, bearing: number, arc: number, count: number, scale: number): void {
    for (let i = 0; i < count; i++) {
      const frame = plateFrame[i % plateFrame.length];
      const plate = this.pool[this.next] ??= {
        sprite: this.scene.add.image(0, 0, 'workshop', frame).setDepth(3.1).setVisible(false),
        x: 0, y: 0, vx: 0, vy: 0, roll: 0, size: 0, age: 0, life: 0,
      };
      this.next = (this.next + 1) % limit;
      const angle = bearing + ((i + 0.5) / count - 0.5) * arc;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const velocity = (96 + (i * 37 % 147) + radius * 0.31) * scale;
      plate.x = origin.x + c * radius * 0.70;
      plate.y = origin.y + s * radius * 0.70;
      plate.vx = c * velocity;
      plate.vy = s * velocity;
      plate.size = 13 + (i * 9 % 20) + radius * 0.086;
      plate.roll = (i % 2 ? 1 : -1) * (2.1 + i * 0.14);
      plate.age = 0;
      plate.life = (0.36 + (i % 4) * 0.055) * scale;
      plate.sprite.setFrame(frame);
    }
  }

  render(bounds: WorldBounds, seconds: number, zoom: number, reducedMotion: boolean): void {
    if (reducedMotion) {
      if (this.next !== 0 || this.pool.some((plate) => plate.life > 0)) this.reset();
      return;
    }
    for (const plate of this.pool) {
      if (plate.life <= 0) continue;
      plate.age += seconds;
      if (plate.age >= plate.life) {
        plate.sprite.setVisible(false);
        plate.life = 0;
        continue;
      }
      const t = plate.age / plate.life;
      const x = plate.x + plate.vx * plate.age;
      const y = plate.y + plate.vy * plate.age - 31 * Math.sin(Math.PI * t);
      const size = Math.min(22 / zoom, plate.size) * (1 - 0.56 * t);
      const visible = x + size >= bounds.left && x - size <= bounds.right &&
        y + size >= bounds.top && y - size <= bounds.bottom;
      plate.sprite.setVisible(visible);
      if (visible) plate.sprite.setPosition(x, y).setDisplaySize(size, size * 0.82)
        .setRotation(plate.roll * t).setAlpha(0.78 * (1 - t));
    }
  }
}
