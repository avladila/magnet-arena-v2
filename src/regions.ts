import { arena, regionConfig, scrapConfig } from './config';
import { attractionReach } from './growth';
import { clamp, type Participant, type Point } from './movement';
import type { Scrap, WorldBounds } from './particles';
import { seedRandom } from './random';

const columns = Math.ceil(arena.width / regionConfig.size);
const rows = Math.ceil(arena.height / regionConfig.size);
const sitesPerRegion = Math.ceil(regionConfig.size ** 2 * regionConfig.sitesPerUnitArea);

export function regionAt({ x, y }: Point): number {
  const column = clamp(Math.floor(x / regionConfig.size), 0, columns - 1);
  const row = clamp(Math.floor(y / regionConfig.size), 0, rows - 1);
  return row * columns + column;
}

export function regionBounds(id: number): WorldBounds {
  const left = (id % columns) * regionConfig.size;
  const top = Math.floor(id / columns) * regionConfig.size;
  return {
    left, top,
    right: Math.min(left + regionConfig.size, arena.width),
    bottom: Math.min(top + regionConfig.size, arena.height),
  };
}

type Region = {
  readonly id: number;
  readonly bounds: WorldBounds;
  readonly sites: Site[];
  lastUsed: number;
  lastPlan: number;
  live: number;
};

type Site = Point & {
  readonly id: number;
  readonly region: Region;
  revision: number;
  colorIndex: number;
  slot?: Scrap;
  rank: number;
  listed: number;
  selected: number;
};

type Field = Point & { reach: number };
type Interest = { fields: Field[]; view?: WorldBounds };

const definitions = Array.from({ length: columns * rows }, (_, id) => ({ id, bounds: regionBounds(id) }));

function distanceToBoundsSquared({ x, y }: Point, bounds: WorldBounds): number {
  return (x - clamp(x, bounds.left, bounds.right)) ** 2 + (y - clamp(y, bounds.top, bounds.bottom)) ** 2;
}

function overlapsView(point: Point, view: WorldBounds, margin: number): boolean {
  return point.x >= view.left - margin && point.x <= view.right + margin &&
    point.y >= view.top - margin && point.y <= view.bottom + margin;
}

function canWake(site: Site, { fields, view }: Interest, margin = regionConfig.visibilityMargin): boolean {
  return (!view || !overlapsView(site, view, margin + scrapConfig.radius)) &&
    fields.every((field) => (site.x - field.x) ** 2 + (site.y - field.y) ** 2 > field.reach ** 2);
}

function insideProtectedArea(slot: Scrap, { fields, view }: Interest): boolean {
  return (view !== undefined && overlapsView(slot, view, regionConfig.retentionMargin + scrapConfig.radius)) ||
    fields.some((field) => (slot.x - field.x) ** 2 + (slot.y - field.y) ** 2 <=
      (field.reach + regionConfig.retentionMargin) ** 2);
}

function spansWorld(view: WorldBounds): boolean {
  return view.left <= scrapConfig.radius && view.top <= scrapConfig.radius &&
    view.right >= arena.width - scrapConfig.radius && view.bottom >= arena.height - scrapConfig.radius;
}

// One physical slot per live site. Sleeping sites keep their position until
// the region expires or loses its cache entry. Collections alone renew a site.
export class ScrapRegions {
  private readonly cached = new Map<number, Region>();
  private readonly epochs = new Uint32Array(definitions.length);
  private readonly bindings: (Site | undefined)[] = [];
  private readonly order = definitions.map((region) => ({ ...region, rank: 0 }));
  private readonly candidates: Site[] = [];
  private readonly free: Scrap[] = [];
  private clock = 0;
  private nextPlan = 0;
  private planId = 0;
  private reserveIndex = 0;
  private readonly counts = {
    plans: 0, activated: 0, deactivated: 0, renewed: 0, loaded: 0, evicted: 0,
    duplicateActivations: 0, visibleFallbacks: 0, peakCachedRegions: 0,
  };

  constructor(private readonly seed: number, private readonly slots: readonly Scrap[]) {}

