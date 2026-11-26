import { brand, color as rgb } from './brand';
import type Phaser from 'phaser';
import type { ArenaModel } from './arena-model';
import type { TheftImpact } from './combat-state';
import { hazardConfig, theftConfig } from './competition-config';
import { districts } from './districts';
import type { Quality } from './progress';
import type { HazardKind } from './hazards';
import type { Participant, Point } from './movement';
import type { WorldBounds } from './particles';

const debrisFrames = ['debris-0', 'debris-1', 'debris-2', 'debris-3'];
export const sceneryAtlas = 'scenery';
const combatColor = brand.combatVisual;
const ink = rgb(brand.arcade.ink);
const white = rgb(brand.arcade.white);
const yellow = rgb(brand.arcade.yellow);
const orange = rgb(brand.arcade.orange);
const red = rgb(brand.arcade.red);
const cyan = rgb(brand.arcade.cyan);
const propOffsets = [[-390, -242], [407, -210], [-160, 350], [540, 231]];
const propFrames = {
  assembly: ['prop-press', 'prop-sign', 'prop-drain', 'prop-crate'],
  foundry: ['prop-vent', 'prop-stacks', 'prop-press', 'prop-pipe'],
  recycling: ['prop-crate', 'prop-press', 'prop-stacks', 'prop-sign'],
  cooling: ['prop-pipe', 'prop-drain', 'prop-vent', 'prop-grate'],
  chemical: ['prop-drain', 'prop-vent', 'prop-pipe', 'prop-sign'],
  salvage: ['prop-stacks', 'prop-crate', 'prop-sign', 'prop-grate'],
};

const colors: Record<HazardKind, number> = {
  flux: rgb(brand.arcade.purple), heat: orange, water: rgb(brand.arcade.blue), acid: rgb(brand.arcade.green), cold: cyan,
};

function visible({ x, y }: Point, bounds: WorldBounds, radius: number) {
  return x >= bounds.left - radius && x <= bounds.right + radius &&
    y >= bounds.top - radius && y <= bounds.bottom + radius;
}

export class CompetitionView {
  private readonly structures: Phaser.GameObjects.Graphics;
  private readonly props: Phaser.GameObjects.Image[];
  private districtMask = -1;
  private structureQuality?: Quality;
  private readonly floor: Phaser.GameObjects.Graphics;
  private readonly sites: Phaser.GameObjects.Image[];
  private readonly shards: Phaser.GameObjects.Image[] = [];
  private visibleShards = 0;
  private readonly effects: Phaser.GameObjects.Graphics;
  private readonly damageLabels: { text: Phaser.GameObjects.Text; total: number; theft: number; elapsed: number; impact?: TheftImpact }[];

  constructor(private readonly scene: Phaser.Scene, participantCount: number) {
    this.structures = scene.add.graphics();
    this.props = Array.from({ length: districts.length * propOffsets.length }, () => scene.add.image(0, 0, sceneryAtlas, 'prop-grate')
      .setDepth(0.08).setVisible(false));
    this.floor = scene.add.graphics();
    this.sites = Array.from({ length: Object.values(hazardConfig).reduce((count, hazard) => count + hazard.count, 5) }, () =>
      scene.add.image(0, 0, sceneryAtlas, 'flux').setDepth(0.16).setVisible(false));
    this.effects = scene.add.graphics().setDepth(5);
    this.damageLabels = Array.from({ length: participantCount }, () => ({
      text: scene.add.text(0, 0, '', {
        fontFamily: 'Magnet Sans, system-ui, sans-serif', fontSize: '19px', fontStyle: 'bold',
        color: brand.arcade.pale, stroke: brand.arcade.ink, strokeThickness: 5,
      }).setOrigin(0.5).setDepth(6).setVisible(false),
      total: 0,
      theft: 0,
      elapsed: Infinity,
    }));
  }

