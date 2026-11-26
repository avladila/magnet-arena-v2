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
import { salvageEligible } from './salvage';
import { angleBetween, bearingTo, combatShell, gapBetween } from './combat';
import { FracturePlates, impactStyle } from './combat-effects';

const debrisFrames = ['debris-0', 'debris-1', 'debris-2', 'debris-3'];
export const sceneryAtlas = 'scenery';
const combatColor = brand.combatVisual;
const ink = rgb(brand.arcade.ink);
const white = rgb(brand.arcade.white);
const yellow = rgb(brand.arcade.yellow);
const orange = rgb(brand.arcade.orange);
const red = rgb(brand.arcade.red);
const cyan = rgb(brand.arcade.cyan);
const propOffsets = [[-390, -242], [407, -210], [-160, 350], [540, 231], [-770, 147], [782, -140]];
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
const hazardPeriods: Record<HazardKind, number> = { heat: 0.64, cold: 2.4, water: 1.8, acid: 1.64, flux: 0.92 };
const motionFrames = Object.fromEntries(Object.keys(colors).map((kind) =>
  [kind, Array.from({ length: 4 }, (_, index) => kind + '-motion-' + index)])) as Record<HazardKind, string[]>;
type FailureType = 'guard' | 'core' | 'miss';
type AttackMark = { bearing: number; guarded: number; protected: number; misses: number;
  notice?: { kind: FailureType; x: number; y: number; age: number } };

function visible({ x, y }: Point, bounds: WorldBounds, radius: number) {
  return x >= bounds.left - radius && x <= bounds.right + radius &&
    y >= bounds.top - radius && y <= bounds.bottom + radius;
}

export class CompetitionView {
  private readonly structures: Phaser.GameObjects.Graphics;
  private readonly props: Phaser.GameObjects.Image[];
  private readonly pads: Phaser.GameObjects.Image[];
  private districtMask = -1;
  private structureQuality?: Quality;
  private readonly floor: Phaser.GameObjects.Graphics;
  private readonly sites: Phaser.GameObjects.Image[];
  private readonly hazardMotion: Phaser.GameObjects.Image[] = [];
  private visibleHazardMotion = 0;
  private clock = 0;
  private readonly shards: Phaser.GameObjects.Image[] = [];
  private visibleShards = 0;
  private readonly effects: Phaser.GameObjects.Graphics;
  private readonly plates: FracturePlates;
  private readonly attackMarks: AttackMark[];
  private readonly damageLabels: { text: Phaser.GameObjects.Text; total: number; theft: number; elapsed: number; impact?: TheftImpact }[];

  constructor(private readonly scene: Phaser.Scene, participantCount: number) {
    this.structures = scene.add.graphics();
    this.pads = districts.map(({ x, y, mark }) => scene.add.image(x, y, sceneryAtlas, 'floor-' + mark)
      .setDepth(0.03).setDisplaySize(2480, 1870).setAlpha(0.58).setVisible(false));
    this.props = Array.from({ length: districts.length * propOffsets.length }, () => scene.add.image(0, 0, sceneryAtlas, 'prop-grate')
      .setDepth(0.08).setVisible(false));
    this.floor = scene.add.graphics();
    this.sites = Array.from({ length: Object.values(hazardConfig).reduce((count, hazard) => count + hazard.count, 5) }, () =>
      scene.add.image(0, 0, sceneryAtlas, 'flux').setDepth(0.16).setVisible(false));
    this.effects = scene.add.graphics().setDepth(5);
    this.plates = new FracturePlates(scene);
    this.attackMarks = Array.from({ length: participantCount }, () => ({ bearing: 0, misses: 0, guarded: 0, protected: 0 }));
    this.damageLabels = Array.from({ length: participantCount }, () => ({
      text: scene.add.text(0, 0, '', {
        fontFamily: 'Magnet Sans, system-ui, sans-serif', fontSize: '19px', fontStyle: 'bold',
        color: brand.arcade.pale, stroke: brand.arcade.ink, strokeThickness: 5, resolution: 2,
      }).setOrigin(0.5).setDepth(6).setVisible(false),
      total: 0,
      theft: 0,
      elapsed: Infinity,
    }));
  }

