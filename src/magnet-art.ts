import faceAnchors from '../brand/face-anchors.json';
import { brand } from './brand';
import { CharacterPose } from './character-pose';
import type Phaser from 'phaser';
import { theftConfig } from './competition-config';
import { playerConfig } from './config';
import type { Participant, Point } from './movement';

export const magnetAtlas = 'magnet-shells';
export const faceAtlas = 'magnet-faces';
const shellStages = brand.shellStages.slice(1);
const bodyPixels = 108;
const anchors: Readonly<Record<string, number[][]>> = faceAnchors;

function shellFrame(magnet: Participant): string {
  const stage = shellStages.reduce((count, threshold) => count + Number(magnet.mass >= threshold), 0);
  return magnet.id + '-' + stage;
}

export function createMagnetSprite(scene: Phaser.Scene, id: string) {
  return scene.add.sprite(0, 0, magnetAtlas, id + '-0');
}

export function renderMagnet(sprite: Phaser.GameObjects.Sprite, magnet: Participant, heading: number, size: number) {
  const frame = shellFrame(magnet);
  if (sprite.frame.name !== frame) sprite.setFrame(frame);
  sprite.setPosition(magnet.position.x, magnet.position.y).setRotation(heading)
    .setScale(2 * playerConfig.radius * size / bodyPixels);
}

/** The shell, painted face and moving pupils share the same local pose. */
export class MagnetCharacter {
  readonly body: Phaser.GameObjects.Sprite;
  readonly face: Phaser.GameObjects.Image;
  private readonly pupils: Phaser.GameObjects.Image[];
  private readonly status: Phaser.GameObjects.Image;
  private readonly poles: Phaser.GameObjects.Image[];
  private pose = new CharacterPose();
  private cells = 0;
  private flash = 0;
  private gazeX = 0;
  private gazeY = 0;
  private attention?: Point;
  private attentionFor = 0;

  constructor(scene: Phaser.Scene, id: string, depth: number) {
    this.body = createMagnetSprite(scene, id).setDepth(depth);
    this.face = scene.add.image(0, 0, faceAtlas, id + '-idle').setDepth(depth + 0.03);
    this.pupils = Array.from({ length: 2 }, () =>
      scene.add.image(0, 0, 'workshop', 'eye-pupil').setDepth(depth + 0.04));
    this.status = scene.add.image(0, 0, 'workshop', 'face-impact').setDepth(depth + 0.09);
    this.poles = Array.from({ length: 2 }, () =>
      scene.add.image(0, 0, 'workshop', 'pole-charge').setDepth(depth + 0.08));
    this.hide();
  }

  reset(): void {
    this.pose = new CharacterPose();
    this.cells = 0;
    this.flash = 0;
    this.gazeX = 0;
    this.gazeY = 0;
    this.attention = undefined;
    this.attentionFor = 0;
    this.hide();
  }

  private hide(): void {
    if (!this.body.visible && !this.face.visible) return;
    this.body.setVisible(false);
    this.face.setVisible(false);
    this.status.setVisible(false);
    for (const pupil of this.pupils) pupil.setVisible(false);
    for (const pole of this.poles) pole.setVisible(false);
  }

  render(magnet: Participant, heading: number, size: number, seconds: number, visible: boolean, reducedMotion: boolean,
      pickup?: Point): void {
    this.pose.update(magnet, seconds, reducedMotion);
    const flashTime = brand.motion.energy / 1000;
    this.flash = magnet.combat.cells > this.cells ? flashTime : Math.max(0, this.flash - seconds);
    this.cells = magnet.combat.cells;
    if (pickup) {
      this.attention = pickup;
      this.attentionFor = 0.29;
    } else this.attentionFor = Math.max(0, this.attentionFor - seconds);
    if (!visible) {
      this.hide();
      return;
    }

    const { expression, stretchX, stretchY, markProgress, recoil } = this.pose;
    const body = 2 * playerConfig.radius * size / bodyPixels;
    const sx = body * stretchX;
    const sy = body * stretchY;
    const cosine = Math.cos(heading);
    const sine = Math.sin(heading);
    const lean = recoil * Math.min(1.6, body);
    const x = magnet.position.x - lean * cosine;
    const y = magnet.position.y - lean * sine;
    const shell = shellFrame(magnet);
    if (this.body.frame.name !== shell) this.body.setFrame(shell);
    this.body.setPosition(x, y).setRotation(heading).setScale(sx, sy).setVisible(true);

    const face = magnet.id + '-' + expression;
    if (this.face.frame.name !== face) this.face.setFrame(face);
    this.place(this.face, x, y, -14 * sx, -8 * sy, cosine, sine).setRotation(heading).setScale(sx, sy).setVisible(true);
    const look = this.attentionFor > 0 && this.attention;
    const dx = look ? look.x - magnet.position.x : magnet.velocity.x;
    const dy = look ? look.y - magnet.position.y : magnet.velocity.y;
    const distance = Math.hypot(dx, dy);
    const desiredX = distance > 1 ? (dx * cosine + dy * sine) / distance * 0.66 : 0.3;
    const desiredY = distance > 1 ? (dy * cosine - dx * sine) / distance * 0.56 : -0.15;
    const smooth = reducedMotion ? 1 : 1 - Math.exp(-18 * seconds);
    this.gazeX += (desiredX - this.gazeX) * smooth;
    this.gazeY += (desiredY - this.gazeY) * smooth;
    const eyes = anchors[face];
    for (let i = 0; i < eyes.length; i++) {
      const [eyeX, eyeY, roomX, roomY] = eyes[i];
      const pupil = this.pupils[i];
      this.place(pupil, x, y, (eyeX + roomX * this.gazeX) * sx, (eyeY + roomY * this.gazeY) * sy, cosine, sine)
        .setDisplaySize(10 * sx, (roomY < 2 ? 7 : 10) * sy).setRotation(heading).setVisible(true);
    }

    const mark = expression === 'hit' ? 'impact' : expression === 'hot' ? 'sweat'
      : expression === 'cold' ? 'frost' : expression === 'rust' ? 'rust' : undefined;
    this.status.setVisible(mark !== undefined);
    if (mark) {
      const frame = 'face-' + mark;
      if (this.status.frame.name !== frame) this.status.setFrame(frame);
      const bob = reducedMotion ? 0 : expression === 'hit' ? -18 * markProgress : 4 * Math.sin(markProgress * 7);
      const markSize = (expression === 'hit' ? 24 : 16) * body;
      this.place(this.status, x, y, -30 * sx, (-46 + bob) * sy, cosine, sine)
        .setDisplaySize(markSize, markSize).setRotation(heading + 0.4).setVisible(true);
    }

    const ready = magnet.combat.energy === theftConfig.energy && magnet.combat.attack.phase !== 'cooldown';
    const charge = Math.max(ready ? 0.74 : 0, reducedMotion ? 0 : this.flash / flashTime);
    for (let i = 0; i < this.poles.length; i++) {
      const pole = this.poles[i];
      pole.setVisible(charge > 0);
      if (charge > 0) {
        this.place(pole, x, y, 42 * sx, (i === 0 ? -27 : 26) * sy, cosine, sine)
          .setDisplaySize(34 * body, 34 * body).setAlpha(charge);
      }
    }
  }

  private place(image: Phaser.GameObjects.Image, x: number, y: number, dx: number, dy: number, cosine: number, sine: number) {
    return image.setPosition(x + dx * cosine - dy * sine, y + dx * sine + dy * cosine);
  }
}