  get stats() {
    let liveRegions = 0;
    let logicalSites = 0;
    for (const region of this.cached.values()) {
      if (region.live > 0) liveRegions++;
      logicalSites += region.sites.length;
    }
    return { ...this.counts, cachedRegions: this.cached.size, liveRegions, logicalSites };
  }

  update(participants: readonly Participant[], view: WorldBounds | undefined, seconds: number, collected: readonly Scrap[]): void {
    if (this.slots.length === 0) return;
    this.clock += seconds;
    for (const slot of collected) {
      const site = this.sleep(slot);
      site.revision++;
      this.place(site);
      this.counts.renewed++;
      this.free.push(slot);
    }
    if (this.clock < this.nextPlan && this.free.length === 0) return;

    const interest: Interest = {
      fields: participants.map(({ position, physicalScale, radius }) => ({
        ...position, reach: Math.max(attractionReach(physicalScale), radius + scrapConfig.radius),
      })),
      view,
    };
    if (this.clock >= this.nextPlan || !this.fillReserve(interest)) this.plan(interest);
  }

  private place(site: Site): void {
    const { left, top, right, bottom } = site.region.bounds;
    const radius = scrapConfig.radius;
    const x = Math.max(left, radius);
    const y = Math.max(top, radius);
    const random = seedRandom(this.seed ^ Math.imul(site.id + 1, 0x9e3779b9) ^
      Math.imul(site.revision, 0x165667b1) ^ Math.imul(this.epochs[site.region.id], 0x85ebca6b));
    site.x = x + random() * (Math.min(right, arena.width - radius) - x);
    site.y = y + random() * (Math.min(bottom, arena.height - radius) - y);
    site.colorIndex = Math.floor(random() * scrapConfig.colorCount);
  }

  private sleep(slot: Scrap): Site {
    const site = this.bindings[slot.id]!;
    site.x = slot.x;
    site.y = slot.y;
    site.slot = undefined;
    site.region.live--;
    site.region.lastUsed = this.clock;
    this.bindings[slot.id] = undefined;
    slot.resourceId = undefined;
    slot.state = 'inactive';
    return site;
  }

  private wake(site: Site, slot: Scrap): void {
    if (site.slot) {
      this.counts.duplicateActivations++;
      throw new Error('Scrap site already has a physical slot');
    }
    this.bindings[slot.id] = site;
    site.slot = slot;
    site.region.live++;
    site.region.lastUsed = this.clock;
    slot.resourceId = site.id;
    slot.generation++;
    slot.state = 'active';
    slot.x = site.x;
    slot.y = site.y;
    slot.colorIndex = site.colorIndex;
    this.counts.activated++;
  }

  private fillReserve(interest: Interest): boolean {
    while (this.free.length && this.reserveIndex < this.candidates.length) {
      const site = this.candidates[this.reserveIndex++];
      if (!site.slot && canWake(site, interest)) this.wake(site, this.free.pop()!);
    }
    return this.free.length === 0;
  }

  private plan(interest: Interest): void {
    this.planId++;
    this.counts.plans++;
    this.nextPlan = this.clock + regionConfig.planSeconds;
    this.candidates.length = 0;
    this.free.length = 0;
    let needed = this.slots.length;
    for (const slot of this.slots) {
      const site = this.bindings[slot.id];
      if (!site) continue;
      if (insideProtectedArea(slot, interest)) {
        site.selected = this.planId;
        needed--;
      } else {
        const distance = Math.sqrt(this.rank(slot, interest));
        site.rank = Math.max(0, distance - regionConfig.retentionMargin) ** 2;
        this.candidates.push(site);
      }
    }

    this.rankRegions(interest);
    if (!interest.view || !spansWorld(interest.view)) {
      // Old slots can be far outside the current interests. Collect enough nearby offers independently.
      this.scan(interest, this.candidates.length + needed + regionConfig.reserveSites);
      // A narrow offscreen band can fit scrap even if the safety margin does not.
      if (this.candidates.length < needed) this.scan(interest, needed, 0);
    }
    this.candidates.sort((a, b) => a.rank - b.rank || a.id - b.id);
    const preferred = this.candidates.length;
    if (preferred < needed) this.scan({ ...interest, view: undefined }, needed);
    if (this.candidates.length < needed) throw new Error('Scrap budget has no legal sites');

    for (let i = 0; i < needed; i++) this.candidates[i].selected = this.planId;
    for (const slot of this.slots) {
      const site = this.bindings[slot.id];
      if (site && site.selected === this.planId) continue;
      if (site) {
        this.sleep(slot);
        this.counts.deactivated++;
      }
      this.free.push(slot);
    }
    for (let i = 0; i < needed; i++) {
      const site = this.candidates[i];
      if (site.slot) continue;
      if (i >= preferred && interest.view && overlapsView(site, interest.view, scrapConfig.radius)) {
        this.counts.visibleFallbacks++;
      }
      this.wake(site, this.free.pop()!);
    }
    this.reserveIndex = needed;
    this.prune();
  }

