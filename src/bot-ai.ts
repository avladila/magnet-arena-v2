import { botTactics, tacticsConfig, theftConfig } from './competition-config';
import type { Difficulty } from './match';
import type { Bot, BotTarget } from './bots';
import { arena, botConfig, playerConfig } from './config';
import { clampToArena, type Participant, type Point } from './movement';
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
  private readonly energyCells = new Float32Array(columns * rows);
  private readonly occupiedCells: number[] = [];

  update(bots: readonly Bot[], slots: readonly Scrap[], seconds: number, difficulty?: Difficulty,
      kindOf?: (scrap: Scrap) => ResourceKind, participants?: readonly Participant[]): void {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return;
    const profile = difficulty && tacticsConfig[difficulty];
    const decision = profile ? profile.decision : collector.decisionSeconds;
    const search = profile ? profile.search : collector.searchRadius;
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
      if (bot.strategy !== 'roamer' || (onRoute && kindOf && bot.random() < 0.24)) {
        if (!densityReady) {
          for (const index of this.occupiedCells) {
            this.density[index] = 0;
            this.energyCells[index] = 0;
          }
          this.occupiedCells.length = 0;
          for (const scrap of slots) {
            if (scrap.state !== 'active') continue;
            const index = cell(scrap);
            if (this.density[index] === 0) this.occupiedCells.push(index);
            const kind = kindOf?.(scrap);
            this.density[index] += kind === 'gold' && profile ? profile.gold : 1;
            if (kind === 'energy') this.energyCells[index]++;
          }
          densityReady = true;
        }
        const role = botTactics[bot.strategy].charge;
        const charging = role && bot.combat.energy < theftConfig.energy;
        const energy = profile ? (charging ? profile.charge * role : bot.combat.energy < theftConfig.energy ? profile.energy - 1 : 0) : 0;
        const target = this.pickRoute(bot, arrival, charging ? search * 1.22 : search, decision, energy,
          profile ? profile.density : collector.densityWeight, profile ? profile.overrun : Infinity, participants);
        if (target) {
          bot.target = target;
        } else if (!onRoute || bot.target?.kind === 'region') {
          bot.target = { kind: 'waypoint', point: waypoint(bot) };
        }
        bot.decisionIn = decision;
      } else {
        bot.target = { kind: 'waypoint', point: waypoint(bot) };
        bot.decisionIn = roamer.reconsiderMinSeconds + bot.random() *
          (roamer.reconsiderMaxSeconds - roamer.reconsiderMinSeconds) + (difficulty ? 1.4 : 0);
      }
    }
  }

  private pickRoute(bot: Bot, arrival: number, search: number, decision: number, energy: number,
      densityWeight: number, overrun: number, participants?: readonly Participant[]): BotTarget | undefined {
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
        const population = this.density[index] + this.energyCells[index] * energy;
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
          Math.max(minimum, distance, Math.min(preferred, distance + overrun)),
          distanceToWall(x, ux, arena.width, margin),
          distanceToWall(y, uy, arena.height, margin),
        );
        if (travel < Math.max(minimum, distance - arrival)) continue;

        const alignment = moving ? (1 + ux * forwardX + uy * forwardY) / 2 : 1;
        let shared = 1;
        // A rival can make an existing supply cell worth contesting. The route still goes through the cell.
        if (participants && this.density[index] >= 3) {
          for (const rival of participants) {
            if (rival === bot) continue;
            const dx = center.x - rival.position.x - rival.velocity.x * 0.32;
            const dy = center.y - rival.position.y - rival.velocity.y * 0.32;
            const vicinity = (rival.radius + 490) ** 2;
            const distance = dx * dx + dy * dy;
            if (distance >= vicinity) continue;
            const danger = rival.combat.energy === theftConfig.energy && bot.physicalScale >= 4;
            shared = Math.max(shared, 1 + (danger ? 0.07 : 0.79) * (1 - distance / vicinity));
          }
        }
        const score = (1 + densityWeight * (population - 1)) *
          (1 - collector.turnPenalty * (1 - alignment)) * shared / (1 + distance / collector.distanceBias);
        if (score <= bestScore) continue;
        bestScore = score;
        best = { kind: 'region', cell: index, point: { x: x + ux * travel, y: y + uy * travel } };
      }
    }
    return best;
  }
}
