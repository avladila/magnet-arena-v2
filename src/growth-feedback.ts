import type Phaser from 'phaser';
import { pullMultiplier } from './combat';
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

  constructor(scene: Phaser.Scene, player: Player, private readonly segmented = false) {
    this.rings = scene.add.graphics();
    this.feedback = new GrowthFeedback(player);
  }

  reset(player: Player) { this.feedback = new GrowthFeedback(player); }

  render(player: Player, seconds: number, palette: ThemePalette, reducedMotion: boolean): number | undefined {
    const milestone = this.feedback.update(player, seconds, reducedMotion);
    const radius = this.feedback.haloRadius;
    this.rings.setPosition(player.position.x, player.position.y);
    this.rings.clear().lineStyle(2, palette.field.edge, player.combat.heat >= 1 ? 0.16 : 0.34);
    if (!this.segmented || reducedMotion) this.rings.strokeCircle(0, 0, radius);
    else {
      this.spin = (this.spin + seconds * 0.32) % (Math.PI * 2);
      this.arcRing(radius, 0, 12);
      if (player.combat.heat < 1 && radius - player.radius > 16) {
        this.rings.lineStyle(1, palette.field.edge, 0.19);
        this.arcRing(radius - 8, -this.spin, 12);
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

  private arcRing(radius: number, phase: number, count: number): void {
    const segment = Math.PI * 2 / count;
    this.rings.beginPath();
    for (let i = 0; i < count; i++) {
      const angle = phase + i * segment;
      this.rings.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      this.rings.arc(0, 0, radius, angle, angle + segment * 0.84, false);
    }
    this.rings.strokePath();
  }
}
