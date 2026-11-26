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

/** A charge flash follows the painted pole tips, including the renderer's eased heading and scale. */
export class PoleCharge {
  private readonly lights: Phaser.GameObjects.Image[];
  private cells = 0;
  private remaining = 0;

  constructor(scene: Phaser.Scene) {
    this.lights = Array.from({ length: 2 }, () =>
      scene.add.image(0, 0, 'workshop', 'pole-charge').setDepth(2.5).setVisible(false));
  }

  reset(): void {
    this.cells = 0;
    this.remaining = 0;
    for (const light of this.lights) light.setVisible(false);
  }

  render(magnet: Participant, heading: number, size: number, seconds: number, visible: boolean, reducedMotion: boolean): void {
    const duration = brand.motion.energy / 1000;
    this.remaining = magnet.combat.cells > this.cells ? duration : Math.max(0, this.remaining - seconds);
    this.cells = magnet.combat.cells;
    const ready = magnet.combat.energy === 100 && magnet.combat.attack.phase !== 'cooldown';
    const flash = reducedMotion ? 0 : this.remaining / duration;
    const strength = Math.max(ready ? 0.68 : 0, flash);
    const show = visible && strength > 0;
    const scale = 2 * playerConfig.radius * size / bodyPixels;
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      light.setVisible(show);
      if (!show) continue;
      const x = 14 * scale;
      const y = (i === 0 ? -12.5 : 12.5) * scale;
      light.setPosition(magnet.position.x + x * Math.cos(heading) - y * Math.sin(heading),
        magnet.position.y + x * Math.sin(heading) + y * Math.cos(heading))
        .setDisplaySize(29 * scale, 29 * scale).setAlpha(strength);
    }
  }
}
