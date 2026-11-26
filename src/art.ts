import { brand, color } from './brand';
import type Phaser from 'phaser';
import { arena, arenaArt, playerConfig } from './config';
import type { WorldBounds } from './particles';
import type { ThemePalette } from './theme';

function firstMarker(minimum: number, origin: number, spacing: number): number {
  return origin + Math.max(0, Math.ceil((minimum - origin) / spacing)) * spacing;
}

export function drawArena(art: Phaser.GameObjects.Graphics, { arena: colors }: ThemePalette, bounds: WorldBounds) {
  const { left, top, right, bottom } = bounds;
  art.clear().fillStyle(colors.background).fillRect(left, top, right - left, bottom - top);
  art.fillStyle(colors.grid);
  const { gridSpacing, referenceSpacing, referenceSize } = arenaArt;
  for (let x = firstMarker(left, gridSpacing / 2, gridSpacing); x < right; x += gridSpacing) {
    for (let y = firstMarker(top, gridSpacing / 2, gridSpacing); y < bottom; y += gridSpacing) {
      art.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  // Include a whole floor mark when the cached rectangle cuts through it.
  const inset = (referenceSpacing - gridSpacing) / 2;
  const half = referenceSize / 2;
  const arm = referenceSize / 4;
  art.lineStyle(2, colors.markings, 0.65).beginPath();
  const stopX = Math.min(right + half, arena.width - half);
  const stopY = Math.min(bottom + half, arena.height - half);
  for (let x = firstMarker(left - half, inset, referenceSpacing); x < stopX; x += referenceSpacing) {
    for (let y = firstMarker(top - half, inset, referenceSpacing); y < stopY; y += referenceSpacing) {
      for (const horizontal of [-1, 1]) {
        for (const vertical of [-1, 1]) {
          const cornerX = x + horizontal * half;
          const cornerY = y + vertical * half;
          art.moveTo(cornerX - horizontal * arm, cornerY);
          art.lineTo(cornerX, cornerY);
          art.lineTo(cornerX, cornerY - vertical * arm);
        }
      }
    }
  }
  art.strokePath();
}

export class ArenaFloor {
  private cached?: WorldBounds;
  private palette?: ThemePalette;

  constructor(private readonly graphics: Phaser.GameObjects.Graphics) {}

  render(view: WorldBounds, palette: ThemePalette): void {
    const size = arenaArt.cacheSpacing;
    const left = Math.max(0, Math.floor(view.left / size) * size);
    const top = Math.max(0, Math.floor(view.top / size) * size);
    const right = Math.min(arena.width, Math.ceil(view.right / size) * size);
    const bottom = Math.min(arena.height, Math.ceil(view.bottom / size) * size);
    if (this.palette === palette && this.cached?.left === left && this.cached.top === top &&
        this.cached.right === right && this.cached.bottom === bottom) return;
    this.cached = { left, top, right, bottom };
    this.palette = palette;
    drawArena(this.graphics, palette, this.cached);
  }
}

export function drawMagnet(scene: Phaser.Scene, accent?: number) {
  const art = scene.add.graphics();
  const backingRadius = 33;
  const accentRadius = 37;
  const normalization = playerConfig.radius / (accent === undefined ? backingRadius : accentRadius);
  art.scaleCanvas(normalization, normalization);
  if (accent !== undefined) art.fillStyle(accent).fillCircle(0, 0, accentRadius);
  art.fillStyle(color(brand.legacy.art.color1)).fillCircle(0, 0, backingRadius);
  art.fillStyle(color(brand.legacy.art.color2), 0.18).fillRoundedRect(-26, -21, 52, 46, 18);
  art.fillStyle(color(brand.legacy.art.color3)).fillRoundedRect(-26, -23, 50, 46, 18);
  art.fillStyle(color(brand.legacy.art.color4)).fillRoundedRect(-23, -20, 43, 17, {
    tl: 11, tr: 4, bl: 0, br: 2,
  });
  art.fillStyle(color(brand.legacy.art.color5)).fillRoundedRect(-23, 3, 43, 17, {
    tl: 0, tr: 2, bl: 11, br: 4,
  });
  art.fillStyle(color(brand.legacy.art.color6)).fillRoundedRect(12, -20, 12, 17, 3);
  art.fillStyle(color(brand.legacy.art.color7)).fillRoundedRect(12, 3, 12, 17, 3);
  // The open end of the horseshoe faces local +X.
  art.fillStyle(color(brand.legacy.art.color1)).fillRoundedRect(-6, -4, 32, 8, 4);
  return art;
}
