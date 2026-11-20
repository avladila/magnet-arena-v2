import { arena, growthConfig, scrapConfig } from './config';
import { attractionReach } from './growth';
import { clamp, type Participant, type Point } from './movement';
import { seedRandom } from './random';

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
  ownerId: Participant['id'];
}>;

export type WorldBounds = { left: number; top: number; right: number; bottom: number };
type SpawnArea = WorldBounds & { area: number };
type Exclusion = Point & { radiusSquared: number };

const spawnBounds: WorldBounds = {
  left: scrapConfig.radius,
  top: scrapConfig.radius,
  right: arena.width - scrapConfig.radius,
  bottom: arena.height - scrapConfig.radius,
};
const spawnAttempts = 12;
const noOffscreenAreas: readonly SpawnArea[] = [];

function spawnExclusions(participants: readonly Participant[]): Exclusion[] {
  return participants.map(({ position, radius, physicalScale }) => ({
    ...position,
    radiusSquared: Math.max(attractionReach(physicalScale), radius + scrapConfig.radius) ** 2,
  }));
}

function outsideFields(x: number, y: number, exclusions: readonly Exclusion[]): boolean {
  return exclusions.every((field) => (x - field.x) ** 2 + (y - field.y) ** 2 > field.radiusSquared);
}

function fallbackSpawn(exclusions: readonly Exclusion[]): Point {
  // A field can cover at most one point on this grid, so five magnets
  // cannot block all the legal centers even at maximum physical scale.
  const spacing = 2 * growthConfig.maxReach + 1;
  for (let x = spawnBounds.left; x <= spawnBounds.right; x += spacing) {
    for (let y = spawnBounds.top; y <= spawnBounds.bottom; y += spacing) {
      if (outsideFields(x, y, exclusions)) return { x, y };
    }
  }
  throw new Error('No legal scrap spawn outside magnetic fields');
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

  constructor(seed: number, participants: readonly Participant[], activeCount = scrapConfig.activeCount) {
    this.random = seedRandom(seed);
    this.slots = Array.from({ length: scrapConfig.capacity }, (_, id): Scrap => ({
      id, radius: scrapConfig.radius, generation: 0, state: 'inactive', x: 0, y: 0, colorIndex: 0,
    }));
    const population = clamp(Math.trunc(activeCount), 0, this.slots.length);
    const exclusions = spawnExclusions(participants);
    for (let id = 0; id < population; id++) this.spawn(this.slots[id], exclusions, noOffscreenAreas);
  }

  collect(id: number, generation: number, ownerId: Participant['id']): Collection | undefined {
    const scrap = this.slots[id];
    // A queued claim applies to a single lifetime of a slot.
    if (scrap?.state !== 'active' || scrap.generation !== generation) return;
    scrap.state = 'collected';
    this.collected.push(scrap);
    return { id, generation, ownerId, x: scrap.x, y: scrap.y, colorIndex: scrap.colorIndex };
  }

  replenish(participants: readonly Participant[], view: WorldBounds): void {
    if (this.collected.length === 0) return;
    const areas = offscreenAreas(view);
    const exclusions = spawnExclusions(participants);
    for (const scrap of this.collected) this.spawn(scrap, exclusions, areas);
    this.collected.length = 0;
  }

  private spawn(scrap: Scrap, exclusions: readonly Exclusion[], areas: readonly SpawnArea[]): void {
    const offscreenArea = areas.reduce((total, band) => total + band.area, 0);
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
      if (outsideFields(scrap.x, scrap.y, exclusions)) {
        this.activate(scrap);
        return;
      }
    }

    const fallback = fallbackSpawn(exclusions);
    scrap.x = fallback.x;
    scrap.y = fallback.y;
    this.activate(scrap);
  }

  private activate(scrap: Scrap): void {
    scrap.colorIndex = Math.floor(this.random() * scrapConfig.colorCount);
    scrap.generation++;
    scrap.state = 'active';
  }
}