  render(model: ArenaModel, bounds: WorldBounds, aim: number, tracked: Participant | undefined, quality: Quality,
      seconds: number, zoom: number, reducedMotion: boolean) {
    this.floor.clear();
    this.renderStructures(bounds, quality);
    this.effects.clear();
    let siteIndex = 0;
    for (const site of model.hazards?.sites ?? []) {
      const art = this.sites[siteIndex++];
      const { x, y, radius, kind } = site;
      art.setVisible(visible(site, bounds, radius + 15));
      if (!art.visible) continue;
      const cooling = kind === 'flux' && model.hazards?.discharged(site);
      this.floor.fillStyle(colors[kind], 0.17).fillCircle(x, y, radius);
      this.floor.lineStyle(5, ink, 0.24).strokeCircle(x, y, radius);
      this.floor.lineStyle(2.5, colors[kind], 0.84).strokeCircle(x, y, radius);
      if (art.frame.name !== kind) art.setFrame(kind);
      art.setPosition(x, y).setDisplaySize(radius * 1.96, radius * 1.96)
        .setAlpha(cooling ? 0.58 : 1);
      if (kind === 'flux' && !reducedMotion) art.rotation += seconds * (cooling ? 2 : 0.3);
      else art.rotation = 0;
    }
    for (; siteIndex < this.sites.length; siteIndex++) this.sites[siteIndex].setVisible(false);
    let shardIndex = 0;
    for (const chunk of model.salvage.chunks) {
      if (!visible(chunk, bounds, 55)) continue;
      const lift = chunk.age < theftConfig.flight ? 28 * Math.sin(Math.PI * chunk.age / theftConfig.flight) : 0;
      const tier = chunk.value >= 70 ? 3 : chunk.value >= 20 ? 2 : chunk.value >= 5 ? 1 : 0;
      const size = Math.min(52, Math.max(14 + 6 * tier, (5 + 2 * tier) / zoom));
      if (lift > 0 && !reducedMotion && quality !== 'low') {
        const progress = chunk.age / theftConfig.flight;
        this.effects.lineStyle(2 + tier, rgb(combatColor.impact), 0.55 * (1 - progress));
        this.effects.lineBetween(chunk.x, chunk.y - lift,
          chunk.x - (chunk.destination.x - chunk.origin.x) * Math.min(0.08, progress),
          chunk.y - lift - (chunk.destination.y - chunk.origin.y) * Math.min(0.08, progress) + 4);
        this.effects.fillStyle(rgb(brand.themes.light.ink), 0.25).fillEllipse(chunk.x, chunk.y + 3, size, size * 0.5);
      }
      const sprite = this.shards[shardIndex] ??= this.scene.add.image(0, 0, 'workshop', 'debris-0').setDepth(4);
      shardIndex++;
      const frame = debrisFrames[tier];
      if (sprite.frame.name !== frame) sprite.setFrame(frame);
      sprite.setPosition(chunk.x, chunk.y - (reducedMotion ? 0 : lift)).setDisplaySize(size, size)
        .setRotation(reducedMotion ? 0 : chunk.age * 4).setVisible(true);
      const expiring = chunk.age > theftConfig.lifetime - 1;
      sprite.setAlpha(expiring && !reducedMotion ? 0.72 + 0.28 * Math.cos(chunk.age * Math.PI * 3) : 1);
    }
    for (let i = shardIndex; i < this.visibleShards; i++) this.shards[i].setVisible(false);
    this.visibleShards = shardIndex;
    if (model.signal && visible(model.signal, bounds, 160)) {
      this.effects.lineStyle(4, rgb(brand.legacy.competition_view.color13), 0.8).strokeCircle(model.signal.x, model.signal.y, 120);
      this.effects.lineStyle(2, rgb(brand.legacy.competition_view.color13), 0.45).strokeCircle(model.signal.x, model.signal.y, 150);
    }
    for (const [index, participant] of model.participants.entries()) {
      this.renderDamage(index, participant, seconds, zoom, bounds, reducedMotion);
      const attack = participant.combat.attack;
      if (!visible(participant.position, bounds, theftConfig.reach + participant.radius)) continue;
      if (attack.phase === 'armed') this.cone(participant, participant === model.player ? aim : participant.heading, zoom, reducedMotion);
      if (attack.phase === 'warning') this.cone(participant, attack.bearing, zoom, reducedMotion, attack.remaining);
      if (participant.combat.energy === theftConfig.energy && attack.phase !== 'cooldown') {
        const { x, y } = participant.position;
        if (reducedMotion) this.effects.lineStyle(2, yellow, 0.86).strokeCircle(x, y, participant.radius + 8);
        else this.jaggedWave(x, y, participant.heading, 0.42, participant.radius + 8, 5, 2, 0.83, 6);
      }
      if (participant.combat.brittle || participant.combat.heat > 0.25) {
        this.effects.lineStyle(3, participant.combat.brittle ? colors.cold : colors.heat, 0.8)
          .strokeCircle(participant.position.x, participant.position.y, participant.radius + 5);
      }
      if (participant.combat.guardFor > 0) this.guard(participant);
    }
    if (tracked) this.effects.lineStyle(4, rgb(brand.legacy.competition_view.color15)).strokeCircle(tracked.position.x, tracked.position.y, tracked.radius + 12);
  }

  reset(): void {
    for (const sprite of this.shards) sprite.setVisible(false);
    this.visibleShards = 0;
    for (const label of this.damageLabels) {
      label.total = 0;
      label.theft = 0;
      label.elapsed = Infinity;
      label.impact = undefined;
      label.text.setVisible(false);
    }
  }

