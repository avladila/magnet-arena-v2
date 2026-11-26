import type Phaser from 'phaser';
import { brand } from './brand';
import type { Point } from './movement';
import type { WorldBounds } from './particles';
import type { Quality } from './progress';

type Role = 'steel' | 'gold' | 'energy' | 'teal' | 'heat' | 'cold' | 'flux' | 'acid' | 'water';
type Fleck = {
  image: Phaser.GameObjects.Image;
  x: number;
  y: number;
  age: number;
  lifetime: number;
  vx: number;
  vy: number;
  trail: boolean;
};

const frames: Record<Role, string> = {
  steel: 'fleck-steel', gold: 'fleck-gold', energy: 'fleck-energy', teal: 'fleck-teal', heat: 'fleck-heat',
  cold: 'fleck-cold', flux: 'fleck-flux', acid: 'fleck-acid', water: 'fleck-water',
};

export class WorkshopParticles {
  private readonly pool: Fleck[];
  private next = 0;
  private limit = brand.quality.balanced;
  private quality: Quality = 'balanced';
  private enabled = true;
  private ambient = 0;
  peakVisible = 0;

  constructor(scene: Phaser.Scene) {
    this.pool = Array.from({ length: brand.quality.high }, () => ({
      image: scene.add.image(0, 0, 'workshop', frames.steel).setDepth(3).setVisible(false),
      x: 0, y: 0, age: 0, lifetime: 0, vx: 0, vy: 0, trail: false,
    }));
  }

  reset(): void {
    this.next = 0;
    this.ambient = 0;
    this.peakVisible = 0;
    for (const effect of this.pool) {
      effect.lifetime = 0;
      effect.image.setVisible(false);
    }
  }

  configure(quality: Quality, reducedMotion: boolean): void {
    const next = brand.quality[quality];
    if (next < this.limit || (reducedMotion && this.enabled)) this.reset();
    this.limit = next;
    this.quality = quality;
    this.enabled = !reducedMotion;
  }

  burst(point: Point, role: Role, rays: number, milliseconds: number, heading = 0, fan = Math.PI * 2): void {
    if (!this.enabled || (this.quality === 'low' && role === 'steel')) return;
    const count = this.quality === 'low' ? 2 : this.quality === 'balanced' ? Math.min(12, rays) : rays;
    for (let i = 0; i < count; i++) {
      const f = this.pool[this.next];
      this.next = (this.next + 1) % this.limit;
      const angle = heading + (fan === Math.PI * 2 ? i * fan / count : fan * (i / (count - 1) - 0.5));
      f.x = point.x;
      f.y = point.y;
      f.vx = Math.cos(angle) * brand.vfx.speed;
      f.vy = Math.sin(angle) * brand.vfx.speed;
      f.age = 0;
      f.lifetime = milliseconds / 1000;
      f.trail = false;
      f.image.setFrame(frames[role]).setRotation(0);
    }
  }

  trail(x: number, y: number, angle: number, role: Role): void {
    if (!this.enabled || this.quality !== 'high') return;
    const f = this.pool[this.next];
    this.next = (this.next + 1) % this.limit;
    f.x = x;
    f.y = y;
    f.vx = -Math.cos(angle) * brand.vfx.speed;
    f.vy = -Math.sin(angle) * brand.vfx.speed;
    f.age = 0;
    f.lifetime = brand.motion.pickup / 1000;
    f.trail = true;
    f.image.setFrame(frames[role]).setRotation(angle);
  }

  render(bounds: WorldBounds, seconds: number, center: Point): void {
    if (!this.enabled) return;
    this.ambient += seconds;
    if (this.quality !== 'low' && this.ambient >= brand.vfx.ambientPeriod / 1000) {
      this.ambient = 0;
      this.burst(center, 'teal', 2, brand.vfx.ambientLifetime);
    }
    let visible = 0;
    for (let i = 0; i < this.limit; i++) {
      const f = this.pool[i];
      if (f.lifetime === 0) continue;
      f.age += seconds;
      const progress = f.age / f.lifetime;
      if (progress >= 1) {
        f.lifetime = 0;
        f.image.setVisible(false);
        continue;
      }
      const distance = f.lifetime * (1 - (1 - progress) ** 2);
      const x = f.x + f.vx * distance;
      const y = f.y + f.vy * distance;
      const onScreen = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
      f.image.setVisible(onScreen);
      if (!onScreen) continue;
      visible++;
      const size = brand.vfx.size * (1 - progress * 0.55);
      f.image.setPosition(x, y).setDisplaySize(f.trail ? size * 1.65 : size, f.trail ? size * 0.35 : size)
        .setAlpha((f.trail ? 0.55 : 0.8) * (1 - progress));
    }
    this.peakVisible = Math.max(this.peakVisible, visible);
  }
}
