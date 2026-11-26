import { brand, color } from './brand';
import type Phaser from 'phaser';
import { pullMultiplier } from './combat';
import { theftConfig } from './competition-config';
import { growthFeedback, scrapConfig } from './config';
import { attractionReach } from './growth';
import type { Player } from './movement';
import type { ThemePalette } from './theme';

export class GrowthFeedback {
  private previousMass: number;
  private pulseElapsed = growthFeedback.pulseSeconds;
  haloRadius: number;

  constructor(player: Player) {
    this.previousMass = player.mass;
    this.haloRadius = attractionReach(player.physicalScale);
  }

  update(player: Player, seconds: number, reducedMotion: boolean): number | undefined {
    const contact = player.radius + scrapConfig.radius;
    const reach = contact + Math.max(0, attractionReach(player.physicalScale) - contact) * pullMultiplier(player);
    const eased = this.haloRadius + (reach - this.haloRadius) * -Math.expm1(-growthFeedback.haloRate * seconds);
    this.haloRadius = Math.max(player.radius + scrapConfig.radius, eased);

    let milestone: number | undefined;
    for (const threshold of growthFeedback.milestones) {
      if (this.previousMass < threshold && player.mass >= threshold) milestone = threshold;
    }
    this.previousMass = player.mass;
    if (reducedMotion) {
      this.pulseElapsed = growthFeedback.pulseSeconds;
      return;
    }
    // A single pulse represents the highest threshold in a multi-pickup update.
    this.pulseElapsed = milestone === undefined
      ? Math.min(this.pulseElapsed + seconds, growthFeedback.pulseSeconds)
      : 0;
    return milestone;
  }

  get pulseProgress(): number | undefined {
    if (this.pulseElapsed < growthFeedback.pulseSeconds) {
      return this.pulseElapsed / growthFeedback.pulseSeconds;
    }
  }
}

export class GrowthFeedbackView {
  private readonly rings: Phaser.GameObjects.Graphics;
  private feedback: GrowthFeedback;
  private spin = 0;
  private pickupLight = 0;
  private disruption = 0;
  private previousTheft = 0;

  constructor(scene: Phaser.Scene, player: Player, private readonly segmented = false) {
    this.rings = scene.add.graphics();
    this.feedback = new GrowthFeedback(player);
  }

  reset(player: Player) {
    this.feedback = new GrowthFeedback(player);
    this.spin = 0;
    this.pickupLight = 0;
    this.disruption = 0;
    this.previousTheft = 0;
  }

  render(player: Player, seconds: number, palette: ThemePalette, reducedMotion: boolean, collecting = false,
      heading = player.heading, detailed = true, zoom = 1): number | undefined {
    const milestone = this.feedback.update(player, seconds, reducedMotion);
    const radius = this.feedback.haloRadius;
    this.rings.setPosition(player.position.x, player.position.y);
    const flashSeconds = brand.motion.pickup / 1000;
    this.pickupLight = collecting ? flashSeconds : Math.max(0, this.pickupLight - seconds);
    this.disruption = player.combat.lostToTheft > this.previousTheft ? 0.22 : Math.max(0, this.disruption - seconds);
    this.previousTheft = player.combat.lostToTheft;
    const flash = reducedMotion ? 0 : this.pickupLight / flashSeconds;
    const weak = player.combat.heat >= 0.65;
    const cold = player.combat.brittle;
    const fieldColor = cold ? color(brand.arcade.cyan) : weak ? color(brand.arcade.orange) : palette.field.edge;
    this.rings.clear().lineStyle(1.4 / zoom, fieldColor, weak ? 0.25 : 0.33 + flash * 0.19);
    if (!this.segmented || reducedMotion) this.rings.strokeCircle(0, 0, radius);
    else {
      // Small, stationary ticks describe the actual circular reach. The inner curves are theatrical.
      const contact = player.radius + scrapConfig.radius;
      const worldReach = contact + Math.max(0, attractionReach(player.physicalScale) - contact) * pullMultiplier(player);
      this.arcRing(worldReach, weak ? 14 : 12, weak ? 0.43 : 0.82);
      if (detailed && !weak && radius - player.radius > 10) {
        const charged = player.combat.energy === theftConfig.energy && player.combat.attack.phase !== 'cooldown';
        const highlight = charged ? color(brand.arcade.yellow) : fieldColor;
        this.spin = (this.spin + seconds * (charged ? 1.25 : 0.64)) % 1;
        const alpha = (0.22 + flash * 0.24 + (charged ? 0.16 : 0)) * (1 - this.disruption * 3.2);
        this.circulate(player.radius, radius, heading, highlight, alpha, zoom, cold);
      }
    }

    const pulse = this.feedback.pulseProgress;
    if (pulse === undefined) return milestone;
    const remaining = 1 - pulse;
    const innerRadius = player.radius + scrapConfig.radius;
    const pulseRadius = innerRadius + (radius + 12 - innerRadius) * (1 - remaining ** 2);
    this.rings.lineStyle(2.5, palette.field.pulse, 0.52 * remaining).strokeCircle(0, 0, pulseRadius);
    return milestone;
  }

  private arcRing(radius: number, count: number, length: number): void {
    const segment = Math.PI * 2 / count;
    this.rings.beginPath();
    for (let i = 0; i < count; i++) {
      const angle = i * segment;
      this.rings.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      this.rings.arc(0, 0, radius, angle, angle + segment * length, false);
    }
    this.rings.strokePath();
  }

  private circulate(body: number, radius: number, heading: number, tint: number, opacity: number, zoom: number, cold: boolean): void {
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const jaw = body * 0.77;
    const gap = body * 0.46;
    const curl = Math.min(radius * 0.78, jaw + (radius - body) * 0.55);
    for (const side of [-1, 1]) {
      this.rings.lineStyle(1.6 / zoom, tint, opacity).beginPath();
      const bright = cold ? 1 : Math.floor(this.spin * 8) + 1;
      let x0 = 0, y0 = 0, x1 = 0, y1 = 0, lastX = 0, lastY = 0;
      for (let step = 0; step <= 9; step++) {
        const t = step / 9;
        const bow = Math.sin(t * Math.PI);
        const x = jaw + side * (curl - jaw) * bow;
        const y = (2 * t - 1) * (gap + bow * (radius - body) * (side > 0 ? 0.65 : 1.15));
        const px = x * c - y * s;
        const py = x * s + y * c;
        if (step) this.rings.lineTo(px, py);
        else this.rings.moveTo(px, py);
        if (step === bright) {
          x0 = lastX;
          y0 = lastY;
          x1 = px;
          y1 = py;
        }
        lastX = px;
        lastY = py;
      }
      this.rings.strokePath();
      this.rings.lineStyle(2.3 / zoom, tint, opacity * 1.45).lineBetween(x0, y0, x1, y1);
    }
  }
}
