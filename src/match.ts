import { matchConfig } from './competition-config';
import type { Participant } from './movement';

export type Mode = 'arena' | 'endless' | 'tutorial';
export type Difficulty = 'easy' | 'normal' | 'hard';

export const compareRank = (a: Participant, b: Participant) => b.mass - a.mass ||
  b.combat.highest - a.combat.highest || b.combat.resourceMass - a.combat.resourceMass;

export function rankings(participants: readonly Participant[]) {
  const sorted = [...participants].sort(compareRank);
  let place = 1;
  return sorted.map((participant, index) => {
    if (index > 0 && compareRank(sorted[index - 1], participant) !== 0) place = index + 1;
    return { participant, place };
  });
}

export function placeOf(participant: Participant, participants: readonly Participant[]): number | undefined {
  let place = 1;
  let ranked = false;
  for (const rival of participants) {
    const comparison = compareRank(rival, participant);
    if (comparison < 0) place++;
    if (comparison !== 0) ranked = true;
  }
  return ranked ? place : undefined;
}

type Standing = { place: number; leader?: Participant };

export class RankFeedback {
  private confirmed?: Standing;
  private pending?: Standing;
  private pendingSince = 0;
  private nextNotice = 0;

  update(place: number, leader: Participant | undefined, elapsed: number): { label: string; climbing: boolean } | undefined {
    const standing = this.confirmed;
    if (!standing) {
      this.confirmed = { place, leader };
      return;
    }
    if (this.pending?.place !== place || this.pending.leader !== leader) {
      this.pending = { place, leader };
      this.pendingSince = elapsed;
      return;
    }
    if (elapsed - this.pendingSince < 0.8 || elapsed < this.nextNotice) return;
    this.confirmed = this.pending;
    const climbing = place < standing.place;
    const gains = standing.place - place;
    const newLeader = leader && leader !== standing.leader;
    const label = newLeader && leader.kind === 'player' ? 'NEW LEADER'
      : climbing ? (gains === 1 ? 'RIVAL OVERTAKEN' : gains + ' RIVALS OVERTAKEN')
        : newLeader && standing.leader ? 'LEADER · ' + leader.name : undefined;
    if (!label) return;
    this.nextNotice = elapsed + 4;
    return { label, climbing: climbing || leader?.kind === 'player' && Boolean(newLeader) };
  }
}

export class MatchClock {
  elapsed = 0;
  countdown: number;
  ended = false;

  constructor(readonly mode: Mode) {
    this.countdown = mode === 'arena' ? matchConfig.countdown : 0;
  }

  advance(seconds: number, step: (seconds: number) => void,
      endgame?: { readonly committed: boolean; readonly finished: boolean }): void {
    if (this.ended || !Number.isFinite(seconds) || seconds <= 0) return;
    if (endgame?.committed) {
      step(seconds);
      this.ended = endgame.finished;
      return;
    }
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
    if (endgame?.committed) this.ended = endgame.finished;
    else if (this.mode === 'arena' && this.elapsed >= matchConfig.duration - 1e-9) this.ended = true;
  }
}