  private rank(point: Point, { fields, view }: Interest): number {
    let rank = view ? regionConfig.prefetchOffset ** 2 + distanceToBoundsSquared(point, view) : Infinity;
    for (const field of fields) rank = Math.min(rank, (point.x - field.x) ** 2 + (point.y - field.y) ** 2);
    return rank;
  }

  private rankRegions({ fields, view }: Interest): void {
    for (const entry of this.order) {
      let rank = Infinity;
      const { left, top, right, bottom } = entry.bounds;
      if (view) {
        const dx = Math.max(0, view.left - right, left - view.right);
        const dy = Math.max(0, view.top - bottom, top - view.bottom);
        rank = regionConfig.prefetchOffset ** 2 + dx * dx + dy * dy;
      }
      for (const field of fields) rank = Math.min(rank, distanceToBoundsSquared(field, entry.bounds));
      entry.rank = rank;
    }
    this.order.sort((a, b) => a.rank - b.rank || a.id - b.id);
  }

  private scan(interest: Interest, limit: number, margin = regionConfig.visibilityMargin): void {
    const view = interest.view;
    for (const entry of this.order) {
      if (this.candidates.length >= limit) break;
      const { left, top, right, bottom } = entry.bounds;
      if (view && left >= view.left && top >= view.top && right <= view.right && bottom <= view.bottom) continue;
      const region = this.load(entry.id);
      if (!region) continue;
      for (const site of region.sites) {
        if (site.slot || site.listed === this.planId || !canWake(site, interest, margin)) continue;
        site.listed = this.planId;
        site.rank = this.rank(site, interest);
        this.candidates.push(site);
      }
    }
  }

  private load(id: number): Region | undefined {
    let region = this.cached.get(id);
    if (!region) {
      if (this.cached.size >= regionConfig.cacheLimit && !this.evictOldest()) return;
      const bounds = definitions[id].bounds;
      region = { id, bounds, sites: [], lastUsed: this.clock, lastPlan: this.planId, live: 0 };
      const count = Math.round((bounds.right - bounds.left) * (bounds.bottom - bounds.top) * regionConfig.sitesPerUnitArea);
      for (let index = 0; index < count; index++) {
        const site: Site = {
          id: id * sitesPerRegion + index, region, revision: 0, x: 0, y: 0, colorIndex: 0,
          rank: 0, listed: 0, selected: 0,
        };
        this.place(site);
        region.sites.push(site);
      }
      this.cached.set(id, region);
      this.counts.loaded++;
      this.counts.peakCachedRegions = Math.max(this.counts.peakCachedRegions, this.cached.size);
    }
    region.lastPlan = this.planId;
    region.lastUsed = this.clock;
    return region;
  }

  private evictOldest(): boolean {
    let oldest: Region | undefined;
    for (const region of this.cached.values()) {
      if (region.live || region.lastPlan === this.planId) continue;
      if (!oldest || region.lastUsed < oldest.lastUsed ||
          (region.lastUsed === oldest.lastUsed && region.id < oldest.id)) oldest = region;
    }
    if (!oldest) return false;
    this.evict(oldest);
    return true;
  }

  private prune(): void {
    for (const region of this.cached.values()) {
      if (!region.live && this.clock - region.lastUsed >= regionConfig.cacheSeconds) this.evict(region);
    }
  }

  private evict(region: Region): void {
    this.cached.delete(region.id);
    this.epochs[region.id]++;
    this.counts.evicted++;
  }
}
