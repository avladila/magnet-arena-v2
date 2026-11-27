import { brand } from './brand';
import type { Point } from './movement';

const easing = (curve: number[]) => 'cubic-bezier(' + curve.join(',') + ')';

export class PickupFeedback {
  private readonly gold = document.createElement('span');
  private readonly charge = document.createElement('span');
  private readonly gain = document.createElement('span');
  private readonly meter = document.querySelector('#energy')!;
  private readonly attack = document.querySelector('#attack')!;
  private goldAnimation?: Animation;
  private chargeAnimation?: Animation;
  private gainAnimation?: Animation;
  private meterAnimation?: Animation;
  private readyAnimation?: Animation;

  constructor(surface: HTMLElement) {
    this.gold.className = 'pickup-gain';
    this.gold.textContent = '+10';
    this.charge.className = 'pickup-charge';
    this.gain.className = 'pickup-energy-gain';
    for (const element of [this.gold, this.charge, this.gain]) element.setAttribute('aria-hidden', 'true');
    surface.append(this.gold, this.charge, this.gain);
  }

  reset(): void {
    this.goldAnimation?.cancel();
    this.chargeAnimation?.cancel();
    this.gainAnimation?.cancel();
    this.meterAnimation?.cancel();
    this.readyAnimation?.cancel();
  }

  show(kind: 'gold' | 'energy', from: Point, amount = 0): void {
    const start = 'translate(' + from.x + 'px, ' + from.y + 'px)';
    if (kind === 'gold') {
      this.goldAnimation?.cancel();
      this.goldAnimation = this.float(this.gold, start, brand.motion.gold);
      return;
    }
    const end = this.meter.getBoundingClientRect();
    this.chargeAnimation?.cancel();
    this.chargeAnimation = this.charge.animate([
      { transform: start, opacity: 0.92 },
      { transform: 'translate(' + (end.left + end.width / 2) + 'px, ' + end.top + 'px)', opacity: 0 },
    ], { duration: brand.motion.energy, easing: easing(brand.motion.pull) });
    this.meterAnimation?.cancel();
    this.meterAnimation = this.meter.animate([{ filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }],
      { duration: brand.motion.gold, easing: easing(brand.motion.snap) });
    this.gainAnimation?.cancel();
    if (amount > 0) {
      this.gain.textContent = '+' + amount + '%';
      this.gainAnimation = this.float(this.gain, start + ' translateY(-24px)', brand.motion.gold);
    }
  }

  ready(): void {
    this.readyAnimation?.cancel();
    this.readyAnimation = this.attack.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.055)', offset: 0.35 }, { transform: 'scale(1)' }],
      { duration: brand.motion.milestone, easing: easing(brand.motion.snap) },
    );
  }

  private float(element: HTMLElement, start: string, duration: number): Animation {
    return element.animate([
      { transform: start + ' translate(-50%, -50%)', opacity: 1 },
      { transform: start + ' translate(-50%, -150%)', opacity: 0 },
    ], { duration, easing: easing(brand.motion.settle) });
  }
}
