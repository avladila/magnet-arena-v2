import type Phaser from 'phaser';
import { createMagnetSprite, PoleCharge, renderMagnet } from './magnet-art';
import type { Bot } from './bots';
import { playerConfig, viewConfig } from './config';
import { clamp, type Participant } from './movement';
import type { WorldBounds } from './particles';
import type { ThemePalette } from './theme';
import { Heading, MagnetScale } from './view';

export class BotView {
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private readonly charge?: PoleCharge;
  private heading = new Heading();
  private scale = new MagnetScale();
  private palette?: ThemePalette;
  private labelSide = -1;
  private bot?: Bot;

  constructor(scene: Phaser.Scene, bot: Bot, showCharge = false) {
    this.bot = bot;
    this.body = createMagnetSprite(scene, bot.id).setDepth(1);
    if (showCharge) this.charge = new PoleCharge(scene);
    this.label = scene.add.text(0, 0, bot.name, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      resolution: viewConfig.maxPixelRatio,
    }).setOrigin(0.5, 0).setDepth(2);
  }

  setBot(bot?: Bot) {
    this.bot = bot;
    this.body.setVisible(false);
    this.label.setVisible(false);
    if (bot && this.label.text !== bot.name) this.label.setText(bot.name);
    this.heading = new Heading();
    this.heading.angle = bot?.heading ?? 0;
    this.labelSide = -1;
    this.charge?.reset();
    this.scale = new MagnetScale();
  }

  render(
    seconds: number,
    zoom: number,
    view: WorldBounds,
    palette: ThemePalette,
    participants: readonly Participant[],
    names: WorldBounds[],
    reducedMotion = false,
  ): void {
    const bot = this.bot;
    if (!bot) return;
    this.heading.update(bot.heading, seconds);
    this.scale.update(bot.physicalScale, seconds, bot.combat.lostToTheft);

    const { x, y } = bot.position;
    const bodyRadius = playerConfig.radius * this.scale.scale;
    const visible = x + bodyRadius >= view.left && x - bodyRadius <= view.right &&
      y + bodyRadius >= view.top && y - bodyRadius <= view.bottom;
    this.body.setVisible(visible);
    this.charge?.render(bot, this.heading.angle, this.scale.scale, seconds, visible, reducedMotion);
    this.label.setVisible(false);
    if (!visible) return;

    if (this.palette !== palette) {
      this.label.setColor(palette.ui['--hud-text']).setStroke(palette.ui['--hud-surface'], 4);
      this.palette = palette;
    }
    renderMagnet(this.body, bot, this.heading.angle, this.scale.scale);

    const halfWidth = this.label.width / (2 * zoom);
    const height = this.label.height / zoom;
    const offset = bodyRadius + 5 / zoom;
    const labelX = clamp(x, view.left + halfWidth, view.right - halfWidth);
    // Keep the current side while it fits. Clearing the opposite side should not flip a readable label.
    for (const side of [this.labelSide, -this.labelSide]) {
      const top = side < 0 ? y - offset - height : y + offset;
      const box = { left: labelX - halfWidth, right: labelX + halfWidth, top, bottom: top + height };
      if (box.right > view.right || top < view.top || box.bottom > view.bottom) continue;
      if (names.some((other) => box.left < other.right && box.right > other.left &&
          box.top < other.bottom && box.bottom > other.top)) continue;
      if (participants.some((other) => other !== bot && this.bodyCovers(other, box))) continue;
      this.labelSide = side;
      names.push(box);
      this.label.setPosition(labelX, top).setScale(1 / zoom).setVisible(true);
      return;
    }
  }

  private bodyCovers(participant: Participant, box: WorldBounds): boolean {
    const { position: { x, y }, radius } = participant;
    return (x - clamp(x, box.left, box.right)) ** 2 + (y - clamp(y, box.top, box.bottom)) ** 2 < radius ** 2;
  }
}
