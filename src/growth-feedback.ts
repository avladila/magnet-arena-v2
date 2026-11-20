import type Phaser from 'phaser';
import { growthFeedback } from './config';
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
    const reach = attractionReach(player.physicalScale);
    this.haloRadius += (reach - this.haloRadius) * -Math.expm1(-growthFeedback.haloRate * seconds);

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
  private readonly feedback: GrowthFeedback;

  constructor(scene: Phaser.Scene, player: Player) {
    this.rings = scene.add.graphics();
    this.feedback = new GrowthFeedback(player);
  }

  render(player: Player, seconds: number, palette: ThemePalette, reducedMotion: boolean): void {
    this.feedback.update(player, seconds, reducedMotion);
    const radius = this.feedback.haloRadius;
    this.rings.setPosition(player.position.x, player.position.y);
    this.rings.clear().lineStyle(2, palette.field.edge, 0.32).strokeCircle(0, 0, radius);

    const pulse = this.feedback.pulseProgress;
    if (pulse === undefined) return;
    const remaining = 1 - pulse;
    const pulseRadius = player.radius + (radius + 12 - player.radius) * (1 - remaining ** 2);
    this.rings.lineStyle(2.5, palette.field.pulse, 0.52 * remaining).strokeCircle(0, 0, pulseRadius);
  }
}
