import type { Bot } from './bots';
import { arena, botConfig } from './config';
import { clampToArena, type Point } from './movement';
import type { Scrap } from './particles';

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
  private readonly density = new Uint16Array(columns * rows);

  update(bots: readonly Bot[], slots: readonly Scrap[], seconds: number): void {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return;
    let densityReady = false;
    for (const bot of bots) {
      bot.decisionIn -= seconds;
      const current = this.liveTarget(bot, slots);
      const onRoute = current !== undefined || (bot.target?.kind === 'waypoint' &&
        distanceSquared(bot.position, bot.target.point) > roamer.arrivalRadius ** 2);
      if (onRoute && bot.decisionIn > 0) continue;

      if (bot.strategy === 'collector') {
        if (!densityReady) {
          this.density.fill(0);
          for (const scrap of slots) {
            if (scrap.state === 'active') this.density[cell(scrap)]++;
          }
          densityReady = true;
        }
        const target = this.pickScrap(bot, slots, current);
        if (target && target !== current) {
          bot.target = {
            kind: 'scrap', point: { x: target.x, y: target.y }, id: target.id, generation: target.generation,
          };
        } else if (!onRoute) {
          bot.target = { kind: 'waypoint', point: waypoint(bot) };
        }
        bot.decisionIn = collector.decisionSeconds;
      } else {
        bot.target = { kind: 'waypoint', point: waypoint(bot) };
        bot.decisionIn = roamer.reconsiderMinSeconds +
          bot.random() * (roamer.reconsiderMaxSeconds - roamer.reconsiderMinSeconds);
      }
    }
  }

  private liveTarget(bot: Bot, slots: readonly Scrap[]): Scrap | undefined {
    const target = bot.target;
    if (target?.kind !== 'scrap') return;
    const slot = slots[target.id];
    if (slot?.state === 'active' && slot.generation === target.generation &&
        distanceSquared(bot.position, slot) <= collector.searchRadius ** 2) {
      target.point.x = slot.x;
      target.point.y = slot.y;
      return slot;
    }
    bot.target = undefined;
  }

  private pickScrap(bot: Bot, slots: readonly Scrap[], current?: Scrap): Scrap | undefined {
    let best = current;
    let bestScore = current ? this.score(current, distanceSquared(bot.position, current)) : 0;
    const switchScore = bestScore * collector.switchRatio;
    for (const slot of slots) {
      if (slot.state !== 'active') continue;
      const range = distanceSquared(bot.position, slot);
      if (range > collector.searchRadius ** 2) continue;
      const score = this.score(slot, range);
      if (score >= switchScore && score > bestScore) {
        best = slot;
        bestScore = score;
      }
    }
    return best;
  }

  private score(slot: Scrap, range: number): number {
    const neighbors = this.density[cell(slot)] - 1;
    return (1 + collector.densityWeight * neighbors) / (1 + Math.sqrt(range) / collector.distanceBias);
  }
}
