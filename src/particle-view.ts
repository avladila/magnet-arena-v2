import { brand, color as rgb } from './brand';
import type Phaser from 'phaser';
import type { WorkshopParticles } from './workshop-particles';
import { scrapConfig, viewConfig } from './config';
import type { Collection, ResourceKind, Scrap, WorldBounds } from './particles';
import type { ThemePalette } from './theme';

const effectDuration = viewConfig.collectionEffectSeconds;
const glintWidth = 1.5;
const spriteFrames = Object.fromEntries(['light', 'dark'].map((mode) => [mode,
  Array.from({ length: 10 }, (_, index) => [mode + '-scrap-' + index + '-0', mode + '-scrap-' + index + '-1'])]));

export class ParticleView {
  private readonly pieces: Phaser.GameObjects.Graphics;
  private readonly glints: Phaser.GameObjects.Graphics;
  private readonly effects = Array.from({ length: viewConfig.maxCollectionEffects }, () => ({
    x: 0, y: 0, colorIndex: 0, kind: undefined as ResourceKind | undefined, remaining: 0,
  }));
  private nextEffect = 0;
  private readonly sprites?: Phaser.GameObjects.Image[];
  private visibleCount = 0;
  private readonly previousX = new Float32Array(scrapConfig.capacity);
  private readonly previousY = new Float32Array(scrapConfig.capacity);
  private readonly generations = new Int32Array(scrapConfig.capacity).fill(-1);
  private readonly samples = new Uint32Array(scrapConfig.capacity);
  private sample = 0;

  constructor(scene: Phaser.Scene, useAtlas = false) {
    this.pieces = scene.add.graphics();
    this.glints = scene.add.graphics().setDepth(1);
    if (useAtlas) this.sprites = Array.from({ length: scrapConfig.activeCount }, () =>
      scene.add.image(0, 0, 'workshop', 'gold').setVisible(false));
  }

  render(
    slots: readonly Scrap[],
    view: WorldBounds,
    collections: readonly Collection[],
    seconds: number,
    palette: ThemePalette,
    kindOf?: (scrap: Scrap) => ResourceKind,
    mode = 'light', zoom = 1, reducedMotion = false, effects?: WorkshopParticles,
  ) {
    this.pieces.clear();
    let visibleCount = 0;
    let trails = 0;
    const sample = ++this.sample;
    for (const scrap of slots) {
      const { x, y, radius, state, colorIndex } = scrap;
      if (state !== 'active' || x + radius < view.left || x - radius > view.right ||
          y + radius < view.top || y - radius > view.bottom) continue;
      const kind = kindOf?.(scrap);
      if (this.sprites) {
        const sprite = this.sprites[visibleCount++];
        const goldOrEnergy = kind === 'gold' || kind === 'energy';
        const frame = goldOrEnergy ? kind : spriteFrames[mode][colorIndex][Number(zoom >= 0.65)];
        sprite.setFrame(frame).setPosition(x, y).setDisplaySize(goldOrEnergy ? 19 : 14, goldOrEnergy ? 19 : 14)
          .setVisible(true);
        if (effects && !reducedMotion && trails < 8 && this.samples[scrap.id] === sample - 1 &&
            this.generations[scrap.id] === scrap.generation && seconds > 0) {
          const dx = x - this.previousX[scrap.id];
          const dy = y - this.previousY[scrap.id];
          if (dx * dx + dy * dy > 1) {
            effects.trail(x, y, Math.atan2(dy, dx), kind === 'gold' || kind === 'energy' ? kind : 'steel');
            trails++;
          }
        }
        this.samples[scrap.id] = sample;
        this.generations[scrap.id] = scrap.generation;
        this.previousX[scrap.id] = x;
        this.previousY[scrap.id] = y;
        continue;
      }
      if (kind === 'gold' || kind === 'energy') {
        const gold = kind === 'gold';
        this.pieces.fillStyle(gold ? rgb(brand.legacy.particle_view.color1) : rgb(brand.legacy.particle_view.color2)).fillCircle(x, y, 7);
        this.pieces.fillStyle(gold ? rgb(brand.legacy.particle_view.color3) : rgb(brand.legacy.particle_view.color4)).fillTriangle(x - 6, y, x, y - 7, x + 6, y);
        this.pieces.fillStyle(rgb(brand.legacy.particle_view.color5)).fillCircle(x, y - 2, 1.8);
        continue;
      }
      if (kindOf) this.drawScrap(x, y, colorIndex, palette);
      else {
        this.pieces.fillStyle(palette.scrap[colorIndex]).fillRect(x - 3.5, y - 3.5, 7, 7);
        this.pieces.fillStyle(palette.scrapHighlight, 0.78).fillRect(x - 2.5, y - 2.5, 3, 2);
      }
    }

    if (this.sprites) {
      for (let i = visibleCount; i < this.visibleCount; i++) this.sprites[i].setVisible(false);
      this.visibleCount = visibleCount;
      return;
    }
    for (const effect of this.effects) effect.remaining = Math.max(0, effect.remaining - seconds);
    for (const collection of collections) {
      const effect = this.effects[this.nextEffect];
      effect.x = collection.x;
      effect.y = collection.y;
      effect.colorIndex = collection.colorIndex;
      effect.kind = collection.kind;
      effect.remaining = this.sprites
        ? (collection.kind === 'gold' ? brand.motion.gold : brand.motion.pickup) / 1000 : effectDuration;
      this.nextEffect = (this.nextEffect + 1) % this.effects.length;
    }
    this.glints.clear();
    for (const effect of this.effects) {
      if (reducedMotion || effect.remaining <= 0) continue;
      const duration = this.sprites ? (effect.kind === 'gold' ? brand.motion.gold : brand.motion.pickup) / 1000 : effectDuration;
      const opacity = effect.remaining / duration;
      const radius = 5 + (1 - opacity) * 8;
      const extent = radius + glintWidth / 2;
      if (effect.x + extent < view.left || effect.x - extent > view.right ||
          effect.y + extent < view.top || effect.y - extent > view.bottom) continue;
      const color = effect.kind === 'gold' ? rgb(brand.roles.gold) : effect.kind === 'energy' ? rgb(brand.roles.energy) : palette.scrap[effect.colorIndex];
      this.glints.lineStyle(glintWidth, color, 0.8 * opacity);
      if (!this.sprites) this.glints.strokeCircle(effect.x, effect.y, radius);
      else {
        this.glints.fillStyle(color, 0.8 * opacity);
        const count = effect.kind === 'gold' ? 6 : 2;
        for (let spoke = 0; spoke < count; spoke++) {
          const angle = spoke * 2 * Math.PI / count;
          this.glints.fillCircle(effect.x + radius * Math.cos(angle), effect.y + radius * Math.sin(angle), 1 + opacity);
        }
      }
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
