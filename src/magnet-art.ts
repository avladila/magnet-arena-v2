import type Phaser from 'phaser';
import { brand } from './brand';
import { CharacterAttention, type AttentionWorld } from './character-attention';
import { CharacterFace } from './character-face';
import { CharacterPose, type CharacterIntent } from './character-pose';
import { theftConfig } from './competition-config';
import { playerConfig } from './config';
import type { Participant } from './movement';

export { faceAtlas } from './character-face';
export const magnetAtlas = 'magnet-shells';
const shellStages = brand.shellStages.slice(1);
const bodyPixels = 108;
const assemblySeconds = 0.26;

type Mark = 'impact' | 'sweat' | 'frost' | 'rust';

function shellStage(mass: number): number {
  return shellStages.reduce((count, threshold) => count + Number(mass >= threshold), 0);
}

export function createMagnetSprite(scene: Phaser.Scene, id: string) {
  return scene.add.sprite(0, 0, magnetAtlas, id + '-0');
}

export function renderMagnet(sprite: Phaser.GameObjects.Sprite, magnet: Participant, heading: number, size: number) {
  const frame = magnet.id + '-' + shellStage(magnet.mass);
  if (sprite.frame.name !== frame) sprite.setFrame(frame);
  sprite.setPosition(magnet.position.x, magnet.position.y).setRotation(heading)
    .setScale(2 * playerConfig.radius * size / bodyPixels);
}

export class MagnetCharacter {
  readonly body: Phaser.GameObjects.Sprite;
  readonly face: CharacterFace;
  private readonly root: Phaser.GameObjects.Container;
  private readonly poles: Phaser.GameObjects.Image[];
  private readonly plate: Phaser.GameObjects.Image;
  private readonly rivet: Phaser.GameObjects.Image;
  private readonly marks = new Map<Mark, Phaser.GameObjects.Image>();
  private readonly attention = new CharacterAttention();
  private pose = new CharacterPose();
  private cells = 0;
  private flash = 0;
  private lastStage?: number;
  private assembly = 0;

  constructor(private readonly scene: Phaser.Scene, id: string, depth: number) {
    this.body = createMagnetSprite(scene, id);
    this.plate = scene.add.image(0, 0, 'workshop', 'fracture-shard-1').setVisible(false);
    this.root = scene.add.container(0, 0, [this.body, this.plate]).setDepth(depth).setVisible(false);
    this.face = new CharacterFace(scene, this.root, id);
    this.rivet = scene.add.image(0, 0, 'workshop', 'fleck-steel').setVisible(false);
    this.poles = Array.from({ length: 2 }, () => scene.add.image(0, 0, 'workshop', 'pole-charge'));
    this.root.add([this.rivet, ...this.poles]);
  }

  reset(): void {
    this.pose = new CharacterPose();
    this.attention.reset();
    this.face.reset();
    this.cells = 0;
    this.flash = 0;
    this.lastStage = undefined;
    this.assembly = 0;
    this.root.setVisible(false);
  }

  render(magnet: Participant, heading: number, size: number, seconds: number, visible: boolean, reducedMotion: boolean,
      world?: AttentionWorld, intent?: CharacterIntent, detail = true): void {
    const focus = visible && world ? this.attention.update(magnet, world, seconds) : undefined;
    this.pose.update(magnet, seconds, reducedMotion || !visible, intent, focus);
    const stage = shellStage(magnet.mass);
    if (reducedMotion || !visible || this.lastStage !== undefined && stage < this.lastStage) this.assembly = 0;
    else if (this.lastStage !== undefined && stage > this.lastStage) this.assembly = assemblySeconds;
    else this.assembly = Math.max(0, this.assembly - seconds);
    this.lastStage = stage;
    const flashTime = brand.motion.energy / 1000;
    this.flash = magnet.combat.cells > this.cells ? flashTime : Math.max(0, this.flash - seconds);
    this.cells = magnet.combat.cells;
    if (!visible) {
      if (this.root.visible) {
        this.attention.reset();
        this.face.reset();
        this.root.setVisible(false);
      }
      return;
    }

    const { expression, stretchX, stretchY, markProgress, recoil } = this.pose;
    const body = 2 * playerConfig.radius * size / bodyPixels;
    const assemblyProgress = 1 - this.assembly / assemblySeconds;
    const click = Math.sin(Math.PI * assemblyProgress) * 0.042;
    const sx = body * (stretchX + click);
    const sy = body * (stretchY + click);
    const lean = recoil * Math.min(1.6, body);
    const x = magnet.position.x - lean * Math.cos(heading);
    const y = magnet.position.y - lean * Math.sin(heading);
    // Shell, sockets, and local accents form one layer in the arena display list.
    this.root.setPosition(x, y).setRotation(heading).setScale(sx, sy).setVisible(true);
    const shell = magnet.id + '-' + stage;
    if (this.body.frame.name !== shell) this.body.setFrame(shell);
    this.body.setVisible(true);
    this.face.render(magnet, stage, this.pose, heading, seconds, focus?.point, sx, sy, detail);

    const exhausted = magnet.combat.heat >= .24;
    const frozen = magnet.combat.brittle || magnet.combat.cold >= .45;
    const bob = reducedMotion ? 0 : 2.6 * Math.sin(markProgress * 7);
    this.mark('impact', expression === 'shocked', -25, -46 - (reducedMotion ? 0 : 14 * markProgress), 24);
    this.mark('sweat', exhausted || detail && !reducedMotion && expression === 'frightened', -35, -30 + bob, 15);
    this.mark('frost', frozen, -3, -46 + bob, 17);
    this.mark('rust', Boolean(magnet.combat.corrosion), -34, 33 - bob, 17);

    const ready = magnet.combat.energy === theftConfig.energy && magnet.combat.attack.phase !== 'cooldown';
    const winding = magnet.combat.attack.phase === 'armed' || magnet.combat.attack.phase === 'warning';
    const charge = Math.max(winding ? 1 : ready ? .74 : 0, reducedMotion ? 0 : this.flash / flashTime);
    for (let i = 0; i < this.poles.length; i++) {
      const pole = this.poles[i].setVisible(charge > 0);
      if (charge > 0) pole.setPosition(42, i === 0 ? -27 : 26).setDisplaySize(34, 34).setAlpha(charge);
    }
    this.plate.setVisible(detail && this.assembly > 0 && assemblyProgress < .72);
    this.rivet.setVisible(this.assembly > 0 && assemblyProgress > .42);
    if (this.plate.visible) {
      const remaining = (1 - assemblyProgress / .72) ** 2;
      this.plate.setPosition(-39 - 28 * remaining, 25 + 21 * remaining)
        .setDisplaySize(29, 23).setRotation(-remaining * .78).setAlpha(.9);
    }
    if (this.rivet.visible) {
      this.rivet.setPosition(-30, 29).setDisplaySize(22, 22).setAlpha(.87 * (1 - assemblyProgress));
    }
  }

  private mark(kind: Mark, shown: boolean, x: number, y: number, size: number): void {
    let sprite = this.marks.get(kind);
    if (!shown) {
      sprite?.setVisible(false);
      return;
    }
    if (!sprite) {
      sprite = this.scene.add.image(0, 0, 'workshop', 'face-' + kind).setRotation(.34);
      this.marks.set(kind, sprite);
      this.root.add(sprite);
    }
    sprite.setPosition(x, y).setDisplaySize(size, size).setVisible(true);
  }
}
