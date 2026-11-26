import { brand, color as rgb } from './brand';
import type Phaser from 'phaser';
import type { WorkshopParticles } from './workshop-particles';
import { populationConfig, resourceBudget, scrapConfig, viewConfig } from './config';
import type { Collection, ResourceKind, Scrap, WorldBounds } from './particles';
import type { Quality } from './progress';
import type { ThemeMode, ThemePalette } from './theme';

const effectDuration = viewConfig.collectionEffectSeconds;
const glintWidth = 1.5;
const settings = brand.pickups;
const capacity = resourceBudget(populationConfig.competitive).capacity;
const ordinaryFrames = {
  light: Array.from({ length: scrapConfig.colorCount }, (_, index) => 'light-scrap-' + index),
  dark: Array.from({ length: scrapConfig.colorCount }, (_, index) => 'dark-scrap-' + index),
};

type ParticleDisplay = {
  mode: ThemeMode;
  zoom: number;
  quality: Quality;
  reducedMotion: boolean;
  effects: WorkshopParticles;
};

/** The artwork's opaque core is smaller than its padded glow frame. */
export function pickupFrameSize(kind: ResourceKind, zoom: number): number {
  const size = settings.sizes[kind];
  const core = Math.min(size.maxCoreWorld, Math.max(size.baseCore, size.minCoreCss / zoom));
  return Math.min(core / size.coreFraction, size.maxFrameCss / zoom);
}

function inView(x: number, y: number, extent: number, view: WorldBounds): boolean {
  return x + extent >= view.left && x - extent <= view.right && y + extent >= view.top && y - extent <= view.bottom;
}

function phase(scrap: Scrap): number {
  return (Math.imul(scrap.resourceId ?? scrap.id, 2654435761) >>> 0) / 2 ** 32;
}

export class ParticleView {
  private readonly pieces?: Phaser.GameObjects.Graphics;
  private readonly glints?: Phaser.GameObjects.Graphics;
  private readonly effects = Array.from({ length: viewConfig.maxCollectionEffects }, () => ({
    x: 0, y: 0, colorIndex: 0, kind: undefined as ResourceKind | undefined, remaining: 0,
  }));
  private nextEffect = 0;
  private readonly sprites?: Phaser.GameObjects.Image[];
  private readonly orbits: Phaser.GameObjects.Image[] = [];
  private visibleCount = 0;
  private orbitCount = 0;
  private readonly previousX = new Float32Array(capacity);
  private readonly previousY = new Float32Array(capacity);
  private readonly generations = new Int32Array(capacity);
  private readonly samples = new Uint32Array(capacity);
  private readonly emitAt = new Float64Array(capacity);
  private sample = 0;
  private elapsed = 0;

  constructor(private readonly scene: Phaser.Scene, useAtlas = false) {
    if (useAtlas) {
      this.sprites = [];
    } else {
      this.pieces = scene.add.graphics();
      this.glints = scene.add.graphics().setDepth(1);
    }
  }

  reset(): void {
    this.samples.fill(0);
    this.emitAt.fill(0);
    this.sample = 0;
    this.elapsed = 0;
  }

  render(
    slots: readonly Scrap[], view: WorldBounds, collections: readonly Collection[], seconds: number, palette: ThemePalette,
    kindOf?: (scrap: Scrap) => ResourceKind, display?: ParticleDisplay,
  ): void {
    if (this.sprites && display) this.renderAtlas(this.sprites, slots, view, seconds, kindOf, display);
    else if (this.pieces && this.glints) this.renderFallback(this.pieces, this.glints, slots, view, collections, seconds, palette, kindOf);
  }

