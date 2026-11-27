import type Phaser from 'phaser';
import anchors from '../brand/face-anchors.json';
import type { CharacterPose } from './character-pose';
import { EyeTracking, pupilInEye, type EyeAperture } from './eye-tracking';
import type { Participant, Point } from './movement';

export const faceAtlas = 'magnet-faces';
type Mount = readonly [x: number, y: number, size: number];
const mounts = anchors.mounts as unknown as Readonly<Record<string, readonly Mount[]>>;
const sockets = anchors.eyes as unknown as Readonly<Record<string, readonly [EyeAperture, EyeAperture]>>;
// Opaque pupil radii in the existing 96 px workshop cel.
const sourcePupilX = 34;
const sourcePupilY = 40;

/** Each layer uses the same socket and the same pose. The pupils alone follow attention. */
export class CharacterFace {
  readonly eyes: Phaser.GameObjects.Image;
  readonly brows: Phaser.GameObjects.Image;
  readonly mouth: Phaser.GameObjects.Image;
  readonly pupils: readonly [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  private readonly gaze = new EyeTracking();

  constructor(scene: Phaser.Scene, root: Phaser.GameObjects.Container, private readonly id: string) {
    this.eyes = scene.add.image(0, 0, faceAtlas, id + '-relaxed-eyes');
    this.pupils = [scene.add.image(0, 0, 'workshop', 'eye-pupil'), scene.add.image(0, 0, 'workshop', 'eye-pupil')];
    this.brows = scene.add.image(0, 0, faceAtlas, id + '-relaxed-brows');
    this.mouth = scene.add.image(0, 0, faceAtlas, id + '-relaxed-mouth');
    root.add([this.eyes, ...this.pupils, this.brows, this.mouth]);
  }

  reset(): void { this.gaze.reset(); }

  render(magnet: Participant, stage: number, pose: CharacterPose, heading: number, seconds: number, target: Point | undefined,
      scaleX: number, scaleY: number, detail: boolean): void {
    const [x, y, width] = mounts[this.id][stage];
    const height = width * pose.faceSqueeze;
    const mood = this.id + '-' + pose.expression;
    const blink = detail && pose.blink;
    this.part(this.eyes, blink ? this.id + '-blink-eyes' : mood + '-eyes', x, y, width, height);
    this.part(this.brows, mood + '-brows', x, y, width, height);
    this.part(this.mouth, mood + '-mouth', x, y, width, height);
    const gaze = this.gaze.update(magnet.position, magnet.velocity, heading, target, seconds, scaleX, scaleY * pose.faceSqueeze);
    const apertures = sockets[mood];
    const size = pose.expression === 'shocked' ? 1 - .17 * pose.shock : 1;
    for (let i = 0; i < this.pupils.length; i++) {
      const pupil = this.pupils[i].setVisible(!blink);
      if (blink) continue;
      const fit = pupilInEye(apertures[i], gaze, size);
      pupil.setPosition(x + fit.x * width, y + fit.y * height);
      const sx = fit.pupilX * width / sourcePupilX;
      const sy = fit.pupilY * height / sourcePupilY;
      if (pupil.scaleX !== sx || pupil.scaleY !== sy) pupil.setScale(sx, sy);
    }
  }

  private part(sprite: Phaser.GameObjects.Image, frame: string, x: number, y: number, width: number, height: number): void {
    if (sprite.frame.name !== frame) sprite.setFrame(frame);
    if (sprite.x !== x || sprite.y !== y) sprite.setPosition(x, y);
    if (sprite.scaleX !== width || sprite.scaleY !== height) sprite.setScale(width, height);
  }
}
