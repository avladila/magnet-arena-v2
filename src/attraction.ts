import { scrapConfig } from './config';
import { addMass, attractionReach } from './growth';
import type { Player, Point } from './movement';
import type { Collection, ParticlePool, Scrap } from './particles';

const noCollections: readonly Collection[] = [];

function pull(scrap: Scrap, position: Point, contact: number, reach: number, seconds: number) {
  const dx = position.x - scrap.x;
  const dy = position.y - scrap.y;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared <= contact * contact) return true;
  if (distanceSquared > reach * reach || seconds <= 0) return false;

  const distance = Math.sqrt(distanceSquared);
  const gap = distance - contact;
  // Integrate a pull speed that rises linearly as the gap closes.
  const gradient = (scrapConfig.pullMaxSpeed - scrapConfig.pullMinSpeed) / (reach - contact);
  const speed = scrapConfig.pullMaxSpeed - gradient * gap;
  const travel = gradient === 0 ? speed * seconds : speed * Math.expm1(gradient * seconds) / gradient;
  const fraction = Math.min(gap, travel) / distance;
  scrap.x += dx * fraction;
  scrap.y += dy * fraction;
  return travel >= gap;
}

export function advanceAttraction(pool: ParticlePool, player: Player, seconds: number): readonly Collection[] {
  const reach = attractionReach(player.physicalScale);
  let collections: Collection[] | undefined;
  for (const scrap of pool.slots) {
    if (scrap.state !== 'active' || !pull(scrap, player.position, player.radius + scrap.radius, reach, seconds)) {
      continue;
    }
    const collection = pool.collect(scrap.id, scrap.generation);
    if (collection) (collections ??= []).push(collection);
  }
  // Resolve contact against one physical size per update, then pay out the batch.
  if (collections) addMass(player, collections.length * scrapConfig.massPerPickup);
  return collections ?? noCollections;
}
