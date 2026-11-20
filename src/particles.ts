import { arena, scrapConfig } from './config';
import { attractionReach } from './growth';
import { clamp, type Player, type Point } from './movement';

export type Scrap = Point & {
  readonly id: number;
  readonly radius: number;
  generation: number;
  state: 'inactive' | 'active' | 'collected';
  colorIndex: number;
};

export type Collection = Readonly<Point & {
  id: number;
  generation: number;
  colorIndex: number;
}>;

export type WorldBounds = { left: number; top: number; right: number; bottom: number };
type SpawnArea = WorldBounds & { area: number };

const spawnBounds: WorldBounds = {
  left: scrapConfig.radius,
  top: scrapConfig.radius,
  right: arena.width - scrapConfig.radius,
  bottom: arena.height - scrapConfig.radius,
};
const spawnAttempts = 12;
const noOffscreenAreas: readonly SpawnArea[] = [];

function seedRandom(seed: number): () => number {
  // Mulberry32 uses 32-bit integer arithmetic for repeatable spawn sequences.
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function offscreenAreas(view: WorldBounds): SpawnArea[] {
  const { left, top, right, bottom } = spawnBounds;
  const radius = scrapConfig.radius;
  const viewLeft = clamp(view.left - radius, left, right);
  const viewTop = clamp(view.top - radius, top, bottom);
  const viewRight = clamp(view.right + radius, left, right);
  const viewBottom = clamp(view.bottom + radius, top, bottom);
  const bands = [
    { left, top, right: viewLeft, bottom },
    { left: viewRight, top, right, bottom },
    { left: viewLeft, top, right: viewRight, bottom: viewTop },
    { left: viewLeft, top: viewBottom, right: viewRight, bottom },
  ];
  return bands.map((band) => ({
    ...band, area: (band.right - band.left) * (band.bottom - band.top),
  })).filter((band) => band.area > 0);
}

export class ParticlePool {
  readonly slots: readonly Scrap[];
  private readonly random: () => number;
  private readonly collected: Scrap[] = [];

  constructor(seed: number, player: Player, activeCount = scrapConfig.activeCount) {
    this.random = seedRandom(seed);
    this.slots = Array.from({ length: scrapConfig.capacity }, (_, id): Scrap => ({
      id, radius: scrapConfig.radius, generation: 0, state: 'inactive', x: 0, y: 0, colorIndex: 0,
    }));
    const population = clamp(Math.trunc(activeCount), 0, this.slots.length);
    for (let id = 0; id < population; id++) this.spawn(this.slots[id], player, noOffscreenAreas);
  }

  collect(id: number, generation: number): Collection | undefined {
    const scrap = this.slots[id];
    // A queued claim applies to a single lifetime of a slot.
    if (scrap?.state !== 'active' || scrap.generation !== generation) return;
    scrap.state = 'collected';
    this.collected.push(scrap);
    return { id, generation, x: scrap.x, y: scrap.y, colorIndex: scrap.colorIndex };
  }

  replenish(player: Player, view: WorldBounds): void {
    if (this.collected.length === 0) return;
    const areas = offscreenAreas(view);
    for (const scrap of this.collected) this.spawn(scrap, player, areas);
    this.collected.length = 0;
  }

  private spawn(scrap: Scrap, player: Player, areas: readonly SpawnArea[]): void {
    const separation = Math.max(attractionReach(player.physicalScale), player.radius + scrap.radius);
    const separationSquared = separation * separation;
    const offscreenArea = areas.reduce((total, band) => total + band.area, 0);
    const { x: playerX, y: playerY } = player.position;
    for (let attempt = 0; attempt < spawnAttempts * 2; attempt++) {
      let bounds = spawnBounds;
      if (offscreenArea && attempt < spawnAttempts) {
        let roll = this.random() * offscreenArea;
        for (const band of areas) {
          roll -= band.area;
          if (roll < 0) {
            bounds = band;
            break;
          }
        }
      }
      scrap.x = bounds.left + this.random() * (bounds.right - bounds.left);
      scrap.y = bounds.top + this.random() * (bounds.bottom - bounds.top);
      if ((scrap.x - playerX) ** 2 + (scrap.y - playerY) ** 2 > separationSquared) {
        this.activate(scrap);
        return;
      }
    }

    // Bounded fallback: the farther vertical edge is beyond every supported field.
    scrap.x = playerX < arena.width / 2 ? spawnBounds.right : spawnBounds.left;
    scrap.y = spawnBounds.top + this.random() * (spawnBounds.bottom - spawnBounds.top);
    this.activate(scrap);
  }

  private activate(scrap: Scrap): void {
    scrap.colorIndex = Math.floor(this.random() * scrapConfig.colorCount);
    scrap.generation++;
    scrap.state = 'active';
  }
}