  private renderDamage(index: number, magnet: Participant, seconds: number, zoom: number,
      bounds: WorldBounds, reducedMotion: boolean): void {
    const label = this.damageLabels[index];
    const total = magnet.combat.lostToTheft + magnet.combat.lostToHazards;
    if (total > label.total) {
      label.impact = magnet.combat.lostToTheft > label.theft ? magnet.combat.impact : undefined;
      label.text.setText('−' + (total - label.total) + (label.impact?.brittle ? '  BRITTLE' : ''));
      label.elapsed = 0;
    }
    label.total = total;
    label.theft = magnet.combat.lostToTheft;
    label.elapsed += seconds;
    const { x, y } = magnet.position;
    const display = label.elapsed < brand.motion.damage / 1000 &&
      visible(magnet.position, bounds, Math.max(magnet.radius, label.impact?.radius ?? 0) + 85);
    label.text.setVisible(display);
    if (!display) return;
    const rise = reducedMotion ? 0 : label.elapsed * 28;
    label.text.setPosition(x, y - magnet.radius - (18 + rise) / zoom).setScale(1 / zoom)
      .setAlpha(reducedMotion ? 1 : Math.min(1, (brand.motion.damage / 1000 - label.elapsed) * 3));
    if (label.impact && !reducedMotion && label.elapsed < 0.34) {
      this.impact(label.impact, label.elapsed / 0.34);
    } else if (!label.impact && !reducedMotion && label.elapsed < 0.25) {
      this.effects.lineStyle(3, rgb(brand.legacy.competition_view.color16), 0.8 * (1 - label.elapsed / 0.25))
        .strokeCircle(x, y, magnet.radius + 6 + label.elapsed * 52);
    }
  }

  private guard(magnet: Participant): void {
    const { x, y } = magnet.position;
    const radius = magnet.radius + 13;
    this.effects.lineStyle(6, rgb(combatColor.guardEdge), 0.85).strokeCircle(x, y, radius);
    this.effects.lineStyle(3, rgb(combatColor.guard), 0.92);
    for (let side = 0; side < 4; side++) {
      const start = side * Math.PI / 2 + 0.12;
      this.effects.beginPath().arc(x, y, radius, start, start + 1.25, false).strokePath();
    }
  }

  private impact(impact: TheftImpact, progress: number): void {
    const { origin: { x, y }, bearing, radius, reduction } = impact;
    const span = Math.PI * 0.45;
    const strength = 1 - progress;
    const wave = radius * (0.76 + progress * 0.36) + 19 + progress * (58 + 100 * reduction);
    this.jaggedWave(x, y, bearing, span, wave, 7 + radius * 0.035, 3.8 + reduction * 7, strength, 14);
    const spokes = reduction >= 0.33 ? 3 : 2;
    for (let i = -spokes; i <= spokes; i++) {
      const angle = bearing + i * span / (spokes + 0.6);
      const root = radius * 0.58;
      const end = wave - 7 - 7 * Math.abs(i);
      this.effects.lineStyle(5, ink, strength * 0.72).beginPath().moveTo(x + Math.cos(angle) * root, y + Math.sin(angle) * root)
        .lineTo(x + Math.cos(angle + 0.12) * (root + end) / 2, y + Math.sin(angle + 0.12) * (root + end) / 2)
        .lineTo(x + Math.cos(angle) * end, y + Math.sin(angle) * end).strokePath();
      this.effects.lineStyle(2, yellow, strength).lineBetween(x + Math.cos(angle) * (end + 3), y + Math.sin(angle) * (end + 3),
        x + Math.cos(angle) * (wave + 19), y + Math.sin(angle) * (wave + 19));
    }
    if (progress < 0.45) this.flash(x + Math.cos(bearing) * radius * 0.64,
      y + Math.sin(bearing) * radius * 0.64, (19 + 40 * reduction) * strength, bearing, strength);
  }

