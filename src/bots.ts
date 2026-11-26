import roster from '../brand/roster.json';
import { color } from './brand';
import { BotNavigation } from './bot-navigation';
import { botConfig, populationConfig } from './config';
import { createParticipant, type Participant, type Point } from './movement';
import { seedRandom } from './random';

export type BotTarget = { kind: 'waypoint'; point: Point } |
  { kind: 'region'; point: Point; cell: number };

export type BotStrategy = 'collector' | 'hunter' | 'charger' | 'scavenger' | 'roamer' | 'opportunist';

export type Bot = Participant<'bot'> & {
  readonly strategy: BotStrategy;
  readonly accent: number;
  readonly random: () => number;
  decisionIn: number;
  readonly navigation: BotNavigation;
  target?: BotTarget;
};

export function createBots(seed: number, count = populationConfig.legacy - 1): Bot[] {
  return roster.slice(0, count).map(({ id, strategy, name, accent, x, y, near }, index) => {
    const random = seedRandom(seed ^ Math.imul(index + 1, 0x9e3779b9));
    const [baseX, baseY] = count >= populationConfig.legacy && near ? near : [x, y];
    const position = {
      x: baseX + (2 * random() - 1) * botConfig.spawnJitter,
      y: baseY + (2 * random() - 1) * botConfig.spawnJitter,
    };
    return { ...createParticipant(id, 'bot', position, name), strategy: strategy as BotStrategy,
      accent: color(accent), random, navigation: new BotNavigation(), decisionIn: 0 };
  });
}
