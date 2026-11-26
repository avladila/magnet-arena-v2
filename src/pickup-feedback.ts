import { brand } from './brand';
import type { Point } from './movement';

export class PickupFeedback {
  private readonly gold = document.createElement('span');
  private readonly charge = document.createElement('span');
  private readonly meter = document.querySelector('#energy')!;
  private goldAnimation?: Animation;
  private chargeAnimation?: Animation;

  constructor(surface: HTMLElement) {
    this.gold.className = 'pickup-gain';
    this.gold.textContent = '+10';
    this.gold.setAttribute('aria-hidden', 'true');
    this.charge.className = 'pickup-charge';
    this.charge.setAttribute('aria-hidden', 'true');
    surface.append(this.gold, this.charge);
  }

  reset(): void {
    this.goldAnimation?.cancel();
    this.chargeAnimation?.cancel();
  }

  show(kind: 'gold' | 'energy', from: Point): void {
    const start = 'translate(' + from.x + 'px, ' + from.y + 'px)';
    if (kind === 'gold') {
      this.goldAnimation?.cancel();
      this.goldAnimation = this.gold.animate([
        { transform: start + ' translate(-50%, -50%)', opacity: 1 },
        { transform: start + ' translate(-50%, -150%)', opacity: 0 },
      ], { duration: brand.motion.gold, easing: 'cubic-bezier(' + brand.motion.settle.join(',') + ')' });
      return;
    }
    const end = this.meter.getBoundingClientRect();
    this.chargeAnimation?.cancel();
    this.chargeAnimation = this.charge.animate([
      { transform: start, opacity: 0.92 },
      { transform: 'translate(' + (end.left + end.width / 2) + 'px, ' + end.top + 'px)', opacity: 0 },
    ], { duration: brand.motion.energy, easing: 'cubic-bezier(' + brand.motion.pull.join(',') + ')' });
  }
}
