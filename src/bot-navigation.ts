import { hazardConfig, navigationConfig as config } from './competition-config';
import { arena, playerConfig, viewConfig } from './config';
import type { Hazard } from './hazards';
import { clamp, clampToArena, type Participant, type Point, type Steering } from './movement';
import { shortestAngle } from './view';

type Side = -1 | 1;
type Route = {
  mode: 'detour' | 'escape' | 'recover';
  obstacle: Hazard;
  side?: Side;
  waypoints: Point[];
  index: number;
  committedUntil: number;
};

const lookAhead = playerConfig.speed * config.lookAheadSeconds;
const arcStep = Math.PI / 6;
const maxHazardRadius = Math.max(...Object.values(hazardConfig).map((site) => site.radius));
const idle: Steering = { kind: 'idle' };

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function bearing(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function inArena(point: Point, radius: number): boolean {
  return point.x >= radius && point.y >= radius && point.x <= arena.width - radius && point.y <= arena.height - radius;
}

function advancePoint(point: Point, angle: number, length: number): Point {
  return { x: point.x + length * Math.cos(angle), y: point.y + length * Math.sin(angle) };
}

function segmentDistanceSquared(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / length, 0, 1);
  return (a.x + t * dx - p.x) ** 2 + (a.y + t * dy - p.y) ** 2;
}

export class BotNavigation {
  strategicTarget?: Point;
  activeWaypoint?: Point;
  stuckRecoveries = 0;
  stuckTime = 0;

  private readonly nearby: Hazard[] = [];
  private route?: Route;
  private heading?: number;
  private elapsed = 0;
  private emergency = false;
  private newDestination = false;
  private progress?: { position: Point; target: Point; time: number };

  get mode() { return this.route?.mode ?? 'direct'; }
  get avoidanceSide() { return this.route?.side; }

  takeReplanRequest(): boolean {
    const requested = this.newDestination;
    this.newDestination = false;
    return requested;
  }

  steer(bot: Participant<'bot'>, target: Point | undefined, sites: readonly Hazard[],
      safety: number, avoidCold: boolean, seconds: number, emergency = false): Steering {
    this.elapsed += seconds;
    const position = bot.position;
    const margin = bot.radius + safety + config.clearance;
    const goal = target && clampToArena(target, bot.radius);
    this.strategicTarget = goal;
    this.findNearby(bot, sites, margin, avoidCold);

    // A newly committed dodge may change the goal. Keep following it after that first step.
    if ((emergency && !this.emergency) || (this.route && !sites.includes(this.route.obstacle))) this.route = undefined;
    this.emergency = emergency;
    const trapped = this.nearby.find((site) => distance(site, position) < site.radius + bot.radius);
    const stuck = this.stalled(position, this.route ? this.activeWaypoint : goal);
    if (stuck) {
      this.stuckRecoveries++;
      this.stuckTime += config.stuckSeconds;
    }

    if (this.route && !trapped && this.elapsed >= this.route.committedUntil && goal &&
        this.clearExit(position, goal, this.route.obstacle, margin)) this.route = undefined;

    if (this.route) {
      const { waypoints } = this.route;
      while (this.route.index < waypoints.length) {
        const isExit = this.route.index === waypoints.length - 1;
        // Intermediate points can be rounded off. The final point was chosen for its sightline.
        if (distance(position, waypoints[this.route.index]) > (isExit ? 2 : config.waypointArrival)) break;
        this.route.index++;
      }
      const next = waypoints[this.route.index];
      if (!next && this.route.mode === 'recover') {
        this.newDestination = true;
        this.route = undefined;
        this.activeWaypoint = undefined;
        this.progress = undefined;
        return idle;
      }
      if (stuck || !next || !inArena(next, bot.radius) ||
          (this.route.mode === 'detour' && (trapped || !this.canTravel(position, next, margin)))) {
        const previous = this.route;
        const obstacle = trapped ?? previous.obstacle;
        this.route = this.plan(bot, goal, obstacle, margin, trapped !== undefined,
          previous.side && (stuck ? (previous.side === 1 ? -1 : 1) : previous.side));
      }
    } else {
      const obstacle = trapped ?? (goal && this.firstObstacle(position, goal, margin));
      if (obstacle) this.route = this.plan(bot, goal, obstacle, margin, trapped !== undefined);
      else if (stuck && goal) {
        this.newDestination = true;
        this.activeWaypoint = undefined;
        return idle;
      }
    }

    const waypoint = this.route?.waypoints[this.route.index] ?? goal;
    this.activeWaypoint = waypoint;
    if (!waypoint) {
      this.progress = undefined;
      return idle;
    }
    return this.move(bot, waypoint, seconds, emergency || this.route?.mode === 'escape');
  }

