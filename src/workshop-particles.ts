import type Phaser from 'phaser';
import { brand } from './brand';
import type { Participant, Point } from './movement';
import type { Collection, WorldBounds } from './particles';
import type { Quality } from './progress';
import { playerConfig } from './config';

type Role = 'steel' | 'gold' | 'energy' | 'teal' | 'heat' | 'cold' | 'flux' | 'acid' | 'water';
type Motion = 'spark' | 'trail' | 'glint' | 'streak';
type Travel = { x: number; y: number; wait: number; inView: boolean };
type Fleck = {
  image: Phaser.GameObjects.Image;
  x: number;
  y: number;
  age: number;
  lifetime: number;
  vx: number;
  vy: number;
  motion: Motion;
  target?: Participant;
};

const frames: Record<Role, string> = {
  steel: 'fleck-steel', gold: 'fleck-gold', energy: 'fleck-energy', teal: 'fleck-teal', heat: 'fleck-heat',
  cold: 'fleck-cold', flux: 'fleck-flux', acid: 'fleck-acid', water: 'fleck-water',
};
const scrapFrames = brand.pickups.palette.map((_, index) => 'fleck-scrap-' + index);

export class WorkshopParticles {
  private readonly pool: Fleck[];
  private next = 0;
  private limit = brand.quality.balanced;
  private quality: Quality = 'balanced';
  private enabled = true;
  private ambient = 0;
  private routes = new WeakMap<Participant, Travel>();
  peakVisible = 0;

  constructor(scene: Phaser.Scene) {
    this.pool = Array.from({ length: brand.quality.high }, () => ({
      image: scene.add.image(0, 0, 'workshop', frames.steel).setDepth(3).setVisible(false),
      x: 0, y: 0, age: 0, lifetime: 0, vx: 0, vy: 0, motion: 'spark',
    }));
  }

