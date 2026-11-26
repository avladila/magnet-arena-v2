import { brand, color } from './brand';
import type Phaser from 'phaser';
import { arena, arenaArt, playerConfig } from './config';
import type { WorldBounds } from './particles';
import type { ThemePalette } from './theme';

const slabWidth = 1170;
const slabHeight = 520;
const serviceLanes = [1880, 3900, 6220, 8450];
const stripWidth = 24;

export function drawArena(art: Phaser.GameObjects.Graphics, { arena: colors }: ThemePalette, bounds: WorldBounds) {
  const { left, top, right, bottom } = bounds;
  art.clear().fillStyle(colors.background).fillRect(left, top, right - left, bottom - top);
  for (let row = Math.floor(top / slabHeight); row * slabHeight < bottom; row++) {
    const offset = (row % 3) * 310 - 620;
    const y = row * slabHeight;
    for (let column = Math.floor((left - offset) / slabWidth); offset + column * slabWidth < right; column++) {
      const x = Math.max(0, offset + column * slabWidth);
      const edge = Math.min(arena.width, offset + (column + 1) * slabWidth - 5);
      const end = Math.min(arena.height, y + slabHeight - 5);
      if (edge <= x || end <= y) continue;
      const variation = ((row * 37 + column * 17) % 7 + 7) % 7;
      const section = edge - x;
      art.fillStyle(colors.grid, 0.09 + variation * 0.025).fillRect(x, y, section, end - y);
      art.fillStyle(colors.markings, 0.24).fillRect(x, end - 2, section, 2).fillRect(edge - 2, y, 2, end - y);
      art.fillStyle(colors.markings, 0.24);
      if (section > 65 && end - y > 28) {
        art.fillRect(x + 14, y + 12, 8, 4).fillRect(edge - 22, end - 16, 8, 4);
      }
      // The scuffs belong to the plate rather than the camera.
      if (section > 220 && end - y > 200 && variation % 2 === 0) {
        const px = x + Math.min(section - 55, 54 + variation * 33);
        const py = y + Math.min(end - y - 25, 150 + variation * 27);
        art.fillStyle(colors.markings, 0.075).fillRect(px, py, Math.min(108, edge - px), 25);
        art.fillStyle(colors.grid, 0.28).fillRect(px + 4, py + 4, Math.min(54, edge - px - 4), 3);
      }
    }
  }

  for (const lane of serviceLanes) {
    if (lane + 58 < top || lane > bottom) continue;
    art.fillStyle(colors.markings, 0.11).fillRect(left, lane, right - left, 54);
    art.fillStyle(colors.markings, 0.20).fillRect(left, lane + 3, right - left, 2)
      .fillRect(left, lane + 49, right - left, 3);
    art.fillStyle(colors.markings, 0.28);
    for (let x = Math.ceil(left / 360) * 360; x + 72 < right; x += 360) art.fillRect(x, lane + 25, 72, 4);
  }

  // This steel strip meets the actual movement limit on every side.
  const boundary = color(brand.arcade.ink);
  art.fillStyle(boundary, 0.23);
  if (left === 0) art.fillRect(0, top, stripWidth, bottom - top);
  if (right === arena.width) art.fillRect(right - stripWidth, top, stripWidth, bottom - top);
  if (top === 0) art.fillRect(left, 0, right - left, stripWidth);
  if (bottom === arena.height) art.fillRect(left, bottom - stripWidth, right - left, stripWidth);
  art.lineStyle(6, color(brand.arcade.yellow), 0.34).beginPath();
  for (const x of [0, arena.width - stripWidth]) {
    if (x === 0 ? left > 0 : right < arena.width) continue;
    for (let y = Math.ceil(top / 42) * 42; y + stripWidth < bottom; y += 42) {
      art.moveTo(x, y).lineTo(x + stripWidth, y + stripWidth);
    }
  }
  for (const y of [0, arena.height - stripWidth]) {
    if (y === 0 ? top > 0 : bottom < arena.height) continue;
    for (let x = Math.ceil(left / 42) * 42; x + stripWidth < right; x += 42) {
      art.moveTo(x, y).lineTo(x + stripWidth, y + stripWidth);
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
    const cached = this.cached;
    if (this.palette === palette && cached && cached.left <= Math.max(0, view.left) && cached.top <= Math.max(0, view.top) &&
        cached.right >= Math.min(arena.width, view.right) && cached.bottom >= Math.min(arena.height, view.bottom)) return;
    const left = Math.max(0, (Math.floor(view.left / size) - 1) * size);
    const top = Math.max(0, (Math.floor(view.top / size) - 1) * size);
    const right = Math.min(arena.width, (Math.ceil(view.right / size) + 1) * size);
    const bottom = Math.min(arena.height, (Math.ceil(view.bottom / size) + 1) * size);
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
