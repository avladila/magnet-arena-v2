import type Phaser from 'phaser';
import { brand, color } from './brand';
import { FracturePlates } from './combat-effects';
import type { CriticalMass } from './critical-mass';
import type { Point } from './movement';
import type { WorldBounds } from './particles';
import type { Quality } from './progress';

const ink = color(brand.arcade.ink);
const red = color(brand.arcade.red);
const orange = color(brand.arcade.orange);
const yellow = color(brand.arcade.yellow);
const white = color(brand.arcade.white);
const smoke = color(brand.arcade.steel);
const tau = 2 * Math.PI;

function visible({ x, y }: Point, bounds: WorldBounds, radius: number): boolean {
  return x + radius >= bounds.left && x - radius <= bounds.right && y + radius >= bounds.top && y - radius <= bounds.bottom;
}

type Burst = { point: Readonly<Point>; radius: number; age: number };

export class CriticalView {
  private readonly boundary: Phaser.GameObjects.Graphics;
  private readonly wave: Phaser.GameObjects.Graphics;
  private readonly number: Phaser.GameObjects.Text;
  private readonly plates: FracturePlates;
  private readonly bursts: Burst[] = [];
  private at = 0;
  private active = false;

  constructor(scene: Phaser.Scene) {
    this.boundary = scene.add.graphics().setDepth(.19);
    this.wave = scene.add.graphics().setDepth(6.1);
    this.number = scene.add.text(0, 0, '', {
      fontFamily: 'Magnet Sans, system-ui, sans-serif', fontStyle: 'bold', fontSize: '30px',
      color: brand.arcade.white, stroke: brand.arcade.ink, strokeThickness: 7, resolution: 2,
    }).setOrigin(.5).setDepth(6.2).setVisible(false);
    this.plates = new FracturePlates(scene);
  }

  reset(): void {
    this.at = 0;
    this.active = false;
    this.bursts.length = 0;
    this.boundary.clear();
    this.wave.clear();
    this.number.setVisible(false);
    this.plates.reset();
  }

  render(critical: CriticalMass | undefined, view: WorldBounds, zoom: number, quality: Quality, dt: number, reduced: boolean): void {
    if (!critical) return;
    const { warning, claim, blast, rules } = critical;
    if (!warning) {
      if (this.active) {
        this.active = false;
        this.boundary.clear();
        this.wave.clear();
        this.number.setVisible(false);
      }
      return;
    }
    this.active = true;
    this.boundary.clear();
    this.wave.clear();
    this.number.setVisible(false);
    for (; this.at < critical.events.length; this.at++) {
      const event = critical.events[this.at];
      if (event.type === 'detonation' && visible(event.blast.center, view, 620)) {
        if (!reduced) this.plates.explode(event.blast.center, event.blast.winner.radius, 0, quality, true);
      } else if (event.type === 'destroyed' && visible(event.point, view, event.radius + 150)) {
        if (!reduced) this.plates.explode(event.point, event.radius, event.heading, quality, false);
        this.bursts.push({ point: event.point, radius: event.radius, age: 0 });
      }
    }
    const { x, y } = warning.center;
    if (visible(warning.center, view, rules.radius + 18 / zoom)) {
      this.boundary.fillStyle(red, .10).fillCircle(x, y, rules.radius);
      this.boundary.lineStyle(8 / zoom, ink, .67).strokeCircle(x, y, rules.radius);
      this.boundary.lineStyle(3.1 / zoom, orange, 1).strokeCircle(x, y, rules.radius);
      const arms = quality === 'low' ? 20 : 32;
      this.boundary.lineStyle(3.8 / zoom, red, .94);
      for (let i = 0; i < arms; i++) {
        const a = i * tau / arms;
        const inner = rules.radius - 22 / zoom;
        this.boundary.lineBetween(x + Math.cos(a) * inner, y + Math.sin(a) * inner,
          x + Math.cos(a + .012) * rules.radius, y + Math.sin(a + .012) * rules.radius);
      }
    }
    if (claim && visible(claim.center, view, claim.actor.radius + 90 / zoom)) {
      const number = String(Math.max(1, Math.ceil(claim.remaining)));
      if (this.number.text !== number) this.number.setText(number);
      const offset = claim.actor.radius + 24 / zoom;
      const compact = (view.right - view.left) * zoom <= 600;
      const above = y - offset;
      const below = y + offset;
      const nearHud = (above - view.top) * zoom < (compact ? 224 : 105);
      this.number.setPosition(x, nearHud && below < view.bottom - 16 / zoom ? below : above)
        .setScale(1 / zoom).setVisible(true);
    }
    if (blast) {
      const progress = blast.elapsed / rules.expansion;
      if (visible(blast.center, view, blast.radius + 20 / zoom)) {
        const radius = blast.radius;
        this.wave.fillStyle(orange, .07).fillCircle(x, y, radius);
        this.wave.lineStyle(12 / zoom, ink, .7).strokeCircle(x, y, radius);
        this.wave.lineStyle(7 / zoom, red, .9).strokeCircle(x, y, radius);
        this.wave.lineStyle(4.3 / zoom, yellow, .97).strokeCircle(x, y, radius);
        this.wave.lineStyle(1.5 / zoom, white, .97).strokeCircle(x, y, radius);
        if (!reduced && quality !== 'low' && radius > 30) this.teeth(x, y, radius, zoom, quality === 'high' ? 52 : 32);
      }
      if (progress < .66 && visible(blast.center, view, 650)) {
        const core = (185 + 410 * Math.min(1, progress * 2.7)) * (1 - progress * .42);
        this.star(x, y, core, reduced ? .86 : .76, Math.max(.54, 1 - progress * .55));
        if (!reduced && quality !== 'low' && progress >= .22) {
          for (let i = 0; i < 6; i++) {
            const angle = i * tau / 6 + .37;
            const drift = core * (.78 + progress * .85);
            this.wave.fillStyle(smoke, .33 * (1 - progress)).fillCircle(x + Math.cos(angle) * drift,
              y + Math.sin(angle) * drift, 60 + i * 13);
          }
        }
      }
    }
    for (const burst of this.bursts) {
      burst.age += dt;
      if (burst.age < .42) this.star(burst.point.x, burst.point.y, Math.min(68 / zoom, 44 + burst.radius * .48),
        .58, 1 - burst.age / .42);
    }
    this.plates.render(view, dt, zoom, reduced);
  }

  private teeth(x: number, y: number, radius: number, zoom: number, count: number): void {
    this.wave.beginPath();
    for (let i = 0; i <= count; i++) {
      const angle = i * tau / count;
      const r = radius - (i % 2 ? 14 : 4) / zoom;
      if (i === 0) this.wave.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
      else this.wave.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    }
    this.wave.lineStyle(2.1 / zoom, white, .74).strokePath();
  }

  private star(x: number, y: number, radius: number, inner: number, alpha: number): void {
    for (const [layer, tint] of [[1, ink], [.94, orange], [.73, yellow], [.41, white]]) {
      this.wave.beginPath();
      for (let i = 0; i < 24; i++) {
        const angle = i * tau / 24 + .12;
        const r = radius * layer * (i % 2 ? inner : .87 + (i % 5) * .05);
        if (i === 0) this.wave.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
        else this.wave.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
      }
      this.wave.closePath().fillStyle(tint, alpha).fillPath();
    }
  }
}
