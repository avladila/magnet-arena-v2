import { matchConfig } from './competition-config';
import type { Participant } from './movement';

export type Mode = 'arena' | 'endless' | 'tutorial';
export type Difficulty = 'easy' | 'normal' | 'hard';

const order = (a: Participant, b: Participant) => b.mass - a.mass ||
  b.combat.highest - a.combat.highest || b.combat.resourceMass - a.combat.resourceMass;

export function rankings(participants: readonly Participant[]) {
  const sorted = [...participants].sort(order);
  let place = 1;
  return sorted.map((participant, index) => {
    if (index > 0 && order(sorted[index - 1], participant) !== 0) place = index + 1;
    return { participant, place };
  });
}

export class MatchClock {
  elapsed = 0;
  countdown: number;
  ended = false;

  constructor(readonly mode: Mode) {
    this.countdown = mode === 'arena' ? matchConfig.countdown : 0;
  }

  advance(seconds: number, step: (seconds: number) => void): void {
    if (this.ended || !Number.isFinite(seconds) || seconds <= 0) return;
    if (this.countdown > 0) {
      const consumed = Math.min(seconds, this.countdown);
      this.countdown -= consumed;
      seconds -= consumed;
    }
    if (this.mode === 'arena') seconds = Math.min(seconds, matchConfig.duration - this.elapsed);
    if (seconds > 0) {
      step(seconds);
      this.elapsed += seconds;
    }
    if (this.mode === 'arena' && this.elapsed >= matchConfig.duration - 1e-9) this.ended = true;
  }
}
