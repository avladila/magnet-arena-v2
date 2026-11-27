import type { Attack } from './combat-state';
import type { Observation } from './character-attention';
import { playerConfig } from './config';
import type { Participant } from './movement';

export const expressions = ['relaxed', 'curious', 'excited', 'satisfied', 'worried', 'frightened',
  'aggressive', 'shocked', 'injured', 'overheated', 'frozen', 'corroded'] as const;
export type Expression = typeof expressions[number];
export type CharacterIntent = 'pursuit' | 'escape';

const reactionSeconds = 0.4;
const recoilSeconds = 0.22;
const collectingSeconds = 0.29;
const settleSeconds = 0.13;
const transitionSeconds = 0.14;
const threatRecoverySeconds = 0.39;

export class CharacterPose {
  expression: Expression = 'relaxed';
  stretchX = 1;
  stretchY = 1;
  recoil = 0;
  markProgress = 0;
  faceSqueeze = 1;
  shock = 0;
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
  private nextSatisfaction = 0;
  private pleasedFor = 0;
  private concernFor = 0;
  private nextExpression: Expression = 'relaxed';
  private transition = transitionSeconds;
  private injury?: { until: number; mass: number };

  update(magnet: Participant, seconds: number, reducedMotion: boolean, intent?: CharacterIntent, attention?: Observation): void {
    const state = magnet.combat;
    this.clock += seconds;
    const loss = state.lostToTheft + state.lostToHazards;
    const damage = loss - this.lastLoss;
    this.lastLoss = loss;
    if (damage > 0) {
      this.hitFor = reactionSeconds;
      this.shock = Math.min(1, damage / (magnet.mass + damage) / .48);
      if (damage >= 10 && damage / (magnet.mass + damage) >= 0.24) {
        this.injury = { until: this.clock + 12, mass: magnet.mass + Math.ceil(damage * 0.66) };
      }
    } else this.hitFor = Math.max(0, this.hitFor - seconds);
    if (this.injury && (this.injury.mass <= magnet.mass || this.injury.until <= this.clock)) this.injury = undefined;
    const pickups = magnet.pickupsCollected;
    this.collectFor = Math.max(0, this.collectFor - seconds);
    this.pleasedFor = Math.max(0, this.pleasedFor - seconds);
    if (pickups > this.lastPickups || state.salvage > this.lastSalvage) {
      this.collectFor = collectingSeconds;
      if (this.clock >= this.nextSatisfaction) {
        this.pleasedFor = collectingSeconds;
        this.nextSatisfaction = this.clock + .62;
      }
    }
    this.lastPickups = pickups;
    this.lastSalvage = state.salvage;
    const target = attention?.target.kind;
    this.concernFor = target === 'opponent' ? threatRecoverySeconds : Math.max(0, this.concernFor - seconds);
    const phase = state.attack.phase;
    this.recoilFor = phase === 'warning' && this.previousAttack !== 'warning' ? recoilSeconds : Math.max(0, this.recoilFor - seconds);
    this.previousAttack = phase;

    const speed = Math.hypot(magnet.velocity.x, magnet.velocity.y);
    const moving = speed > 18;
    this.takeoffFor = moving && !this.moving ? 0.12 : Math.max(0, this.takeoffFor - seconds);
    this.settleFor = !moving && this.moving ? settleSeconds : Math.max(0, this.settleFor - seconds);
    this.moving = moving;
    let mood: Expression = 'relaxed';
    if (this.hitFor > 0) mood = 'shocked';
    else if (phase === 'armed' || phase === 'warning' || this.recoilFor > 0) mood = 'aggressive';
    else if (attention?.danger) mood = 'frightened';
    else if (state.heat >= 0.24) mood = 'overheated';
    else if (state.brittle || state.cold >= 0.45) mood = 'frozen';
    else if (state.corrosion) mood = 'corroded';
    else if (this.concernFor > 0) mood = 'worried';
    else if (this.injury) mood = 'injured';
    else if (this.pleasedFor > 0) mood = 'satisfied';
    else if (target === 'energy' || target === 'gold') mood = 'excited';
    else if (target === 'ordinary' || target === 'salvage') mood = 'curious';
    this.transitionTo(mood, seconds, reducedMotion);

    this.stretchX = 1;
    this.stretchY = 1;
    this.recoil = 0;
    this.markProgress = 0;
    this.blink = false;
    if (reducedMotion) return;
    const offset = (magnet.id.charCodeAt(magnet.id.length - 1) % 9) * 0.47;
    const blinkPeriod = 3.7 + offset * 0.31;
    this.blink = (this.expression === 'relaxed' || this.expression === 'curious') && !intent &&
      (this.clock + offset) % blinkPeriod > blinkPeriod - 0.12;
    this.markProgress = this.hitFor > 0 ? 1 - this.hitFor / reactionSeconds : this.clock * 0.8 + offset;
    const heavy = Math.min(1, (magnet.physicalScale - 1) / 8);
    const tension = Math.min(1, speed / playerConfig.speed) * (0.068 - 0.032 * heavy);
    if (this.hitFor > 0) {
      const hit = (this.hitFor / reactionSeconds) ** 3 * (.48 + .52 * this.shock);
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
    } else if (this.collectFor > 0 && this.expression === 'satisfied') {
      const bounce = Math.sin(Math.PI * this.collectFor / collectingSeconds) * 0.07;
      this.stretchX += bounce;
      this.stretchY -= bounce * 0.65;
    } else {
      const breath = !moving && this.expression === 'relaxed' ? Math.sin(this.clock * 2.65 + offset) * (0.018 - 0.010 * heavy) : 0;
      const compression = moving ? this.takeoffFor / 0.12 * 0.024 : 0;
      const settling = !moving ? Math.sin(Math.PI * this.settleFor / settleSeconds) * 0.029 : 0;
      const intentStretch = moving && intent ? (intent === 'pursuit' ? 0.022 : 0.034) : 0;
      this.stretchX += tension + breath + intentStretch - compression - settling;
      this.stretchY -= tension * 0.52 + breath * 0.67 - compression * 0.7 - settling * 0.6;
    }
  }

  private transitionTo(mood: Expression, seconds: number, reducedMotion: boolean): void {
    this.faceSqueeze = 1;
    if (mood === 'shocked' || mood === 'aggressive' || mood === 'frightened') {
      this.transition = transitionSeconds;
      this.expression = this.nextExpression = mood;
      return;
    }
    if (mood !== this.nextExpression) {
      this.nextExpression = mood;
      this.transition = 0;
    }
    this.transition = Math.min(transitionSeconds, this.transition + seconds);
    if (this.transition >= transitionSeconds / 2) this.expression = mood;
    // Swap the coordinated cels during a slight facial settle. There is only one set of pupils and features.
    if (!reducedMotion && this.transition < transitionSeconds) {
      this.faceSqueeze -= .055 * Math.sin(Math.PI * this.transition / transitionSeconds);
    }
  }
}
