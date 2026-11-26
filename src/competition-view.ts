import type Phaser from 'phaser';
import type { ArenaModel } from './arena-model';
import { theftConfig } from './competition-config';
import { districts } from './districts';
import type { Quality } from './progress';
import type { HazardKind } from './hazards';
import type { Participant, Point } from './movement';
import type { WorldBounds } from './particles';

const colors: Record<HazardKind, number> = {
  flux: 0x6947bf, heat: 0xe86631, water: 0x2082ba, acid: 0x738c13, cold: 0x66bddb,
};

function visible({ x, y }: Point, bounds: WorldBounds, radius: number) {
  return x >= bounds.left - radius && x <= bounds.right + radius &&
    y >= bounds.top - radius && y <= bounds.bottom + radius;
}

export class CompetitionView {
  private readonly structures: Phaser.GameObjects.Graphics;
  private readonly floor: Phaser.GameObjects.Graphics;
  private readonly effects: Phaser.GameObjects.Graphics;
  private readonly damageLabels: { text: Phaser.GameObjects.Text; total: number; elapsed: number }[];

  constructor(scene: Phaser.Scene) {
    this.structures = scene.add.graphics();
    this.floor = scene.add.graphics();
    this.effects = scene.add.graphics().setDepth(5);
    this.damageLabels = Array.from({ length: 5 }, () => ({
      text: scene.add.text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold',
        color: '#ffe9e8', stroke: '#7c1736', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(6).setVisible(false),
      total: 0,
      elapsed: Infinity,
    }));
  }

  render(model: ArenaModel, bounds: WorldBounds, aim: number, tracked: Participant | undefined, quality: Quality,
      seconds: number, zoom: number, reducedMotion: boolean) {
    this.floor.clear();
    this.renderStructures(bounds, quality);
    this.effects.clear();
    for (const site of model.hazards?.sites ?? []) {
      const { x, y, radius, kind } = site;
      if (!visible(site, bounds, radius + 15)) continue;
      const color = kind === 'flux' && model.hazards?.discharged(site) ? 0x60766f : colors[kind];
      this.floor.fillStyle(color, 0.24).fillCircle(x, y, radius);
      this.floor.lineStyle(4, color, 0.85).strokeCircle(x, y, radius);
      if (kind === 'flux' || kind === 'cold') {
        this.floor.fillStyle(color, 0.9);
        for (let side = 0; side < 6; side++) {
          const a = side * Math.PI / 3;
          this.floor.fillTriangle(x, y, x + radius * Math.cos(a), y + radius * Math.sin(a),
            x + radius * 0.42 * Math.cos(a + 0.47), y + radius * 0.42 * Math.sin(a + 0.47));
        }
        this.floor.fillStyle(0xeafafa, 0.85).fillCircle(x, y, radius * 0.14);
      } else if (kind === 'heat') {
        for (let row = -3; row <= 3; row++) {
          this.floor.lineStyle(9, color, 0.72).lineBetween(x - 100, y + row * 24, x + 100, y + row * 24);
        }
      } else {
        for (let band = 1; band <= 3; band++) {
          this.floor.lineStyle(kind === 'acid' ? 5 : 2, color, 0.6)
            .strokeEllipse(x, y, radius * 0.55 * band, radius * 0.35 * band);
        }
        if (kind === 'acid') this.floor.fillStyle(color, 0.9).fillTriangle(x - 20, y + 14, x + 20, y + 14, x, y - 22);
      }
    }
    for (const chunk of model.salvage.chunks) {
      if (!visible(chunk, bounds, 40)) continue;
      const lift = chunk.age < theftConfig.flight ? 28 * Math.sin(Math.PI * chunk.age / theftConfig.flight) : 0;
      const size = Math.min(14, 5 + Math.sqrt(chunk.value));
      const y = chunk.y - lift;
      this.effects.fillStyle(0x15362f, 0.3).fillEllipse(chunk.x, chunk.y + 3, size * 2, size);
      this.effects.fillStyle(0x41685d).fillTriangle(chunk.x - size, y, chunk.x + size, y - size, chunk.x + size * 0.6, y + size);
      this.effects.lineStyle(2, 0xdff8d6).lineBetween(chunk.x - size, y, chunk.x + size, y - size);
    }
    if (model.signal && visible(model.signal, bounds, 160)) {
      this.effects.lineStyle(4, 0x117d67, 0.8).strokeCircle(model.signal.x, model.signal.y, 120);
      this.effects.lineStyle(2, 0x117d67, 0.45).strokeCircle(model.signal.x, model.signal.y, 150);
    }
    for (const [index, participant] of model.participants.entries()) {
      this.renderDamage(index, participant, seconds, zoom, bounds, reducedMotion);
      const attack = participant.combat.attack;
      if (!visible(participant.position, bounds, theftConfig.reach + participant.radius)) continue;
      if (attack.phase === 'armed') this.cone(participant, participant === model.player ? aim : participant.heading, false);
      if (attack.phase === 'warning') this.cone(participant, attack.bearing, true, attack.remaining);
      if (participant.combat.energy === 100 && attack.phase !== 'cooldown') {
        this.effects.lineStyle(2, 0xd44c66, 0.78)
          .strokeCircle(participant.position.x, participant.position.y, participant.radius + 11);
      }
      if (participant.combat.brittle || participant.combat.heat > 0.25) {
        this.effects.lineStyle(3, participant.combat.brittle ? colors.cold : colors.heat, 0.8)
          .strokeCircle(participant.position.x, participant.position.y, participant.radius + 5);
      }
    }
    if (tracked) this.effects.lineStyle(4, 0xe24a61).strokeCircle(tracked.position.x, tracked.position.y, tracked.radius + 12);
  }

