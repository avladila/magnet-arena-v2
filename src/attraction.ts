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
    return { participant, reach, reachSquared: reach ** 2, pickups: 0 };
  });
  let collections: Collection[] | undefined;
  let contestedCollections = 0;
  for (const scrap of pool.slots) {
    if (scrap.state !== 'active') continue;
    let winner: typeof candidates[number] | undefined;
    let bestGap = Infinity;
    let bestDistance = 0;
    let inRange = 0;
    for (const candidate of candidates) {
      const { id, position, radius } = candidate.participant;
      const distanceSquared = (position.x - scrap.x) ** 2 + (position.y - scrap.y) ** 2;
      const contact = radius + scrap.radius;
      if (distanceSquared > candidate.reachSquared && distanceSquared > contact ** 2) continue;
      inRange++;
      const distance = Math.sqrt(distanceSquared);
      // Signed gaps rank physical contacts ahead of every non-contact candidate.
      const gap = distance - contact;
      if (gap < bestGap || (gap === bestGap && winner && id < winner.participant.id)) {
        winner = candidate;
        bestGap = gap;
        bestDistance = distance;
      }
    }
    if (!winner) continue;
    const collector = winner.participant;
    if (!pull(scrap, collector.position, bestDistance, collector.radius + scrap.radius, winner.reach, seconds)) continue;
    const collection = pool.collect(scrap.id, scrap.generation, winner.participant.id);
    if (!collection) continue;
    (collections ??= []).push(collection);
    winner.pickups++;
    if (inRange > 1) contestedCollections++;
  }
  if (!collections) return noCollections;
  // Apply payouts after every contested pickup has used the same participant sizes and positions.
  for (const { participant, pickups } of candidates) {
    if (pickups === 0) continue;
    participant.pickupsCollected += pickups;
    addMass(participant, pickups * scrapConfig.massPerPickup);
  }
  return { collections, contestedCollections };
}