  private findNearby(bot: Participant<'bot'>, sites: readonly Hazard[], margin: number, avoidCold: boolean): void {
    this.nearby.length = 0;
    const range = lookAhead + 2 * (margin + maxHazardRadius + config.exitClearance);
    for (const site of sites) {
      if ((site.kind === 'flux' && bot.mass < hazardConfig.flux.threshold) ||
          (site.kind === 'cold' && !avoidCold && this.route?.obstacle !== site)) continue;
      const maxDistance = range + site.radius;
      if (Math.abs(site.x - bot.position.x) <= maxDistance && Math.abs(site.y - bot.position.y) <= maxDistance) {
        this.nearby.push(site);
      }
    }
  }

  private firstObstacle(start: Point, goal: Point, margin: number): Hazard | undefined {
    const length = distance(start, goal);
    if (length === 0) return undefined;
    const dx = (goal.x - start.x) / length;
    const dy = (goal.y - start.y) / length;
    let nearest = Math.min(length, lookAhead);
    let obstacle: Hazard | undefined;
    for (const site of this.nearby) {
      const x = site.x - start.x;
      const y = site.y - start.y;
      const projection = x * dx + y * dy;
      const radius = site.radius + margin;
      if (projection < 0 || projection - radius > nearest) continue;
      const cross = x * dy - y * dx;
      if (Math.abs(cross) >= radius) continue;
      const entry = projection - Math.sqrt(radius * radius - cross * cross);
      if (entry <= nearest) {
        nearest = entry;
        obstacle = site;
      }
    }
    return obstacle;
  }

  private clearExit(start: Point, goal: Point, obstacle: Hazard, margin: number): boolean {
    return segmentDistanceSquared(start, goal, obstacle) >= (obstacle.radius + margin + config.exitClearance) ** 2 &&
      !this.firstObstacle(start, goal, margin);
  }

  private canTravel(start: Point, end: Point, margin: number): boolean {
    for (const site of this.nearby) {
      const radius = site.radius + margin;
      if (segmentDistanceSquared(start, end, site) >= radius * radius) continue;
      // Growth and neighboring clearance margins can put the bot inside a circle.
      // A segment that immediately increases clearance is still a legal exit.
      const x = start.x - site.x;
      const y = start.y - site.y;
      if (x * x + y * y < radius * radius && x * (end.x - start.x) + y * (end.y - start.y) >= 0) continue;
      return false;
    }
    return true;
  }

  private plan(bot: Participant<'bot'>, goal: Point | undefined, obstacle: Hazard,
      margin: number, escape: boolean, preferred?: Side): Route {
    const committedUntil = this.elapsed + config.commitmentSeconds;
    if (!escape && goal) {
      const left = this.around(bot, goal, obstacle, margin, -1);
      const right = this.around(bot, goal, obstacle, margin, 1);
      const chosen = (preferred === -1 ? left : preferred === 1 ? right : undefined) ??
        (left && (!right || left.cost <= right.cost) ? left : right);
      if (chosen) return { mode: 'detour', obstacle, side: chosen.side, waypoints: chosen.path, index: 0, committedUntil };
    }
    return { mode: escape ? 'escape' : 'recover', obstacle,
      waypoints: [this.fallback(bot, goal, obstacle, margin, escape)], index: 0, committedUntil };
  }

  private around(bot: Participant<'bot'>, goal: Point, obstacle: Hazard, margin: number, side: Side) {
    const radius = obstacle.radius + margin;
    const exit = radius + config.exitClearance;
    if (distance(obstacle, goal) < exit) return undefined;
    const ring = (exit + config.waypointArrival) / Math.cos(arcStep / 2);
    const startAngle = bearing(obstacle, bot.position);
    const startDistance = distance(obstacle, bot.position);
    const firstAngle = startDistance > ring ? Math.acos(ring / startDistance) : arcStep;
    const path: Point[] = [];
    let previous = bot.position;
    let travel = 0;
    for (let i = 0; i < 10; i++) {
      const next = advancePoint(obstacle, startAngle + side * (firstAngle + i * arcStep), ring);
      if (!inArena(next, bot.radius) || !this.canTravel(previous, next, margin)) return undefined;
      travel += distance(previous, next);
      path.push(next);
      if (this.clearExit(next, goal, obstacle, margin + 8)) {
        const turn = Math.abs(shortestAngle(this.heading ?? bot.heading, bearing(bot.position, path[0])));
        return { side, path, cost: travel + distance(next, goal) + turn * 85 };
      }
      previous = next;
    }
  }

