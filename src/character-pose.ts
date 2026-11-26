import type { Attack } from './combat-state';
import { theftConfig } from './competition-config';
import { playerConfig } from './config';
import type { Participant } from './movement';

export type Expression = 'idle' | 'move' | 'collect' | 'ready' | 'attack' | 'hit' | 'hurt' | 'hot' | 'cold' | 'rust';
export type CharacterIntent = 'pursuit' | 'escape';

const reactionSeconds = 0.4;
const recoilSeconds = 0.22;
const collectingSeconds = 0.29;
const settleSeconds = 0.13;

export class CharacterPose {
  expression: Expression = 'idle';
  stretchX = 1;
  stretchY = 1;
  recoil = 0;
  markProgress = 0;
  blink = false;
  private clock = 0;
  private lastLoss = 0;
  private lastPickups = 0;
  private lastSalvage = 0;
  private previousAttack: Attack['phase'] = 'idle';
  private hitFor = 0;
  private collectFor = 0;
  private recoilFor = 0;
  private takeoffFor = 0;
  private settleFor = 0;
  private moving = false;
  private injury?: { until: number; mass: number };

  update(magnet: Participant, seconds: number, reducedMotion: boolean, intent?: CharacterIntent): void {
    const state = magnet.combat;
    this.clock += seconds;
    const loss = state.lostToTheft + state.lostToHazards;
    const damage = loss - this.lastLoss;
    this.lastLoss = loss;
    if (damage > 0) {
      this.hitFor = reactionSeconds;
      if (damage >= 10 && damage / (magnet.mass + damage) >= 0.24) {
        this.injury = { until: this.clock + 12, mass: magnet.mass + Math.ceil(damage * 0.66) };
      }
    } else this.hitFor = Math.max(0, this.hitFor - seconds);
    if (this.injury && (this.injury.mass <= magnet.mass || this.injury.until <= this.clock)) this.injury = undefined;
    const pickups = magnet.pickupsCollected;
    if (pickups > this.lastPickups || state.salvage > this.lastSalvage) this.collectFor = collectingSeconds;
    else this.collectFor = Math.max(0, this.collectFor - seconds);
    this.lastPickups = pickups;
    this.lastSalvage = state.salvage;
    const phase = state.attack.phase;
    this.recoilFor = phase === 'warning' && this.previousAttack !== 'warning' ? recoilSeconds : Math.max(0, this.recoilFor - seconds);
    this.previousAttack = phase;

    const speed = Math.hypot(magnet.velocity.x, magnet.velocity.y);
    const moving = speed > 18;
    this.takeoffFor = moving && !this.moving ? 0.12 : Math.max(0, this.takeoffFor - seconds);
    this.settleFor = !moving && this.moving ? settleSeconds : Math.max(0, this.settleFor - seconds);
    this.moving = moving;
    if (this.hitFor > 0) this.expression = 'hit';
    else if (phase === 'armed' || phase === 'warning' || this.recoilFor > 0) this.expression = 'attack';
    else if (state.heat >= 0.24) this.expression = 'hot';
    else if (state.brittle || state.cold >= 0.45) this.expression = 'cold';
    else if (state.corrosion) this.expression = 'rust';
    else if (this.injury) this.expression = 'hurt';
    else if (state.energy === theftConfig.energy && phase === 'idle') this.expression = 'ready';
    else if (this.collectFor > 0) this.expression = 'collect';
    else this.expression = moving ? 'move' : 'idle';

    this.stretchX = 1;
    this.stretchY = 1;
    this.recoil = 0;
    this.markProgress = 0;
    this.blink = false;
    if (reducedMotion) return;
    const offset = (magnet.id.charCodeAt(magnet.id.length - 1) % 9) * 0.47;
    const blinkPeriod = 3.7 + offset * 0.31;
    this.blink = (this.expression === 'idle' || this.expression === 'move' && !intent) &&
      (this.clock + offset) % blinkPeriod > blinkPeriod - 0.12;
    this.markProgress = this.hitFor > 0 ? 1 - this.hitFor / reactionSeconds : this.clock * 0.8 + offset;
    const heavy = Math.min(1, (magnet.physicalScale - 1) / 8);
    const tension = Math.min(1, speed / playerConfig.speed) * (0.068 - 0.032 * heavy);
    if (this.hitFor > 0) {
      const hit = (this.hitFor / reactionSeconds) ** 3;
      this.stretchX -= 0.16 * hit;
      this.stretchY += 0.13 * hit;
    } else if (this.recoilFor > 0) {
      const force = (this.recoilFor / recoilSeconds) ** 2;
      this.stretchX -= 0.12 * force;
      this.stretchY += 0.085 * force;
      this.recoil = 7 * force;
    } else if (phase === 'armed') {
      this.stretchX -= 0.085;
      this.stretchY += 0.052;
    } else if (this.collectFor > 0 && this.expression === 'collect') {
      const bounce = Math.sin(Math.PI * this.collectFor / collectingSeconds) * 0.07;
      this.stretchX += bounce;
      this.stretchY -= bounce * 0.65;
    } else {
      const breath = this.expression === 'idle' ? Math.sin(this.clock * 2.65 + offset) * (0.018 - 0.010 * heavy) : 0;
      const compression = moving ? this.takeoffFor / 0.12 * 0.024 : 0;
      const settling = !moving ? Math.sin(Math.PI * this.settleFor / settleSeconds) * 0.029 : 0;
      const intentStretch = moving && intent ? (intent === 'pursuit' ? 0.022 : 0.034) : 0;
      this.stretchX += tension + breath + intentStretch - compression - settling;
      this.stretchY -= tension * 0.52 + breath * 0.67 - compression * 0.7 - settling * 0.6;
    }
  }
}
