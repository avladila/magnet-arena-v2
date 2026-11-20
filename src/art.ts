import type Phaser from 'phaser';
import { arena, arenaArt } from './config';
import type { ThemePalette } from './theme';

export function drawArena(art: Phaser.GameObjects.Graphics, { arena: colors }: ThemePalette) {
  art.clear().fillStyle(colors.background).fillRect(0, 0, arena.width, arena.height);
  art.fillStyle(colors.grid);
  const { gridSpacing, referenceSpacing, referenceSize } = arenaArt;
  for (let x = gridSpacing / 2; x < arena.width; x += gridSpacing) {
    for (let y = gridSpacing / 2; y < arena.height; y += gridSpacing) {
      art.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
  art.lineStyle(6, colors.boundary).strokeRect(7, 7, arena.width - 14, arena.height - 14);

  // Open corners mark a fixed span on every sixth grid intersection.
  const inset = (referenceSpacing - gridSpacing) / 2;
  const half = referenceSize / 2;
  const arm = referenceSize / 4;
  art.lineStyle(2, colors.markings, 0.65).beginPath();
  for (let x = inset; x < arena.width - half; x += referenceSpacing) {
    for (let y = inset; y < arena.height - half; y += referenceSpacing) {
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

export function drawMagnet(scene: Phaser.Scene) {
  const art = scene.add.graphics();
  art.fillStyle(0x397b74, 0.18).fillEllipse(0, 5, 66, 66);
  art.fillStyle(0xf5fffa).fillCircle(0, 0, 33);
  art.fillStyle(0x23494d).fillRoundedRect(-26, -23, 50, 46, 18);
  art.fillStyle(0xeb6170).fillRoundedRect(-23, -20, 43, 17, {
    tl: 11, tr: 4, bl: 0, br: 2,
  });
  art.fillStyle(0x427cd5).fillRoundedRect(-23, 3, 43, 17, {
    tl: 0, tr: 2, bl: 11, br: 4,
  });
  art.fillStyle(0xffa4ac).fillRoundedRect(12, -20, 12, 17, 3);
  art.fillStyle(0x9bc4ff).fillRoundedRect(12, 3, 12, 17, 3);
  // The open end of the horseshoe faces local +X.
  art.fillStyle(0xf5fffa).fillRoundedRect(-6, -4, 32, 8, 4);
  return art;
}