  private fallback(bot: Participant<'bot'>, goal: Point | undefined, obstacle: Hazard, margin: number, escape: boolean): Point {
    const origin = bot.position;
    const angle = escape ? bearing(obstacle, origin) : goal ? bearing(origin, goal) : bot.heading;
    const length = Math.max(lookAhead, obstacle.radius + margin + config.exitClearance - distance(obstacle, origin) + lookAhead / 2);
    let best = origin;
    let bestCost = Infinity;
    for (let i = 0; i < 16; i++) {
      const direction = angle + i * Math.PI / 8;
      const point = advancePoint(origin, direction, length);
      if (!inArena(point, bot.radius)) continue;
      let cost = (goal ? distance(point, goal) * 0.3 : 0) +
        Math.abs(shortestAngle(this.heading ?? bot.heading, direction)) * 28;
      for (const site of this.nearby) {
        const radius = site.radius + margin;
        const start = distance(site, origin);
        const end = distance(site, point);
        const nearest = Math.sqrt(segmentDistanceSquared(origin, point, site));
        if (start < radius) {
          cost += Math.max(0, radius + config.exitClearance - end) * 9 + Math.max(0, start - nearest) * 12;
        } else {
          cost += Math.max(0, radius - nearest) * 8 + Math.max(0, site.radius + bot.radius - nearest) * 16;
        }
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = point;
      }
    }
    return best;
  }

  private stalled(position: Point, target: Point | undefined): boolean {
    if (!target || distance(position, target) <= config.waypointArrival) {
      this.progress = undefined;
      return false;
    }
    const progress = this.progress;
    if (!progress || distance(target, progress.target) > config.waypointArrival * 2) {
      this.progress = { position, target, time: this.elapsed };
      return false;
    }
    if (this.elapsed - progress.time < config.stuckSeconds) return false;
    this.progress = { position, target, time: this.elapsed };
    const expected = playerConfig.speed * (this.elapsed - progress.time) * config.stuckProgress;
    return distance(position, progress.position) < expected ||
      distance(progress.position, progress.target) - distance(position, progress.target) < expected;
  }

  private move(bot: Participant<'bot'>, target: Point, seconds: number, emergency: boolean): Steering {
    const { position, radius } = bot;
    const remaining = distance(position, target);
    if (remaining < 1) return idle;
    const aim = bearing(position, target);
    const rate = emergency ? config.emergencyTurnRate : config.turnRate;
    const from = this.heading ?? (Math.hypot(bot.velocity.x, bot.velocity.y) >= viewConfig.headingMinSpeed ? bot.heading : aim);
    const turn = shortestAngle(from, aim);
    this.heading = from + clamp(turn, -rate * seconds, rate * seconds);
    const x = Math.cos(this.heading);
    const y = Math.sin(this.heading);
    const arrivalSpeed = Math.abs(turn) > 0.2 ? remaining * rate : remaining / seconds;
    let strength = Math.min(1, arrivalSpeed / playerConfig.speed);
    const lookDistance = playerConfig.speed * Math.max(seconds, config.turnLookAheadSeconds);
    if (Math.abs(turn) > rate * seconds) {
      // Preserve the turn's direction by slowing before the wall clips one velocity component.
      const roomX = Math.max(0, x < 0 ? position.x - radius : arena.width - radius - position.x);
      const roomY = Math.max(0, y < 0 ? position.y - radius : arena.height - radius - position.y);
      const travelX = Math.abs(x) * lookDistance;
      const travelY = Math.abs(y) * lookDistance;
      if (travelX > roomX) strength = Math.min(strength, roomX / travelX);
      if (travelY > roomY) strength = Math.min(strength, roomY / travelY);
    }
    if (Math.abs(turn) > Math.PI / 6 && this.nearby.length > 0 && this.route?.mode !== 'escape') {
      // Give a sharp turn a tighter arc when its current tangent points into trouble.
      const tangent = { x: position.x + x * lookDistance, y: position.y + y * lookDistance };
      if (this.firstObstacle(position, tangent, radius + config.clearance)) {
        strength = Math.min(strength, config.hazardTurningSpeedScale);
      }
    }
    return { kind: 'joystick', point: { x: strength * x, y: strength * y } };
  }
}
