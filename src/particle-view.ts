import type Phaser from 'phaser';
import { viewConfig } from './config';
import type { Collection, Scrap, WorldBounds } from './particles';
import type { ThemePalette } from './theme';

const effectDuration = viewConfig.collectionEffectSeconds;
const glintWidth = 1.5;

export class ParticleView {
  private readonly pieces: Phaser.GameObjects.Graphics;
  private readonly glints: Phaser.GameObjects.Graphics;
  private readonly effects = Array.from({ length: viewConfig.maxCollectionEffects }, () => ({
    x: 0, y: 0, colorIndex: 0, remaining: 0,
  }));
  private nextEffect = 0;

  constructor(scene: Phaser.Scene) {
    this.pieces = scene.add.graphics();
    this.glints = scene.add.graphics().setDepth(1);
  }

  render(
    slots: readonly Scrap[],
    view: WorldBounds,
    collections: readonly Collection[],
    seconds: number,
    palette: ThemePalette,
  ) {
    this.pieces.clear();
    for (const { x, y, radius, state, colorIndex } of slots) {
      if (state !== 'active' || x + radius < view.left || x - radius > view.right ||
          y + radius < view.top || y - radius > view.bottom) continue;
      this.pieces.fillStyle(palette.scrap[colorIndex]).fillRect(x - 3.5, y - 3.5, 7, 7);
      this.pieces.fillStyle(palette.scrapHighlight, 0.78).fillRect(x - 2.5, y - 2.5, 3, 2);
    }

    for (const effect of this.effects) effect.remaining = Math.max(0, effect.remaining - seconds);
    for (const collection of collections) {
      const effect = this.effects[this.nextEffect];
      effect.x = collection.x;
      effect.y = collection.y;
      effect.colorIndex = collection.colorIndex;
      effect.remaining = effectDuration;
      this.nextEffect = (this.nextEffect + 1) % this.effects.length;
    }
    this.glints.clear();
    for (const effect of this.effects) {
      if (effect.remaining <= 0) continue;
      const opacity = effect.remaining / effectDuration;
      const radius = 5 + (1 - opacity) * 8;
      const extent = radius + glintWidth / 2;
      if (effect.x + extent < view.left || effect.x - extent > view.right ||
          effect.y + extent < view.top || effect.y - extent > view.bottom) continue;
      this.glints.lineStyle(glintWidth, palette.scrap[effect.colorIndex], 0.8 * opacity);
      this.glints.strokeCircle(effect.x, effect.y, radius);
    }
  }
}
