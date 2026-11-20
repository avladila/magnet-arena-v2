import { advanceAttraction, type AttractionResult } from './attraction';
import { BotAI } from './bot-ai';
import { createBots, type Bot } from './bots';
import { advance, createPlayer, type Participant, type Steering } from './movement';
import { ParticlePool, type WorldBounds } from './particles';

export class ArenaModel {
  readonly player = createPlayer();
  readonly bots: readonly Bot[];
  readonly participants: readonly Participant[];
  readonly particles: ParticlePool;
  private readonly botAI = new BotAI();

  constructor(seed: number) {
    this.bots = createBots(seed);
    this.participants = [this.player, ...this.bots];
    this.particles = new ParticlePool(seed, this.participants);
  }

  step(steering: Steering, seconds: number): AttractionResult | undefined {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return;
    this.botAI.update(this.bots, this.particles.slots, seconds);
    advance(this.player, steering, seconds);
    for (const bot of this.bots) {
      advance(bot, bot.target ? { kind: 'target', point: bot.target.point } : { kind: 'idle' }, seconds);
    }
    return advanceAttraction(this.particles, this.participants, seconds);
  }

  replenish(view: WorldBounds): void {
    this.particles.replenish(this.participants, view);
  }
}