  render(model: ArenaModel, bounds: WorldBounds, aim: number, tracked: Participant | undefined, quality: Quality,
      seconds: number, zoom: number, reducedMotion: boolean) {
    this.clock += seconds;
    this.floor.clear();
    this.renderStructures(bounds, quality);
    this.effects.clear();
    this.renderOpportunities(model, bounds, zoom, reducedMotion);
    let siteIndex = 0;
    let animated = 0;
    const motionLimit = reducedMotion ? 0 : quality === 'high' ? 16 : quality === 'balanced' ? 9 : 0;
    for (const site of model.hazards?.sites ?? []) {
      const art = this.sites[siteIndex++];
      const { x, y, radius, kind } = site;
      art.setVisible(visible(site, bounds, radius + 15));
      if (!art.visible) continue;
      const cooling = kind === 'flux' && model.hazards?.discharged(site);
      const hue = colors[kind];
      this.floor.fillStyle(hue, cooling ? 0.08 : 0.15).fillCircle(x, y, radius);
      this.floor.lineStyle(4.7 / zoom, ink, 0.28).strokeCircle(x, y, radius);
      this.floor.lineStyle(1.7 / zoom, hue, cooling ? 0.40 : 0.87).strokeCircle(x, y, radius);
      const frame = cooling ? 'flux-drained' : kind;
      if (art.frame.name !== frame) art.setFrame(frame);
      art.setPosition(x, y).setDisplaySize(radius * 1.96, radius * 1.96)
        .setAlpha(cooling ? 0.73 : 1);
      if (kind === 'flux' && !reducedMotion && quality !== 'low') art.rotation += seconds * (cooling ? 1.3 : 0.34);
      else art.rotation = 0;
      if (animated < motionLimit && radius * zoom > 10) {
        const offset = ((x + y) % 73) / 73;
        const phase = (this.clock / hazardPeriods[kind] + offset) % 1;
        const motion = this.hazardMotion[animated++] ??= this.scene.add.image(0, 0, sceneryAtlas, frame).setDepth(0.18);
        if (cooling) {
          motion.setVisible(false);
          this.floor.lineStyle(1.7 / zoom, cyan, 0.60).strokeCircle(x, y, radius * 0.74);
        } else {
          const cel = motionFrames[kind][Math.floor(phase * 4)];
          if (motion.frame.name !== cel) motion.setFrame(cel);
          motion.setPosition(x, y).setDisplaySize(radius * 1.96, radius * 1.96).setRotation(art.rotation)
            .setAlpha(kind === 'flux' ? 0.65 : 0.84).setVisible(true);
        }
      }
    }
    for (; siteIndex < this.sites.length; siteIndex++) this.sites[siteIndex].setVisible(false);
    for (let index = animated; index < this.visibleHazardMotion; index++) this.hazardMotion[index].setVisible(false);
    this.visibleHazardMotion = animated;
    let shardIndex = 0;
    let gleams = quality === 'low' ? 7 : 14;
    let trails = quality === 'low' ? 12 : 48;
    for (const chunk of model.salvage.chunks) {
      if (!visible(chunk, bounds, 55)) continue;
      const airborne = chunk.age < theftConfig.flight;
      const collectable = salvageEligible(chunk, model.player.id);
      const lift = airborne ? 28 * Math.sin(Math.PI * chunk.age / theftConfig.flight) : 0;
      const tier = chunk.value >= 70 ? 3 : chunk.value >= 20 ? 2 : chunk.value >= 5 ? 1 : 0;
      const size = Math.min(52, Math.max(14 + 6 * tier, (5 + 2 * tier) / zoom));
      if (airborne && !reducedMotion && trails > 0) {
        trails--;
        const progress = chunk.age / theftConfig.flight;
        this.effects.lineStyle(2 + tier, tier >= 2 ? yellow : white, 0.76 * Math.sin(Math.PI * progress));
        this.effects.lineBetween(chunk.x, chunk.y - lift,
          chunk.x - (chunk.destination.x - chunk.origin.x) * Math.min(0.08, progress),
          chunk.y - lift - (chunk.destination.y - chunk.origin.y) * Math.min(0.08, progress) + 4);
        this.floor.fillStyle(ink, 0.32).fillEllipse(chunk.x, chunk.y + 3, size, size * 0.5);
      }
      if (collectable && tier >= 2 && gleams > 0) {
        gleams--;
        const opacity = reducedMotion ? 0.66 : 0.59 + 0.24 * Math.cos((chunk.age + chunk.origin.x * 0.03) * 5);
        const glint = size * (tier === 3 ? 0.25 : 0.17);
        const x = chunk.x + size * 0.46;
        const y = chunk.y - size * 0.33;
        this.floor.fillStyle(yellow, 0.13 + tier * 0.04).fillCircle(chunk.x, chunk.y, size * 0.75);
        this.effects.lineStyle(Math.max(1.5, glint / 4), ink, opacity);
        this.effects.lineBetween(x - glint, y, x + glint, y).lineBetween(x, y - glint, x, y + glint);
        this.effects.lineStyle(Math.max(1, glint / 6), white, opacity);
        this.effects.lineBetween(x - glint, y, x + glint, y).lineBetween(x, y - glint, x, y + glint);
      }
      const sprite = this.shards[shardIndex] ??= this.scene.add.image(0, 0, 'workshop', 'debris-0').setDepth(4);
      shardIndex++;
      const frame = debrisFrames[tier];
      if (sprite.frame.name !== frame) sprite.setFrame(frame);
      sprite.setPosition(chunk.x, chunk.y - (reducedMotion ? 0 : lift)).setDisplaySize(size, size)
        .setRotation(reducedMotion ? 0 : Math.min(chunk.age, theftConfig.flight) * 4).setVisible(true);
      const expiring = chunk.age > theftConfig.lifetime - 1;
      const fade = expiring && !reducedMotion ? 0.78 + 0.22 * Math.cos(chunk.age * Math.PI * 3) : 1;
      sprite.setAlpha(fade * (collectable ? 1 : airborne ? 0.86 : 0.52));
    }
    for (let i = shardIndex; i < this.visibleShards; i++) this.shards[i].setVisible(false);
    this.visibleShards = shardIndex;
    let greatestImpact = 0;
    for (const [index, participant] of model.participants.entries()) {
      greatestImpact = Math.max(greatestImpact, this.renderDamage(index, participant, seconds, zoom, bounds, reducedMotion, quality));
      this.renderAttackMark(index, participant, model.participants, bounds, seconds, zoom, reducedMotion);
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
    this.plates.render(bounds, seconds, zoom, reducedMotion);
    if (tracked) this.effects.lineStyle(4, rgb(brand.legacy.competition_view.color15)).strokeCircle(tracked.position.x, tracked.position.y, tracked.radius + 12);
    return impactStyle(greatestImpact).grade;
  }

  private renderOpportunities(model: ArenaModel, bounds: WorldBounds, zoom: number, reducedMotion: boolean): void {
    for (const spot of model.hotspots) {
      if (spot.strength <= 0 || !visible(spot, bounds, spot.radius)) continue;
      this.floor.fillStyle(cyan, 0.045 * spot.strength).fillCircle(spot.x, spot.y, spot.radius);
      for (let quarter = 0; quarter < 4; quarter++) {
        const angle = quarter * Math.PI / 2 + Math.PI / 8;
        this.floor.beginPath().arc(spot.x, spot.y, spot.radius * 0.91, angle, angle + Math.PI / 4, false);
        this.floor.lineStyle(5 / zoom, ink, 0.24 * spot.strength).strokePath();
        this.floor.lineStyle(2 / zoom, cyan, 0.54 * spot.strength).strokePath();
        if (!reducedMotion) {
          const sweep = angle + (this.clock * 0.25 + quarter * 0.13) % 0.73;
          this.floor.beginPath().arc(spot.x, spot.y, spot.radius * 0.91, sweep, sweep + 0.035, false)
            .lineStyle(3.5 / zoom, cyan, 0.78 * spot.strength).strokePath();
        }
      }
    }
    const signal = model.signal;
    if (!signal || !visible(signal, bounds, 160)) return;
    const { x, y } = signal;
    this.floor.fillStyle(yellow, 0.12).fillCircle(x, y, 126);
    this.floor.lineStyle(5 / zoom, ink, 0.76).strokeCircle(x, y, 126);
    this.floor.lineStyle(2.5 / zoom, yellow, 0.96).strokeCircle(x, y, 126);
    const size = 17 / zoom;
    this.floor.fillStyle(ink, 0.91).fillRoundedRect(x - size, y - size * 0.61, size * 2, size * 1.22, size * 0.25);
    this.floor.lineStyle(2 / zoom, yellow, 0.96).lineBetween(x - size * 0.57, y + size * 0.37, x + size * 0.57, y + size * 0.37);
    for (const offset of [-0.41, 0.41]) {
      this.floor.fillStyle(yellow, 1).fillTriangle(x + size * offset, y + size * 0.20,
        x + size * (offset - 0.29), y - size * 0.29, x + size * (offset + 0.29), y - size * 0.29);
    }
  }

  reset(): void {
    this.clock = 0;
    this.plates.reset();
    for (const motion of this.hazardMotion) motion.setVisible(false);
    this.visibleHazardMotion = 0;
    for (const mark of this.attackMarks) {
      mark.bearing = 0;
      mark.guarded = mark.protected = mark.misses = 0;
      mark.notice = undefined;
    }
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
      bounds: WorldBounds, reducedMotion: boolean, quality: Quality): number {
    const label = this.damageLabels[index];
    const total = magnet.combat.lostToTheft + magnet.combat.lostToHazards;
    let reduction = 0;
    if (total > label.total) {
      label.impact = magnet.combat.lostToTheft > label.theft ? magnet.combat.impact : undefined;
      reduction = label.impact?.reduction ?? 0;
      const grade = impactStyle(reduction).grade;
      label.text.setText('−' + (total - label.total) + (label.impact?.brittle ? '  BRITTLE' : ''))
        .setFontSize(grade === 'fracture' ? 26 : grade === 'heavy' ? 22 : 18)
        .setColor(label.impact?.brittle ? brand.arcade.cyan : reduction >= .25 ? brand.arcade.yellow : brand.arcade.white);
      if (label.impact && !reducedMotion && visible(label.impact.origin, bounds, label.impact.radius + 85)) {
        this.plates.emit(label.impact, quality);
      }
      label.elapsed = 0;
    }
    label.total = total;
    label.theft = magnet.combat.lostToTheft;
    label.elapsed += seconds;
    const { x, y } = magnet.position;
    const display = label.elapsed < brand.motion.damage / 1000 &&
      visible(magnet.position, bounds, Math.max(magnet.radius, label.impact?.radius ?? 0) + 85);
    label.text.setVisible(display);
    if (!display) return 0;
    const rise = reducedMotion ? 0 : label.elapsed * 28;
    label.text.setPosition(x, y - magnet.radius - (18 + rise) / zoom).setScale(1 / zoom)
      .setAlpha(reducedMotion ? 1 : Math.min(1, (brand.motion.damage / 1000 - label.elapsed) * 3));
    if (label.impact && !reducedMotion && label.elapsed < impactStyle(label.impact.reduction).seconds) {
      const style = impactStyle(label.impact.reduction);
      this.impact(label.impact, label.elapsed / style.seconds, style, zoom);
    } else if (!label.impact && !reducedMotion && label.elapsed < 0.25) {
      this.effects.lineStyle(3, rgb(brand.legacy.competition_view.color16), 0.8 * (1 - label.elapsed / 0.25))
        .strokeCircle(x, y, magnet.radius + 6 + label.elapsed * 52);
    }
    return reduction;
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

  private renderAttackMark(index: number, attacker: Participant, participants: readonly Participant[], bounds: WorldBounds,
      seconds: number, zoom: number, reducedMotion: boolean): void {
    const mark = this.attackMarks[index];
    const state = attacker.combat;
    if (state.attack.phase === 'warning') mark.bearing = state.attack.bearing;
    const outcome = state.guarded > mark.guarded ? 'guard' : state.protectedHits > mark.protected ? 'core'
      : state.misses > mark.misses ? 'miss' : undefined;
    mark.guarded = state.guarded;
    mark.protected = state.protectedHits;
    mark.misses = state.misses;
    if (outcome) {
      const reach = attacker.radius + theftConfig.reach * 0.70;
      let x = attacker.position.x + Math.cos(mark.bearing) * reach;
      let y = attacker.position.y + Math.sin(mark.bearing) * reach;
      let nearest = theftConfig.reach + 1;
      if (outcome !== 'miss') {
        for (const victim of participants) {
          if (victim === attacker || (outcome === 'guard' ? victim.combat.guardFor <= 0 : combatShell(victim) > 0)) continue;
          const direction = bearingTo(attacker.position, victim.position);
          const gap = gapBetween(attacker, victim);
          if (gap >= nearest || angleBetween(direction, mark.bearing) > theftConfig.halfAngle) continue;
          nearest = gap;
          x = victim.position.x - Math.cos(direction) * victim.radius;
          y = victim.position.y - Math.sin(direction) * victim.radius;
        }
      }
      mark.notice = { kind: outcome, x, y, age: 0 };
    }
    const notice = mark.notice;
    if (!notice) return;
    notice.age += seconds;
    if (notice.age >= 0.25) {
      mark.notice = undefined;
      return;
    }
    if (!visible(notice, bounds, 45)) return;
    const { x, y, kind } = notice;
    const progress = reducedMotion ? 0 : notice.age / 0.25;
    const alpha = 1 - progress;
    const size = (7 + 13 * progress) / zoom;
    if (kind === 'guard') {
      this.effects.beginPath().arc(x, y, size, mark.bearing + 1.5, mark.bearing + 4.8)
        .lineStyle(4.4 / zoom, rgb(combatColor.guardEdge), alpha).strokePath();
      this.effects.lineStyle(2 / zoom, cyan, alpha).strokePath();
    } else if (kind === 'core') {
      this.effects.lineStyle(3 / zoom, ink, alpha).strokeRect(x - size / 2, y - size / 2, size, size);
      this.effects.lineStyle(1.7 / zoom, white, alpha).strokeRect(x - size / 2, y - size / 2, size, size);
    } else {
      this.effects.lineStyle(1.8 / zoom, orange, alpha * 0.7).beginPath().arc(x, y, size,
        mark.bearing - 0.52, mark.bearing + 0.52).strokePath();
    }
  }

  private impact(impact: TheftImpact, progress: number, style: ReturnType<typeof impactStyle>, zoom: number): void {
    const { origin: { x, y }, bearing, radius, reduction } = impact;
    const span = Math.PI * (0.24 + 0.41 * reduction);
    const strength = 1 - progress;
    const wave = radius * (0.76 + progress * 0.36) + 19 + progress * (58 + 100 * reduction);
    if (style.grade === 'light') {
      const hit = radius * (0.8 + 0.34 * progress);
      this.flash(x + Math.cos(bearing) * hit, y + Math.sin(bearing) * hit, Math.min(13 / zoom, 19) * strength,
        bearing, strength);
      return;
    }
    this.jaggedWave(x, y, bearing, span, wave, 7 + radius * 0.035, style.width / Math.sqrt(zoom), strength, 14);
    if (style.grade === 'fracture' && progress < 0.71) {
      this.jaggedWave(x, y, bearing, span * 0.82, radius * (0.67 + progress * 0.29), 13, 2.3 / zoom, strength * 0.62, 10);
    }
    const spokes = style.spokes;
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
    for (const [index, district] of districts.entries()) if (visible(district, bounds, 1230)) mask |= 1 << index;
    if (mask === this.districtMask && quality === this.structureQuality) return;
    this.districtMask = mask;
    this.structureQuality = quality;
    this.structures.clear();
    for (const prop of this.props) prop.setVisible(false);
    let propIndex = 0;
    for (const [index, { x, y, accent, mark }] of districts.entries()) {
      const shown = (mask & (1 << index)) !== 0;
      this.pads[index].setVisible(shown);
      if (!shown) continue;
      const count = quality === 'low' ? 2 : quality === 'balanced' ? 4 : propOffsets.length;
      for (let i = 0; i < count; i++) {
        const [dx, dy] = propOffsets[i];
        const px = x + dx;
        const py = y + dy;
        const size = i === 0 ? 229 : i === 2 ? 142 : 169;
        const frames = propFrames[mark];
        this.props[propIndex++].setFrame(frames[i % frames.length]).setPosition(px, py).setDisplaySize(size, size)
          .setAlpha(i === 0 ? 0.52 : 0.39).setRotation((i - 1) * 0.13).setVisible(true);
        this.structures.fillStyle(accent, 0.13).fillRoundedRect(px - size * 0.45, py - size * 0.35, size * 0.9, size * 0.70, 17);
        this.structures.lineStyle(3.2, accent, 0.18).lineBetween(px - size * 0.43, py + size * 0.36,
          px + size * 0.48, py + size * 0.36);
      }
    }
  }

  private cone(magnet: Participant, aim: number, zoom: number, reducedMotion: boolean, warningLeft?: number) {
    const { x, y } = magnet.position;
    const radius = theftConfig.reach + magnet.radius;
    const color = warningLeft === undefined ? yellow : orange;
    this.effects.fillStyle(color, warningLeft === undefined ? 0.065 : 0.15).lineStyle(4.0 / zoom, ink, 0.72);
    this.effects.beginPath().moveTo(x, y);
    this.effects.arc(x, y, radius, aim - theftConfig.halfAngle, aim + theftConfig.halfAngle, false);
    this.effects.closePath().fillPath().strokePath();
    this.effects.lineStyle(2.15 / zoom, color, 0.91).strokePath();
    if (reducedMotion) return;
    if (warningLeft === undefined) {
      this.jaggedWave(x, y, aim, .5, magnet.radius + 11, 5, 2.1, .76, 8);
      const forward = aim + Math.sin(this.clock * 13) * 0.09;
      this.jaggedWave(x, y, forward, .42, magnet.radius * 0.87, 4, 1.6 / zoom, .76, 7);
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
