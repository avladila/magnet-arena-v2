import Phaser from 'phaser';
import { arena } from './config';

export function drawArena(scene: Phaser.Scene) {
  const art = scene.add.graphics();
  art.fillStyle(0xdef5ee).fillRect(0, 0, arena.width, arena.height);
  art.fillStyle(0xb7e0d5);
  const spacing = 80;
  for (let x = spacing / 2; x < arena.width; x += spacing) {
    for (let y = spacing / 2; y < arena.height; y += spacing) art.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  art.lineStyle(6, 0xa3d8cb).strokeRect(7, 7, arena.width - 14, arena.height - 14);
  art.lineStyle(2, 0xb7e0d5).strokeCircle(arena.width / 2, arena.height / 2, 114);
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
