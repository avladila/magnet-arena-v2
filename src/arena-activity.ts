import { activityConfig as config } from './competition-config';
import { arena } from './config';
import type { Participant, Point } from './movement';
import type { Scrap } from './particles';
import { seedRandom } from './random';

export type Hotspot = Point & { readonly radius: number; readonly starts: number; readonly expires: number; strength: number };
export type SalvageSignal = Point & { readonly starts: number; readonly expires: number; resources: number };

const side = 720;
const columns = Math.ceil(arena.width / side);
const rows = Math.ceil(arena.height / side);
const band = config.radius ** 2;
const survey = 0.85;
const distanceSquared = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const cellAt = ({ x, y }: Point) => Math.min(rows - 1, Math.floor(y / side)) * columns + Math.min(columns - 1, Math.floor(x / side));

export class ArenaActivity {
  readonly hotspots: Hotspot[] = [];
  signal?: SalvageSignal;
  private nextSurvey = 0;
  private nextSignal: number;
  private readonly random: () => number;
  private readonly counts = new Uint16Array(columns * rows);
  private readonly xTotal = new Float64Array(columns * rows);
  private readonly yTotal = new Float64Array(columns * rows);
  private readonly scratch: { point: Point; score: number; competitors: number }[] = [];

  constructor(seed: number) {
    this.random = seedRandom(seed ^ 0xa27ac201);
    this.nextSignal = config.firstSignal + this.random() * config.signalJitter;
  }

  update(time: number, slots: readonly Scrap[], participants: readonly Participant[]): void {
    if (this.signal && time >= this.signal.expires) this.signal = undefined;
    if (time < this.nextSurvey && time < this.nextSignal && !this.hotspots.some(({ expires }) => expires <= time)) return;
    this.nextSurvey = time + survey;
    const needsHotspots = this.hotspots.length < config.count || this.hotspots.some(({ expires }) => expires <= time);
    const needsSignal = time >= this.nextSignal;
    if (needsHotspots || needsSignal) this.findSites(slots, participants);

    // Hotspots change the order of existing legal offers in the region manager.
    for (let i = 0; i < config.count; i++) {
      const spot = this.hotspots[i];
      if (!spot || time >= spot.expires) {
        const choice = this.scratch.find(({ point }) => (!spot || distanceSquared(point, spot) > config.spacing ** 2) &&
          this.hotspots.every((other) => other === spot || distanceSquared(point, other) > config.spacing ** 2));
        if (choice) {
          const lifetime = config.lifetime + this.random() * config.lifetimeJitter;
          this.hotspots[i] = { ...choice.point, radius: config.radius, starts: time, expires: time + lifetime, strength: 0 };
        } else if (spot) {
          this.hotspots.splice(i, 1);
          i--;
        } else break;
      }
      const active = this.hotspots[i];
      if (active) active.strength = Math.max(0, Math.min(1, (time - active.starts) / config.fade, (active.expires - time) / config.fade));
    }

    if (this.signal) {
      this.signal.resources = this.countNear(slots, this.signal);
      if (this.signal.resources < config.depleted) this.signal = undefined;
    }
    if (!needsSignal) return;
    const selected = this.scratch.find(({ point, competitors }) => competitors >= 3 && this.countNear(slots, point) >= config.signalMinimum);
    if (!selected) {
      this.nextSignal = time + 2;
      return;
    }
    this.signal = { ...selected.point, starts: time, expires: time + config.signalDuration, resources: this.countNear(slots, selected.point) };
    this.nextSignal = time + config.signalInterval + this.random() * config.signalJitter;
  }

  private findSites(slots: readonly Scrap[], participants: readonly Participant[]): void {
    this.counts.fill(0);
    this.xTotal.fill(0);
    this.yTotal.fill(0);
    for (const scrap of slots) {
      if (scrap.state !== 'active') continue;
      const cell = cellAt(scrap);
      this.counts[cell]++;
      this.xTotal[cell] += scrap.x;
      this.yTotal[cell] += scrap.y;
    }
    this.scratch.length = 0;
    for (let i = 0; i < this.counts.length; i++) {
      const count = this.counts[i];
      if (count < config.depleted) continue;
      const point = { x: this.xTotal[i] / count, y: this.yTotal[i] / count };
      if (point.x < 280 || point.x > arena.width - 280 || point.y < 280 || point.y > arena.height - 280) continue;
      let competitors = 0;
      let present = 0;
      let approach = 0;
      for (const { position } of participants) {
        const d = distanceSquared(point, position);
        if (d < band) present++;
        if (d > config.signalTravel ** 2) continue;
        competitors++;
        approach += Math.max(0, 1 - d / config.signalTravel ** 2);
      }
      const score = count + Math.min(7, competitors) * 2.8 + Math.min(4, approach) * 2.3 - Math.max(0, present - 2) * 3 + this.random() * 3;
      this.scratch.push({ point, score, competitors });
    }
    this.scratch.sort((a, b) => b.score - a.score);
  }

  private countNear(slots: readonly Scrap[], point: Point): number {
    let count = 0;
    for (const scrap of slots) if (scrap.state === 'active' && distanceSquared(scrap, point) <= band) count++;
    return count;
  }
}