  reset(): void {
    this.next = 0;
    this.ambient = 0;
    this.routes = new WeakMap();
    this.peakVisible = 0;
    for (const effect of this.pool) {
      effect.lifetime = 0;
      effect.target = undefined;
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

  private emit(frame: string, x: number, y: number, milliseconds: number, motion: Motion): Fleck {
    const f = this.pool[this.next];
    this.next = (this.next + 1) % this.limit;
    f.x = x;
    f.y = y;
    f.vx = 0;
    f.vy = 0;
    f.age = 0;
    f.lifetime = milliseconds / 1000;
    f.motion = motion;
    f.target = undefined;
    f.image.setFrame(frame).setRotation(0);
    return f;
  }

  private scatter(point: Point, frame: string, count: number, milliseconds: number, heading = 0, fan = Math.PI * 2): void {
    for (let i = 0; i < count; i++) {
      const angle = heading + (fan === Math.PI * 2 || count === 1 ? i * fan / count : fan * (i / (count - 1) - 0.5));
      const f = this.emit(frame, point.x, point.y, milliseconds, 'spark');
      f.vx = Math.cos(angle) * brand.vfx.speed;
      f.vy = Math.sin(angle) * brand.vfx.speed;
      f.image.setRotation(angle);
    }
  }

  burst(point: Point, role: Role, rays: number, milliseconds: number, heading = 0, fan = Math.PI * 2): void {
    if (!this.enabled || (this.quality === 'low' && role === 'steel')) return;
    const count = this.quality === 'low' ? Math.min(2, rays) : this.quality === 'balanced' ? Math.min(12, rays) : rays;
    this.scatter(point, frames[role], count, milliseconds, heading, fan);
  }

  collect(item: Collection, magnet: Participant, reinforced = false): void {
    if (!this.enabled) return;
    if (item.kind === 'energy') {
      const f = this.emit(frames.energy, item.x, item.y, brand.motion.energy, 'streak');
      f.target = magnet;
      this.burst(item, 'energy', this.quality === 'high' ? 4 : 2, brand.motion.energy);
    } else if (item.kind === 'gold') {
      this.glint(item, 'gold');
      this.burst(item, 'gold', 6, brand.motion.gold);
    } else {
      const frame = scrapFrames[item.colorIndex];
      this.emit(frame, item.x, item.y, brand.motion.pickup, 'glint');
      if (reinforced) this.burst(item, 'gold', 3, brand.motion.pickup);
      else if (this.quality !== 'low') this.scatter(item, frame, 2, brand.motion.pickup);
    }
  }

  glint(point: Point, role: 'energy' | 'gold'): void {
    if (this.enabled) this.emit(frames[role], point.x, point.y, brand.motion.gold, 'glint');
  }

  trail(x: number, y: number, angle: number, material: number | 'gold' | 'energy'): void {
    if (!this.enabled || this.quality === 'low') return;
    const frame = typeof material === 'number' ? scrapFrames[material] : frames[material];
    const f = this.emit(frame, x, y, material === 'energy' ? 190 : brand.motion.pickup, 'trail');
    const speed = brand.vfx.speed * (material === 'energy' ? 1.45 : 1);
    f.vx = -Math.cos(angle) * speed;
    f.vy = -Math.sin(angle) * speed;
    f.image.setRotation(angle);
  }

  travel(magnet: Participant, bounds: WorldBounds, seconds: number, tactical: boolean): void {
    if (!this.enabled || this.quality === 'low' || seconds <= 0) return;
    if (magnet.kind === 'bot' && !tactical && this.quality !== 'high') return;
    const { x, y } = magnet.position;
    const inView = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    let sample = this.routes.get(magnet);
    if (!sample) {
      sample = { x, y, wait: 0, inView };
      this.routes.set(magnet, sample);
      return;
    }
    const dx = x - sample.x;
    const dy = y - sample.y;
    const distance = Math.hypot(dx, dy);
    sample.wait -= seconds;
    if (inView && sample.inView && sample.wait <= 0 && distance >= seconds * 188 && distance <= seconds * playerConfig.speed + 0.15) {
      const angle = Math.atan2(dy, dx);
      const speedX = dx / distance;
      const speedY = dy / distance;
      const offset = magnet.radius * 0.72;
      const f = this.emit(tactical ? frames.teal : frames.steel, x - speedX * offset, y - speedY * offset, 145, 'trail');
      f.vx = -speedX * 55;
      f.vy = -speedY * 55;
      f.image.setRotation(angle);
      sample.wait = tactical ? 0.073 : 0.115;
    }
    sample.x = x;
    sample.y = y;
    sample.inView = inView;
  }

  absorb(magnet: Participant, mass: number): void {
    if (!this.enabled) return;
    const count = this.quality === 'low' ? 2 : mass >= 70 ? 7 : 4;
    const radius = magnet.radius + 12;
    for (let index = 0; index < count; index++) {
      const a = (index + 0.5) * 2 * Math.PI / count;
      const f = this.emit(frames.steel, magnet.position.x + Math.cos(a) * radius, magnet.position.y + Math.sin(a) * radius,
        160, 'streak');
      f.target = magnet;
    }
  }

  render(bounds: WorldBounds, seconds: number, center: Point, zoom = 1): void {
    if (!this.enabled) return;
    this.ambient += seconds;
    if (this.quality === 'high' && this.ambient >= brand.vfx.ambientPeriod / 1000) {
      this.ambient = 0;
      this.burst(center, 'teal', 2, brand.vfx.ambientLifetime);
    }
    const extent = 14 / zoom;
    let visible = 0;
    for (let i = 0; i < this.limit; i++) {
      const f = this.pool[i];
      if (f.lifetime === 0) continue;
      f.age += seconds;
      const progress = f.age / f.lifetime;
      if (progress >= 1) {
        f.lifetime = 0;
        f.target = undefined;
        f.image.setVisible(false);
        continue;
      }
      const travel = f.lifetime * (1 - (1 - progress) ** 2);
      let x = f.x + f.vx * travel;
      let y = f.y + f.vy * travel;
      const target = f.target?.position;
      if (target) {
        const fraction = progress * progress;
        x = f.x + (target.x - f.x) * fraction;
        y = f.y + (target.y - f.y) * fraction;
        f.image.setRotation(Math.atan2(target.y - f.y, target.x - f.x));
      }
      const onScreen = x + extent >= bounds.left && x - extent <= bounds.right &&
        y + extent >= bounds.top && y - extent <= bounds.bottom;
      f.image.setVisible(onScreen);
      if (!onScreen) continue;
      visible++;
      const size = Math.max(brand.vfx.size, 3.5 / zoom) * (1 - progress * 0.55);
      const elongated = f.motion === 'trail' || f.motion === 'streak';
      const factor = f.motion === 'glint' ? 1.85 : f.motion === 'streak' ? 2.5 : elongated ? 1.8 : 1;
      f.image.setPosition(x, y).setDisplaySize(size * factor, elongated ? size * 0.48 : size * factor)
        .setAlpha((f.motion === 'trail' ? 0.63 : 0.94) * (1 - progress));
    }
    this.peakVisible = Math.max(this.peakVisible, visible);
  }
}
