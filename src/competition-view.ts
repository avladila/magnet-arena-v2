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
const combatColor = brand.combatVisual;

const colors: Record<HazardKind, number> = {
  flux: rgb(brand.roles.flux), heat: rgb(brand.roles.heat), water: rgb(brand.roles.water), acid: rgb(brand.roles.acid), cold: rgb(brand.roles.cold),
};

function visible({ x, y }: Point, bounds: WorldBounds, radius: number) {
  return x >= bounds.left - radius && x <= bounds.right + radius &&
    y >= bounds.top - radius && y <= bounds.bottom + radius;
}

export class CompetitionView {
  private readonly structures: Phaser.GameObjects.Graphics;
  private readonly props: Phaser.GameObjects.Image[];
  private readonly floor: Phaser.GameObjects.Graphics;
  private readonly sites: Phaser.GameObjects.Image[];
  private readonly shards: Phaser.GameObjects.Image[] = [];
  private visibleShards = 0;
  private readonly effects: Phaser.GameObjects.Graphics;
  private readonly damageLabels: { text: Phaser.GameObjects.Text; total: number; theft: number; elapsed: number; impact?: TheftImpact }[];

  constructor(private readonly scene: Phaser.Scene, participantCount: number) {
    this.structures = scene.add.graphics();
    this.props = Array.from({ length: districts.length * 4 }, () => scene.add.image(0, 0, 'workshop', 'prop-grate')
      .setAlpha(0.21).setVisible(false));
    this.floor = scene.add.graphics();
    this.sites = Array.from({ length: Object.values(hazardConfig).reduce((count, hazard) => count + hazard.count, 5) }, () => scene.add.image(0, 0, 'workshop', 'flux').setVisible(false));
    this.effects = scene.add.graphics().setDepth(5);
    this.damageLabels = Array.from({ length: participantCount }, () => ({
      text: scene.add.text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold',
        color: brand.legacy.competition_view.color6, stroke: brand.legacy.competition_view.color7, strokeThickness: 4,
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
      this.floor.fillStyle(colors[kind], 0.18).fillCircle(x, y, radius);
      this.floor.lineStyle(3, colors[kind], 0.78).strokeCircle(x, y, radius);
      art.setFrame(kind).setPosition(x, y).setDisplaySize(radius * 1.7, radius * 1.7)
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
      if (attack.phase === 'armed') this.cone(participant, participant === model.player ? aim : participant.heading, false);
      if (attack.phase === 'warning') this.cone(participant, attack.bearing, true, attack.remaining);
      if (participant.combat.energy === theftConfig.energy && attack.phase !== 'cooldown') {
        this.effects.lineStyle(2, rgb(brand.legacy.competition_view.color14), 0.78)
          .strokeCircle(participant.position.x, participant.position.y, participant.radius + 11);
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
    const wave = radius * (0.76 + progress * 0.43) + 30 + progress * 90;
    this.effects.lineStyle(5 + reduction * 8, rgb(combatColor.fracture), strength * 0.75)
      .beginPath().arc(x, y, wave, bearing - span, bearing + span, false).strokePath();
    this.effects.lineStyle(2 + reduction * 4, rgb(combatColor.impact), strength)
      .beginPath().arc(x, y, wave - 3, bearing - span * 0.86, bearing + span * 0.86, false).strokePath();
    for (let i = -2; i <= 2; i++) {
      const angle = bearing + i * 0.5;
      const root = radius * 0.58;
      const end = wave - 12 - 9 * Math.abs(i);
      this.effects.beginPath().moveTo(x + Math.cos(angle) * root, y + Math.sin(angle) * root)
        .lineTo(x + Math.cos(angle + 0.12) * (root + end) / 2, y + Math.sin(angle + 0.12) * (root + end) / 2)
        .lineTo(x + Math.cos(angle) * end, y + Math.sin(angle) * end).strokePath();
    }
  }

  private renderStructures(bounds: WorldBounds, quality: Quality) {
    this.structures.clear();
    for (const prop of this.props) prop.setVisible(false);
    if (quality === 'low') return;
    let propIndex = 0;
    for (const { x, y, accent, mark } of districts) {
      if (!visible({ x, y }, bounds, 980)) continue;
      this.structures.lineStyle(12, accent, 0.14).strokeRoundedRect(x - 780, y - 560, 1560, 1120, 90);
      this.structures.lineStyle(2, accent, 0.22).strokeRoundedRect(x - 796, y - 576, 1592, 1152, 100);
      for (const dx of [-620, 620]) for (const dy of [-415, 415]) {
        const px = x + dx;
        const py = y + dy;
        const frame = mark === 'cooling' || mark === 'chemical' ? 'prop-drain' : 'prop-grate';
        this.props[propIndex++].setFrame(frame).setPosition(px, py).setDisplaySize(200, 144).setVisible(true);
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
    const color = warning ? rgb(brand.legacy.competition_view.color17) : rgb(brand.legacy.competition_view.color18);
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
