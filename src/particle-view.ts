import type Phaser from 'phaser';
import { viewConfig } from './config';
import type { Collection, ResourceKind, Scrap, WorldBounds } from './particles';
import type { ThemePalette } from './theme';

const effectDuration = viewConfig.collectionEffectSeconds;
const glintWidth = 1.5;

export class ParticleView {
  private readonly pieces: Phaser.GameObjects.Graphics;
  private readonly glints: Phaser.GameObjects.Graphics;
  private readonly effects = Array.from({ length: viewConfig.maxCollectionEffects }, () => ({
    x: 0, y: 0, colorIndex: 0, kind: undefined as ResourceKind | undefined, remaining: 0,
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
    kindOf?: (scrap: Scrap) => ResourceKind,
  ) {
    this.pieces.clear();
    for (const scrap of slots) {
      const { x, y, radius, state, colorIndex } = scrap;
      if (state !== 'active' || x + radius < view.left || x - radius > view.right ||
          y + radius < view.top || y - radius > view.bottom) continue;
      const kind = kindOf?.(scrap);
      if (kind === 'gold' || kind === 'energy') {
        const gold = kind === 'gold';
        this.pieces.fillStyle(gold ? 0xb57222 : 0x9e2544).fillCircle(x, y, 7);
        this.pieces.fillStyle(gold ? 0xffd064 : 0xff6476).fillTriangle(x - 6, y, x, y - 7, x + 6, y);
        this.pieces.fillStyle(0xfffbe8).fillCircle(x, y - 2, 1.8);
        continue;
      }
      if (kindOf) this.drawScrap(x, y, colorIndex, palette);
      else {
        this.pieces.fillStyle(palette.scrap[colorIndex]).fillRect(x - 3.5, y - 3.5, 7, 7);
        this.pieces.fillStyle(palette.scrapHighlight, 0.78).fillRect(x - 2.5, y - 2.5, 3, 2);
      }
    }

    for (const effect of this.effects) effect.remaining = Math.max(0, effect.remaining - seconds);
    for (const collection of collections) {
      const effect = this.effects[this.nextEffect];
      effect.x = collection.x;
      effect.y = collection.y;
      effect.colorIndex = collection.colorIndex;
      effect.kind = collection.kind;
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
      const color = effect.kind === 'gold' ? 0xe5a32b : effect.kind === 'energy' ? 0xe74e67 : palette.scrap[effect.colorIndex];
      this.glints.lineStyle(glintWidth, color, 0.8 * opacity);
      this.glints.strokeCircle(effect.x, effect.y, radius);
    }
  }

  private drawScrap(x: number, y: number, index: number, palette: ThemePalette) {
    const color = palette.scrap[index];
    const metal = palette.scrapHighlight;
    const art = this.pieces.fillStyle(color);
    switch (index) {
      case 0: // Hex nut
        art.fillPoints([[-4, 0], [-2, -4], [2, -4], [4, 0], [2, 4], [-2, 4]]
          .map(([dx, dy]) => ({ x: x + dx, y: y + dy })), true);
        art.fillStyle(metal).fillCircle(x, y, 1.4);
        break;
      case 1: // Washer
        art.lineStyle(2.4, color).strokeCircle(x, y, 3);
        break;
      case 2: // Bolt
        art.fillRect(x - 2, y - 4, 4, 8).fillRect(x - 4, y - 4, 8, 2);
        break;
      case 3: // Screw
        art.fillTriangle(x - 2, y - 2, x + 2, y - 2, x, y + 5).fillRect(x - 4, y - 4, 8, 2);
        art.lineStyle(1, metal).lineBetween(x - 2, y - 3, x + 2, y - 3);
        break;
      case 4: // Gear
        art.fillCircle(x, y, 3.4).fillRect(x - 5, y - 1, 10, 2).fillRect(x - 1, y - 5, 2, 10);
        art.fillStyle(metal).fillCircle(x, y, 1.2);
        break;
      case 5: // Bent plate
        art.fillTriangle(x - 5, y - 3, x + 5, y - 3, x + 2, y + 4);
        art.lineStyle(1, metal).lineBetween(x - 2, y - 2, x + 1, y + 1);
        break;
      case 6: // Spring
        art.lineStyle(1.4, color).beginPath().moveTo(x - 3, y - 4).lineTo(x + 3, y - 2)
          .lineTo(x - 3, y).lineTo(x + 3, y + 2).lineTo(x - 3, y + 4).strokePath();
        break;
      case 7: // Can tab
        art.lineStyle(2, color).strokeRoundedRect(x - 3, y - 5, 6, 10, 2);
        art.lineBetween(x - 2, y + 1, x + 2, y + 1);
        break;
      case 8: // Rivet
        art.fillCircle(x, y, 3.5).fillRect(x - 1.5, y, 3, 5);
        art.fillStyle(metal).fillCircle(x - 1, y - 1, 1.3);
        break;
      default: // Bracket
        art.fillRect(x - 4, y - 3, 3, 8).fillRect(x - 4, y + 2, 9, 3);
        art.fillStyle(metal).fillCircle(x + 3, y + 3.5, 0.8);
        break;
    }
  }

}
