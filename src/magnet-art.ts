import { brand } from './brand';
import type Phaser from 'phaser';
import { playerConfig } from './config';
import type { Participant } from './movement';

export const magnetAtlas = 'magnet-shells';
const shellStages = brand.shellStages.slice(1);
const bodyPixels = 78;

export function createMagnetSprite(scene: Phaser.Scene, id: string) {
  return scene.add.sprite(0, 0, magnetAtlas, id + '-0');
}

export function renderMagnet(sprite: Phaser.GameObjects.Sprite, magnet: Participant, heading: number, size: number) {
  const stage = shellStages.reduce((count, threshold) => count + Number(magnet.mass >= threshold), 0);
  const frame = magnet.id + '-' + stage;
  if (sprite.frame.name !== frame) sprite.setFrame(frame);
  sprite.setPosition(magnet.position.x, magnet.position.y).setRotation(heading)
    .setScale(2 * playerConfig.radius * size / bodyPixels);
}