  private renderAtlas(sprites: Phaser.GameObjects.Image[], slots: readonly Scrap[], view: WorldBounds, seconds: number,
      kindOf: ((scrap: Scrap) => ResourceKind) | undefined, display: ParticleDisplay): void {
    const { mode, zoom, quality, reducedMotion, effects } = display;
    const ordinarySize = pickupFrameSize('ordinary', zoom);
    const goldSize = pickupFrameSize('gold', zoom);
    const energySize = pickupFrameSize('energy', zoom);
    const maxExtent = Math.max(ordinarySize, goldSize, energySize) / 2;
    const animate = !reducedMotion && quality !== 'low';
    const oldTime = this.elapsed;
    this.elapsed += seconds;
    const time = this.elapsed;
    const sample = ++this.sample;
    let visible = 0;
    let orbits = 0;
    let trails = quality === 'high' ? 10 : 6;
    for (const scrap of slots) {
      const { id, x, y, state, colorIndex, generation } = scrap;
      if (state !== 'active' || !inView(x, y, maxExtent, view)) continue;
      const kind = kindOf?.(scrap) ?? 'ordinary';
      const size = kind === 'ordinary' ? ordinarySize : kind === 'gold' ? goldSize : energySize;
      if (!inView(x, y, size / 2, view)) continue;

      const image = sprites[visible] ??= this.scene.add.image(0, 0, 'workshop', 'gold').setDepth(0.4);
      visible++;
      const animatedOrbit = kind === 'energy' && animate && orbits < settings.energyOrbitPool;
      const frame = kind === 'ordinary' ? ordinaryFrames[mode][colorIndex] : kind === 'energy' && !animatedOrbit ? 'energy-static' : kind;
      if (image.frame.name !== frame) image.setFrame(frame).setDepth(kind === 'ordinary' ? 0.3 : 0.4);
      image.setPosition(x, y).setDisplaySize(size, size).setVisible(true);

      const continuing = this.samples[id] !== 0 && this.samples[id] === sample - 1 && this.generations[id] === generation;
      if (kind === 'energy' || kind === 'gold') {
        const offset = phase(scrap);
        if (animatedOrbit) {
          const breath = 0.89 + 0.11 * Math.sin(2 * Math.PI * (time / settings.energyBreathSeconds + offset));
          const angle = 2 * Math.PI * offset + settings.energyTurnRate * Math.PI / 180 * time;
          const orbit = this.orbits[orbits] ??= this.scene.add.image(0, 0, 'workshop', 'energy-orbit').setDepth(0.2);
          orbits++;
          orbit.setPosition(x, y).setDisplaySize(size, size).setRotation(angle).setAlpha(breath).setVisible(true);
        }
        const period = settings.glintSeconds[kind];
        if (animate && continuing &&
            Math.floor(oldTime / period + offset) < Math.floor(time / period + offset)) {
          effects.glint(scrap, kind);
        }
      }
      if (animate && continuing && trails > 0 && seconds > 0 && time >= this.emitAt[id]) {
        const dx = x - this.previousX[id];
        const dy = y - this.previousY[id];
        const moved = dx * dx + dy * dy;
        if (moved > 0.65 ** 2 && moved <= (scrapConfig.pullMaxSpeed * seconds + 0.1) ** 2) {
          effects.trail(x, y, Math.atan2(dy, dx), kind === 'ordinary' ? colorIndex : kind);
          this.emitAt[id] = time + settings.trailInterval;
          trails--;
        }
      }
      this.samples[id] = sample;
      this.generations[id] = generation;
      this.previousX[id] = x;
      this.previousY[id] = y;
    }
    for (let i = visible; i < this.visibleCount; i++) sprites[i].setVisible(false);
    for (let i = orbits; i < this.orbitCount; i++) this.orbits[i].setVisible(false);
    this.visibleCount = visible;
    this.orbitCount = orbits;
  }

  // The Canvas-graphics fallback owns its own glints. Atlas games delegate collection
  // to the shared effects pool once per frame.
  private renderFallback(pieces: Phaser.GameObjects.Graphics, glints: Phaser.GameObjects.Graphics, slots: readonly Scrap[],
      view: WorldBounds, collections: readonly Collection[], seconds: number, palette: ThemePalette,
      kindOf?: (scrap: Scrap) => ResourceKind): void {
    pieces.clear();
    for (const scrap of slots) {
      const { x, y, radius, state, colorIndex } = scrap;
      if (state !== 'active' || !inView(x, y, radius, view)) continue;
      const kind = kindOf?.(scrap);
      if (kind === 'gold' || kind === 'energy') {
        const gold = kind === 'gold';
        pieces.fillStyle(gold ? rgb(brand.legacy.particle_view.color1) : rgb(brand.legacy.particle_view.color2)).fillCircle(x, y, 7);
        pieces.fillStyle(gold ? rgb(brand.legacy.particle_view.color3) : rgb(brand.legacy.particle_view.color4))
          .fillTriangle(x - 6, y, x, y - 7, x + 6, y);
        pieces.fillStyle(rgb(brand.legacy.particle_view.color5)).fillCircle(x, y - 2, 1.8);
      } else if (kindOf) this.drawScrap(pieces, x, y, colorIndex, palette);
      else {
        pieces.fillStyle(palette.scrap[colorIndex]).fillRect(x - 3.5, y - 3.5, 7, 7);
        pieces.fillStyle(palette.scrapHighlight, 0.78).fillRect(x - 2.5, y - 2.5, 3, 2);
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
    glints.clear();
    for (const effect of this.effects) {
      if (effect.remaining <= 0) continue;
      const opacity = effect.remaining / effectDuration;
      const radius = 5 + (1 - opacity) * 8;
      if (!inView(effect.x, effect.y, radius + glintWidth / 2, view)) continue;
      const color = effect.kind === 'gold' ? rgb(brand.roles.gold) : effect.kind === 'energy' ? rgb(brand.roles.energy) : palette.scrap[effect.colorIndex];
      glints.lineStyle(glintWidth, color, 0.8 * opacity).strokeCircle(effect.x, effect.y, radius);
    }
  }

  private drawScrap(pieces: Phaser.GameObjects.Graphics, x: number, y: number, index: number, palette: ThemePalette) {
    const color = palette.scrap[index];
    const metal = palette.scrapHighlight;
    const art = pieces.fillStyle(color);
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
