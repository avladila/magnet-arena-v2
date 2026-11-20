import { botConfig } from './config';
import { createParticipant, type Participant, type Point } from './movement';
import { seedRandom } from './random';

export type BotTarget = { kind: 'waypoint'; point: Point } |
  { kind: 'region'; point: Point; cell: number };

export type Bot = Participant<'bot'> & {
  readonly strategy: 'collector' | 'roamer';
  readonly name: string;
  readonly accent: number;
  readonly random: () => number;
  decisionIn: number;
  target?: BotTarget;
};

// Jitter stays within distinct, legal regions. Copper starts nearest the center.
const definitions = [
  { id: 'bot-1', strategy: 'collector', name: 'Copper', accent: 0xb96736, x: 8340, y: 4920 },
  { id: 'bot-2', strategy: 'collector', name: 'Spark', accent: 0x935db8, x: 6260, y: 5940 },
  { id: 'bot-3', strategy: 'roamer', name: 'Drift', accent: 0x17838e, x: 9090, y: 4010 },
  { id: 'bot-4', strategy: 'roamer', name: 'Orbit', accent: 0x5c842d, x: 6340, y: 4230 },
] as const;

export function createBots(seed: number): Bot[] {
  return definitions.map(({ id, strategy, name, accent, x, y }, index) => {
    const random = seedRandom(seed ^ Math.imul(index + 1, 0x9e3779b9));
    const position = {
      x: x + (2 * random() - 1) * botConfig.spawnJitter,
      y: y + (2 * random() - 1) * botConfig.spawnJitter,
    };
    return { ...createParticipant(id, 'bot', position), name, strategy, accent, random, decisionIn: 0 };
  });
}
