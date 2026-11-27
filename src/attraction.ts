import { pullMultiplier } from './combat';
import { theftConfig } from './competition-config';
import { arena, scrapConfig } from './config';
import { addMass, attractionReach } from './growth';
import { clamp, type Participant, type Point } from './movement';
import type { Collection, ParticlePool, Scrap } from './particles';

export type AttractionResult = Readonly<{
  collections: readonly Collection[];
  contestedCollections: number;
}>;

const noCollections: AttractionResult = { collections: [], contestedCollections: 0 };

type Candidate = {
  participant: Participant; reach: number; energyReach: number; modifier: number; contact: number;
  pickups: number; gold: number; energy: number;
};

const cell = 240;
const columns = Math.ceil(arena.width / cell);
const rows = Math.ceil(arena.height / cell);
const columnAt = (x: number) => clamp(Math.floor(x / cell), 0, columns - 1);
const rowAt = (y: number) => clamp(Math.floor(y / cell), 0, rows - 1);
const empty: readonly Candidate[] = [];

/** Conservative field bounds provide candidates. Signed gap still decides every claim. */
export class AttractionGrid {
  private readonly cells: Candidate[][] = [];
  private readonly occupied: Candidate[][] = [];

  index(candidates: readonly Candidate[]): void {
    for (const bucket of this.occupied) bucket.length = 0;
    this.occupied.length = 0;
    for (const candidate of candidates) {
      const { x, y } = candidate.participant.position;
      const size = Math.max(candidate.reach, candidate.energyReach);
      const right = columnAt(x + size);
      const bottom = rowAt(y + size);
      const left = columnAt(x - size);
      for (let row = rowAt(y - size); row <= bottom; row++) {
        for (let column = left; column <= right; column++) {
          const bucket = this.cells[row * columns + column] ??= [];
          if (bucket.length === 0) this.occupied.push(bucket);
          bucket.push(candidate);
        }
      }
    }
  }

  at(x: number, y: number): readonly Candidate[] {
    return this.cells[rowAt(y) * columns + columnAt(x)] ?? empty;
  }
}

function pull(scrap: Scrap, position: Point, distance: number, contact: number, reach: number, seconds: number) {
  const gap = distance - contact;
  if (gap <= 0) return true;
  if (seconds === 0) return false;
  // Integrate a pull speed that rises linearly as the gap closes.
  const gradient = (scrapConfig.pullMaxSpeed - scrapConfig.pullMinSpeed) / (reach - contact);
  const speed = scrapConfig.pullMaxSpeed - gradient * gap;
  const travel = gradient === 0 ? speed * seconds : speed * Math.expm1(gradient * seconds) / gradient;
  const fraction = Math.min(gap, travel) / distance;
  scrap.x += (position.x - scrap.x) * fraction;
  scrap.y += (position.y - scrap.y) * fraction;
  return travel >= gap;
}

export function advanceAttraction(
  pool: ParticlePool, participants: readonly Participant[], seconds: number, grid?: AttractionGrid,
): AttractionResult {
  if (!Number.isFinite(seconds) || seconds < 0) return noCollections;
  const candidates = participants.map((participant): Candidate => {
    const contact = participant.radius + scrapConfig.radius;
    const scale = participant.physicalScale;
    const modifier = pullMultiplier(participant);
    const reach = contact + Math.max(0, attractionReach(scale) - contact) * modifier;
    const energyReach = contact + (Math.max(contact + 20, 72, 156 / Math.sqrt(scale)) - contact) * modifier;
    return { participant, reach, energyReach, modifier, contact, pickups: 0, gold: 0, energy: 0 };
  });
  grid?.index(candidates);
  let collections: Collection[] | undefined;
  let contestedCollections = 0;
  for (const scrap of pool.slots) {
    if (scrap.state !== 'active') continue;
    const nearby = grid ? grid.at(scrap.x, scrap.y) : candidates;
    if (nearby.length === 0) continue;
    const kind = pool.kind(scrap);
    let winningReach = 0;
    let winner: typeof candidates[number] | undefined;
    let bestGap = Infinity;
    let bestDistance = 0;
    let inRange = 0;
    for (const candidate of nearby) {
      const { id, position } = candidate.participant;
      const distanceSquared = (position.x - scrap.x) ** 2 + (position.y - scrap.y) ** 2;
      const reach = kind === 'energy' ? candidate.energyReach : candidate.reach;
      if (distanceSquared > reach ** 2) continue;
      inRange++;
      const distance = Math.sqrt(distanceSquared);
      // Signed gaps rank physical contacts ahead of every non-contact candidate.
      const gap = distance - candidate.contact;
      if (gap < bestGap || (gap === bestGap && winner && id < winner.participant.id)) {
        winner = candidate;
        winningReach = reach;
        bestGap = gap;
        bestDistance = distance;
      }
    }
    if (!winner) continue;
    const collector = winner.participant;
    if (!pull(scrap, collector.position, bestDistance, winner.contact, winningReach, seconds * winner.modifier)) continue;
    const collection = pool.collect(scrap.id, scrap.generation, winner.participant.id);
    if (!collection) continue;
    (collections ??= []).push(collection);
    if (kind === 'gold') winner.gold++;
    else if (kind === 'energy') winner.energy++;
    else winner.pickups++;
    if (inRange > 1) contestedCollections++;
  }
  if (!collections) return noCollections;
  // Apply payouts after every contested pickup has used the same participant sizes and positions.
  for (const { participant, pickups, gold, energy } of candidates) {
    if (!pickups && !gold && !energy) continue;
    participant.pickupsCollected += pickups + gold + energy;
    const state = participant.combat;
    state.ordinary += pickups;
    state.gold += gold;
    state.cells += energy;
    state.energy = Math.min(theftConfig.energy, state.energy +
      energy * Math.max(4, Math.round(12 / Math.sqrt(participant.physicalScale))));
    const mass = pickups * scrapConfig.massPerPickup + gold * 10;
    state.resourceMass += mass;
    if (mass) addMass(participant, mass);
  }
  return { collections, contestedCollections };
}