  private renderStructures(bounds: WorldBounds, quality: Quality) {
    let mask = 0;
    for (const [index, district] of districts.entries()) if (visible(district, bounds, 900)) mask |= 1 << index;
    if (mask === this.districtMask && quality === this.structureQuality) return;
    this.districtMask = mask;
    this.structureQuality = quality;
    this.structures.clear();
    for (const prop of this.props) prop.setVisible(false);
    let propIndex = 0;
    for (const [index, { x, y, accent, mark }] of districts.entries()) {
      if ((mask & (1 << index)) === 0) continue;
      this.structures.fillStyle(accent, 0.08).fillRoundedRect(x - 690, y - 440, 1380, 880, 90);
      this.structures.lineStyle(6, accent, 0.19).strokeRoundedRect(x - 690, y - 440, 1380, 880, 90);
      const count = quality === 'low' ? 2 : propOffsets.length;
      for (let i = 0; i < count; i++) {
        const [dx, dy] = propOffsets[i];
        const px = x + dx;
        const py = y + dy;
        const size = i === 0 ? 200 : i === 2 ? 132 : 158;
        this.props[propIndex++].setFrame(propFrames[mark][i]).setPosition(px, py).setDisplaySize(size, size)
          .setAlpha(i === 0 ? 0.57 : 0.44).setRotation(i === 1 ? -0.09 : 0).setVisible(true);
        this.structures.fillStyle(accent, 0.11).fillRoundedRect(px - size * 0.45, py - size * 0.38, size * 0.9, size * 0.76, 18);
        this.structures.fillStyle(yellow, 0.23);
        for (let stripe = -2; stripe <= 2; stripe++) {
          const start = px + stripe * 19;
          this.structures.fillTriangle(start - 7, py + size * 0.4, start + 7, py + size * 0.4, start, py + size * 0.4 + 7);
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

  private cone(magnet: Participant, aim: number, zoom: number, reducedMotion: boolean, warningLeft?: number) {
    const { x, y } = magnet.position;
    const radius = theftConfig.reach + magnet.radius;
    const color = warningLeft === undefined ? yellow : orange;
    this.effects.fillStyle(color, warningLeft === undefined ? 0.09 : 0.15).lineStyle(3.2, color, 0.82);
    this.effects.beginPath().moveTo(x, y);
    this.effects.arc(x, y, radius, aim - theftConfig.halfAngle, aim + theftConfig.halfAngle, false);
    this.effects.closePath().fillPath().strokePath();
    if (reducedMotion) return;
    if (warningLeft === undefined) {
      this.jaggedWave(x, y, aim, .5, magnet.radius + 17, 6, 2.8, .8, 8);
      return;
    }
    const progress = 1 - warningLeft / theftConfig.warning;
    const travel = magnet.radius + progress * theftConfig.reach;
    this.jaggedWave(x, y, aim, theftConfig.halfAngle * .96, travel, 6 + magnet.radius * 0.022, 5, .92, 16);
    const count = 4;
    this.effects.lineStyle(3, white, 0.7);
    for (let i = 0; i < count; i++) {
      const angle = aim + (i / (count - 1) - .5) * 1.5;
      const start = Math.max(magnet.radius, travel - 43 - 8 * i);
      this.effects.lineBetween(x + Math.cos(angle) * start, y + Math.sin(angle) * start,
        x + Math.cos(angle) * travel, y + Math.sin(angle) * travel);
    }
    if (progress < 0.5) {
      const flashDistance = magnet.radius * 0.92 + 6;
      this.flash(x + Math.cos(aim) * flashDistance, y + Math.sin(aim) * flashDistance,
        Math.min(39 / zoom, 25 + magnet.radius * 0.21) * (1 - progress), aim, 0.95);
    }
  }

  private jaggedWave(x: number, y: number, aim: number, span: number, radius: number, tooth: number,
      width: number, alpha: number, segments: number): void {
    this.effects.beginPath();
    for (let i = 0; i <= segments; i++) {
      const angle = aim - span + i * 2 * span / segments;
      const distance = radius + (i % 2 === 0 ? 0 : -tooth);
      const px = x + Math.cos(angle) * distance;
      const py = y + Math.sin(angle) * distance;
      if (i === 0) this.effects.moveTo(px, py);
      else this.effects.lineTo(px, py);
    }
    this.effects.lineStyle(width + 6, ink, alpha).strokePath();
    this.effects.lineStyle(width + 3, red, alpha).strokePath();
    this.effects.lineStyle(width, yellow, alpha).strokePath();
    this.effects.lineStyle(Math.max(1, width / 2.8), white, alpha).strokePath();
  }

  private flash(x: number, y: number, radius: number, angle: number, alpha: number): void {
    for (const [scale, fill] of [[1, orange], [0.69, yellow], [0.41, white]]) {
      this.effects.beginPath();
      for (let i = 0; i < 16; i++) {
        const ray = angle + i * Math.PI / 8;
        const length = radius * scale * (i % 2 === 0 ? 1 + (i % 4) * 0.07 : 0.46);
        const px = x + Math.cos(ray) * length;
        const py = y + Math.sin(ray) * length;
        if (i === 0) this.effects.moveTo(px, py);
        else this.effects.lineTo(px, py);
      }
      this.effects.fillStyle(fill, alpha).closePath().fillPath();
      if (scale === 1) this.effects.lineStyle(3, ink, alpha).strokePath();
    }
  }
}
