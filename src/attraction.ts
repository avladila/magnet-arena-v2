import { pullMultiplier } from './combat';
import { theftConfig } from './competition-config';
import { scrapConfig } from './config';
import { addMass, attractionReach } from './growth';
import type { Participant, Point } from './movement';
import type { Collection, ParticlePool, Scrap } from './particles';

export type AttractionResult = Readonly<{
  collections: readonly Collection[];
  contestedCollections: number;
}>;

const noCollections: AttractionResult = { collections: [], contestedCollections: 0 };

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
  pool: ParticlePool, participants: readonly Participant[], seconds: number,
): AttractionResult {
  if (!Number.isFinite(seconds) || seconds < 0) return noCollections;
  const candidates = participants.map((participant) => {
    const reach = attractionReach(participant.physicalScale);
    return { participant, reach, modifier: pullMultiplier(participant), pickups: 0, gold: 0, energy: 0 };
  });
  let collections: Collection[] | undefined;
  let contestedCollections = 0;
  for (const scrap of pool.slots) {
    if (scrap.state !== 'active') continue;
    const kind = pool.kind(scrap);
    let winningReach = 0;
    let winner: typeof candidates[number] | undefined;
    let bestGap = Infinity;
    let bestDistance = 0;
    let inRange = 0;
    for (const candidate of candidates) {
      const { id, position, radius } = candidate.participant;
      const distanceSquared = (position.x - scrap.x) ** 2 + (position.y - scrap.y) ** 2;
      const contact = radius + scrap.radius;
      const baseReach = kind === 'energy'
        ? Math.max(contact + 20, 72, 156 / Math.sqrt(candidate.participant.physicalScale))
        : candidate.reach;
      const reach = contact + Math.max(0, baseReach - contact) * candidate.modifier;
      if (distanceSquared > reach ** 2) continue;
      inRange++;
      const distance = Math.sqrt(distanceSquared);
      // Signed gaps rank physical contacts ahead of every non-contact candidate.
      const gap = distance - contact;
      if (gap < bestGap || (gap === bestGap && winner && id < winner.participant.id)) {
        winner = candidate;
        winningReach = reach;
        bestGap = gap;
        bestDistance = distance;
      }
    }
    if (!winner) continue;
    const collector = winner.participant;
    if (!pull(scrap, collector.position, bestDistance, collector.radius + scrap.radius, winningReach, seconds * winner.modifier)) continue;
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
