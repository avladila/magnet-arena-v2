import { overloadStage, type CriticalRules, type OverloadStage } from './competition-config';
import { rankings, type Mode } from './match';
import type { Participant, Point } from './movement';

export type DetonationOutcome = 'detonator' | 'survivor' | 'destroyed';
export type Interruption = Readonly<{ claimantId: string; at: number; cause: 'theft' | 'hazard' | 'mass'; attackerId?: string }>;
export type FinalStanding = Readonly<ReturnType<typeof captureStanding> & { outcome?: DetonationOutcome; survivalPoints?: number }>;
export type MatchResult = Readonly<{
  mode: Mode;
  cause: 'timeout' | 'detonation' | 'endless' | 'tutorial';
  winnerId?: string;
  at: number;
  standings: readonly FinalStanding[];
  bestPlace?: number;
  interruptions: readonly Interruption[];
  detonation?: Readonly<{ center: Readonly<Point>; at: number; destroyed: number; survived: number }>;
}>;

function captureStanding({ participant, place }: ReturnType<typeof rankings>[number], mode: Mode, rules?: CriticalRules) {
  const { id, name, kind, mass, combat } = participant;
  const { highest, resourceMass, hits, misses, guarded, protectedHits, detached, largestTheft, largestReduction,
    salvage, ownSalvage, reclaimedSalvage, bestRecovery, lostToTheft, lostToHazards, ordinary, gold, cells } = combat;
  const stage = overloadStage(highest, rules);
  const highestStage: OverloadStage = mode === 'arena' || stage === 'standard' ? stage : 'ultimate';
  return Object.freeze({ id, name, kind, mass, place, highestStage, combat: Object.freeze({
    highest, resourceMass, hits, misses, guarded, protectedHits, detached, largestTheft, largestReduction,
    largerVictims: combat.largerVictims.size, salvage, ownSalvage, reclaimedSalvage, bestRecovery,
    lostToTheft, lostToHazards, ordinary, gold, cells,
  }) });
}

export function captureStandings(participants: readonly Participant[], mode: Mode, rules?: CriticalRules): readonly FinalStanding[] {
  return Object.freeze(rankings(participants).map(row => captureStanding(row, mode, rules)));
}

export function ordinaryResult(mode: Mode, participants: readonly Participant[], at: number,
    bestPlace?: number, interruptions: readonly Interruption[] = [], rules?: CriticalRules): MatchResult {
  const standings = captureStandings(participants, mode, rules);
  const cause = mode === 'arena' ? 'timeout' : mode;
  return Object.freeze({ mode, cause, at, winnerId: mode === 'arena' ? standings[0]?.id : undefined,
    standings, bestPlace, interruptions: Object.freeze([...interruptions]) });
}

export function detonationResult(winnerId: string, at: number, center: Readonly<Point>, captured: readonly FinalStanding[],
    eliminated: ReadonlySet<string>, survivalReward: number, interruptions: readonly Interruption[], bestPlace?: number): MatchResult {
  const winner = captured.find(({ id }) => id === winnerId)!;
  const survivors = captured.filter(({ id }) => id !== winnerId && !eliminated.has(id));
  const destroyed = captured.filter(({ id }) => eliminated.has(id));
  const ordered: FinalStanding[] = [Object.freeze({ ...winner, place: 1, outcome: 'detonator', survivalPoints: 0 })];
  for (const [group, outcome] of [[survivors, 'survivor'], [destroyed, 'destroyed']] as const) {
    const start = ordered.length + 1;
    let place = start;
    for (const [index, row] of group.entries()) {
      if (index && group[index - 1].place !== row.place) place = start + index;
      ordered.push(Object.freeze({ ...row, place, outcome, survivalPoints: outcome === 'survivor' ? survivalReward : 0 }));
    }
  }
  return Object.freeze({ mode: 'arena', cause: 'detonation', winnerId, at, bestPlace,
    standings: Object.freeze(ordered), interruptions: Object.freeze([...interruptions]),
    detonation: Object.freeze({ center, at, destroyed: destroyed.length, survived: survivors.length }) });
}