  reset(): void {
    for (const label of this.damageLabels) {
      label.total = 0;
      label.elapsed = Infinity;
      label.text.setVisible(false);
    }
  }

  private renderDamage(index: number, magnet: Participant, seconds: number, zoom: number,
      bounds: WorldBounds, reducedMotion: boolean): void {
    const label = this.damageLabels[index];
    const total = magnet.combat.lostToTheft + magnet.combat.lostToHazards;
    if (total > label.total) {
      label.text.setText('−' + (total - label.total));
      label.elapsed = 0;
    }
    label.total = total;
    label.elapsed += seconds;
    const { x, y } = magnet.position;
    const display = label.elapsed < 0.8 && visible(magnet.position, bounds, magnet.radius + 45);
    label.text.setVisible(display);
    if (!display) return;
    const rise = reducedMotion ? 0 : label.elapsed * 28;
    label.text.setPosition(x, y - magnet.radius - (18 + rise) / zoom).setScale(1 / zoom)
      .setAlpha(reducedMotion ? 1 : Math.min(1, (0.8 - label.elapsed) * 3));
    if (!reducedMotion && label.elapsed < 0.25) {
      this.effects.lineStyle(3, 0xd84d63, 0.8 * (1 - label.elapsed / 0.25))
        .strokeCircle(x, y, magnet.radius + 6 + label.elapsed * 52);
    }
  }

  private renderStructures(bounds: WorldBounds, quality: Quality) {
    this.structures.clear();
    if (quality === 'low') return;
    for (const { x, y, accent, mark } of districts) {
      if (!visible({ x, y }, bounds, 980)) continue;
      this.structures.lineStyle(12, accent, 0.14).strokeRoundedRect(x - 780, y - 560, 1560, 1120, 90);
      this.structures.lineStyle(2, accent, 0.22).strokeRoundedRect(x - 796, y - 576, 1592, 1152, 100);
      for (const dx of [-620, 620]) for (const dy of [-415, 415]) {
        const px = x + dx;
        const py = y + dy;
        this.structures.fillStyle(accent, 0.08).fillRoundedRect(px - 130, py - 80, 260, 160, 24);
        if (mark === 'cooling' || mark === 'chemical') {
          this.structures.lineStyle(7, accent, 0.14).strokeCircle(px, py, 49).strokeCircle(px, py, 65);
        } else {
          const spacing = mark === 'assembly' ? 28 : mark === 'foundry' ? 17 : 38;
          for (let bar = -85; bar < 95; bar += spacing) {
            this.structures.lineStyle(5, accent, 0.16).lineBetween(px + bar - 20, py + 48, px + bar + 20, py - 48);
          }
        }
      }
      if (quality === 'high') {
        this.structures.lineStyle(2, accent, 0.12);
        for (let yOffset = -310; yOffset <= 310; yOffset += 155) {
          this.structures.lineBetween(x - 520, y + yOffset, x + 520, y + yOffset);
        }
      }
    }
  }

  private cone(magnet: Participant, aim: number, warning: boolean, warningLeft?: number) {
    const { x, y } = magnet.position;
    const radius = theftConfig.reach + magnet.radius;
    const color = warning ? 0xc02645 : 0x1e7463;
    this.effects.fillStyle(color, warning ? 0.26 : 0.13).lineStyle(3, color, 0.85);
    this.effects.beginPath().moveTo(x, y);
    this.effects.arc(x, y, radius, aim - theftConfig.halfAngle, aim + theftConfig.halfAngle, false);
    this.effects.closePath().fillPath().strokePath();
    if (warningLeft !== undefined) {
      const travel = magnet.radius + (1 - warningLeft / theftConfig.warning) * theftConfig.reach;
      this.effects.lineStyle(4, color, 0.85).beginPath();
      this.effects.arc(x, y, travel, aim - theftConfig.halfAngle, aim + theftConfig.halfAngle, false).strokePath();
    }
  }
}
