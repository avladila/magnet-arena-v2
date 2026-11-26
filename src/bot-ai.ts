import { tacticsConfig } from './competition-config';
import type { Difficulty } from './match';
import type { Bot, BotTarget } from './bots';
import { arena, botConfig, playerConfig } from './config';
import { clampToArena, type Point } from './movement';
import type { ResourceKind, Scrap } from './particles';

const { collector, roamer } = botConfig;
const columns = Math.ceil(arena.width / collector.cellSize);
const rows = Math.ceil(arena.height / collector.cellSize);

function distanceSquared(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function cell({ x, y }: Point): number {
  const column = Math.min(Math.floor(x / collector.cellSize), columns - 1);
  const row = Math.min(Math.floor(y / collector.cellSize), rows - 1);
  return row * columns + column;
}

function cellCenter(index: number): Point {
  const left = (index % columns) * collector.cellSize;
  const top = Math.floor(index / columns) * collector.cellSize;
  return {
    x: (left + Math.min(left + collector.cellSize, arena.width)) / 2,
    y: (top + Math.min(top + collector.cellSize, arena.height)) / 2,
  };
}

function distanceToWall(position: number, direction: number, limit: number, margin: number): number {
  if (direction === 0) return Infinity;
  return ((direction > 0 ? limit - margin : margin) - position) / direction;
}

function waypoint(bot: Bot): Point {
  for (let attempt = 0; attempt < 6; attempt++) {
    const angle = bot.random() * 2 * Math.PI;
    const distance = roamer.waypointMinDistance +
      bot.random() * (roamer.waypointMaxDistance - roamer.waypointMinDistance);
    const goal = clampToArena({
      x: bot.position.x + Math.cos(angle) * distance,
      y: bot.position.y + Math.sin(angle) * distance,
    }, bot.radius + roamer.wallInset);
    if (distanceSquared(goal, bot.position) >= roamer.waypointMinDistance ** 2) return goal;
  }
  return { x: bot.position.x < arena.width / 2 ? arena.width * 0.75 : arena.width * 0.25, y: arena.height / 2 };
}

export class BotAI {
  private readonly density = new Float32Array(columns * rows);
  private readonly chargeDensity = new Float32Array(columns * rows);
  private readonly occupiedCells: number[] = [];

  update(bots: readonly Bot[], slots: readonly Scrap[], seconds: number, difficulty?: Difficulty,
      weight?: (scrap: Scrap) => number, kindOf?: (scrap: Scrap) => ResourceKind): void {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return;
    const decision = difficulty ? tacticsConfig[difficulty].decision : collector.decisionSeconds;
    const search = difficulty ? tacticsConfig[difficulty].search : collector.searchRadius;
    let densityReady = false;
    for (const bot of bots) {
      bot.decisionIn -= seconds;
      if (bot.target && bot.navigation.mode !== 'direct') continue;
      const arrival = bot.strategy === 'roamer' ? roamer.arrivalRadius : bot.radius * collector.arrivalRadiusRatio;
      const goal = bot.target?.point;
      const onRoute = goal !== undefined && distanceSquared(bot.position, goal) > arrival ** 2 &&
        (bot.strategy === 'roamer' || (goal.x >= bot.radius && goal.x <= arena.width - bot.radius &&
          goal.y >= bot.radius && goal.y <= arena.height - bot.radius));
      if (onRoute && bot.decisionIn > 0) continue;
      if (difficulty === 'easy') {
        if (bot.thinkFor !== undefined) {
          bot.thinkFor -= seconds;
          if (bot.thinkFor > 0) continue;
          bot.thinkFor = undefined;
        } else if (bot.target) {
          bot.target = undefined;
          bot.thinkFor = 0.85 + bot.random() * 0.4;
          continue;
        }
      }

      if (bot.strategy !== 'roamer' || (weight && bot.random() < 0.55)) {
        if (!densityReady) {
          for (const index of this.occupiedCells) {
            this.density[index] = 0;
            this.chargeDensity[index] = 0;
          }
          this.occupiedCells.length = 0;
          for (const scrap of slots) {
            if (scrap.state !== 'active') continue;
            const index = cell(scrap);
            if (this.density[index] === 0) this.occupiedCells.push(index);
            this.density[index] += weight?.(scrap) ?? 1;
            if (kindOf) this.chargeDensity[index] += kindOf(scrap) === 'energy' ? 12 : 1;
          }
          densityReady = true;
        }
        const charging = kindOf && bot.strategy === 'charger' && bot.combat.energy < 100;
        const target = this.pickRoute(bot, arrival, charging ? search * 1.2 : search, decision,
          charging ? this.chargeDensity : this.density);
        if (target) {
          bot.target = target;
        } else if (!onRoute || bot.target?.kind === 'region') {
          bot.target = { kind: 'waypoint', point: waypoint(bot) };
        }
        bot.decisionIn = decision;
      } else {
        bot.target = { kind: 'waypoint', point: waypoint(bot) };
        bot.decisionIn = roamer.reconsiderMinSeconds +
          bot.random() * (roamer.reconsiderMaxSeconds - roamer.reconsiderMinSeconds);
      }
    }
  }

  private pickRoute(bot: Bot, arrival: number, search: number, decision: number, density: Float32Array): BotTarget | undefined {
    const { x, y } = bot.position;
    const forwardX = Math.cos(bot.heading);
    const forwardY = Math.sin(bot.heading);
    const moving = bot.velocity.x !== 0 || bot.velocity.y !== 0;
    const margin = bot.radius + collector.wallMargin;
    const minimum = playerConfig.speed * collector.minCommitmentSeconds + arrival;
    const preferred = playerConfig.speed * decision + arrival;
    let best: BotTarget | undefined;
    let bestScore = 0;

    const firstColumn = Math.max(0, Math.floor((x - search) / collector.cellSize));
    const lastColumn = Math.min(columns - 1, Math.floor((x + search) / collector.cellSize));
    const firstRow = Math.max(0, Math.floor((y - search) / collector.cellSize));
    const lastRow = Math.min(rows - 1, Math.floor((y + search) / collector.cellSize));
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const index = row * columns + column;
        const population = density[index];
        if (population === 0) continue;
        const center = cellCenter(index);
        const dx = center.x - x;
        const dy = center.y - y;
        const distance = Math.hypot(dx, dy);
        if (distance < collector.cellSize / 2 || distance > search) continue;
        const ux = dx / distance;
        const uy = dy / distance;
        // Continue through the cell so nearby pickups do not end the route.
        // Reject directions without enough room to commit before the wall.
        const travel = Math.min(
          Math.max(preferred, distance),
          distanceToWall(x, ux, arena.width, margin),
          distanceToWall(y, uy, arena.height, margin),
        );
        if (travel < Math.max(minimum, distance - arrival)) continue;

        const alignment = moving ? (1 + ux * forwardX + uy * forwardY) / 2 : 1;
        const score = (1 + collector.densityWeight * (population - 1)) *
          (1 - collector.turnPenalty * (1 - alignment)) / (1 + distance / collector.distanceBias);
        if (score <= bestScore) continue;
        bestScore = score;
        best = { kind: 'region', cell: index, point: { x: x + ux * travel, y: y + uy * travel } };
      }
    }
    return best;
  }
}
