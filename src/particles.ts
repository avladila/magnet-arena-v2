import { scrapConfig } from './config';
import { clamp, type Participant, type Point } from './movement';
import { ScrapRegions } from './regions';

export type ResourceKind = 'ordinary' | 'gold' | 'energy';

export type Scrap = Point & {
  readonly id: number;
  readonly radius: number;
  generation: number;
  state: 'inactive' | 'active' | 'collected';
  colorIndex: number;
  resourceId?: number;
};

export type Collection = Readonly<Point & {
  id: number;
  generation: number;
  colorIndex: number;
  ownerId: Participant['id'];
  kind?: ResourceKind;
}>;

export type WorldBounds = { left: number; top: number; right: number; bottom: number };

export class ParticlePool {
  readonly slots: readonly Scrap[];
  private readonly regions: ScrapRegions;
  private readonly collected: Scrap[] = [];

  constructor(seed: number, participants: readonly Participant[], activeCount = scrapConfig.activeCount,
      private readonly mixed = false, capacity = scrapConfig.capacity) {
    this.slots = Array.from({ length: capacity }, (_, id): Scrap => ({
      id, radius: scrapConfig.radius, generation: 0, state: 'inactive', x: 0, y: 0, colorIndex: 0,
    }));
    const population = clamp(Math.trunc(activeCount), 0, this.slots.length);
    this.regions = new ScrapRegions(seed, this.slots.slice(0, population), participants.length);
    this.regions.update(participants, undefined, 0, this.collected);
  }

  kind(scrap: Scrap): ResourceKind {
    return this.mixed && scrap.resourceId !== undefined ? resourceKind(scrap.resourceId) : 'ordinary';
  }

  get regionStats() {
    return this.regions.stats;
  }

  collect(id: number, generation: number, ownerId: Participant['id']): Collection | undefined {
    const scrap = this.slots[id];
    if (scrap?.state !== 'active' || scrap.generation !== generation) return;
    scrap.state = 'collected';
    this.collected.push(scrap);
    return { id, generation, ownerId, x: scrap.x, y: scrap.y, colorIndex: scrap.colorIndex,
      ...(this.mixed && { kind: this.kind(scrap) }) };
  }

  replenish(participants: readonly Participant[], view: WorldBounds, seconds = 0): void {
    this.regions.update(participants, view, seconds, this.collected);
    this.collected.length = 0;
  }
}

export function resourceKind(id: number): ResourceKind {
  let hash = Math.imul(id ^ 0x85ebca6b, 0x9e3779b1);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  const roll = ((hash ^ (hash >>> 13)) >>> 0) / 2 ** 32;
  return roll < 0.01 ? 'gold' : roll < 0.06 ? 'energy' : 'ordinary';
}
