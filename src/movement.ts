import { arena, playerConfig } from './config';

export type Point = { x: number; y: number };
export type Steering = { kind: 'idle' } | { kind: 'target' | 'joystick'; point: Point };
export type Player = {
  position: Point;
  velocity: Point;
  mass: number;
  physicalScale: number;
  radius: number;
};

export const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, high));

export function clampToArena({ x, y }: Point, radius: number): Point {
  return {
    x: clamp(x, radius, arena.width - radius),
    y: clamp(y, radius, arena.height - radius),
  };
}

export function createPlayer(): Player {
  return {
    position: { x: arena.width / 2, y: arena.height / 2 },
    velocity: { x: 0, y: 0 },
    mass: playerConfig.initialMass,
    physicalScale: 1,
    radius: playerConfig.radius,
  };
}

export function advance(player: Player, steering: Steering, seconds: number): void {
  if (seconds <= 0) return;
  const previous = player.position;
  const travel = playerConfig.speed * seconds;
  let dx = 0;
  let dy = 0;

  if (steering.kind === 'target') {
    const target = clampToArena(steering.point, player.radius);
    dx = target.x - previous.x;
    dy = target.y - previous.y;
    const distance = Math.hypot(dx, dy);
    if (distance > travel) {
      dx *= travel / distance;
      dy *= travel / distance;
    }
  } else if (steering.kind === 'joystick') {
    dx = steering.point.x * travel;
    dy = steering.point.y * travel;
  }

  player.position = clampToArena({ x: previous.x + dx, y: previous.y + dy }, player.radius);
  player.velocity = {
    x: (player.position.x - previous.x) / seconds,
    y: (player.position.y - previous.y) / seconds,
  };
}
