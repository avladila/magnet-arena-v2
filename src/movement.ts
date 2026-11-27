import { combatState } from './combat-state';
import { arena, playerConfig, viewConfig } from './config';

export type Point = { x: number; y: number };
export type Steering = { kind: 'idle' } | { kind: 'target' | 'joystick'; point: Point };
export type Participant<Kind extends 'player' | 'bot' = 'player' | 'bot'> = {
  readonly id: string;
  readonly name: string;
  readonly kind: Kind;
  position: Point;
  velocity: Point;
  heading: number;
  mass: number;
  physicalScale: number;
  radius: number;
  pickupsCollected: number;
  combat: ReturnType<typeof combatState>;
};
export type Player = Participant<'player'>;

export const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, high));

export function clampToArena({ x, y }: Point, radius: number): Point {
  return {
    x: clamp(x, radius, arena.width - radius),
    y: clamp(y, radius, arena.height - radius),
  };
}

export function createPlayer(): Player {
  return createParticipant('player', 'player', { x: arena.width / 2, y: arena.height / 2 }, 'You');
}

export function createParticipant<Kind extends Participant['kind']>(
  id: string, kind: Kind, position: Point, name = id,
): Participant<Kind> {
  return {
    id,
    name,
    kind,
    position: { ...position },
    velocity: { x: 0, y: 0 },
    heading: 0,
    mass: playerConfig.initialMass,
    physicalScale: 1,
    radius: playerConfig.radius,
    pickupsCollected: 0,
    combat: combatState(),
  };
}

export function advance(player: Participant, steering: Steering, seconds: number): void {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return;
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
  if (Math.hypot(player.velocity.x, player.velocity.y) >= viewConfig.headingMinSpeed) {
    player.heading = Math.atan2(player.velocity.y, player.velocity.x);
  }
}
