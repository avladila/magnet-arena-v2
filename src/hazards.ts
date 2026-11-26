import { arena } from './config';
import { hazardConfig } from './competition-config';
import { shell, type Salvage } from './combat';
import type { Participant, Point } from './movement';
import { seedRandom } from './random';

export type HazardKind = keyof typeof hazardConfig;
export type Hazard = Point & {
  kind: HazardKind; radius: number; readyAt: number;
  contacts: Set<string>; victims: Map<string, number>;
};

export class Hazards {
  readonly sites: Hazard[] = [];
  private time = 0;

  constructor(seed: number, participants: readonly Participant[]) {
    const random = seedRandom(seed ^ 0x38750369);
    for (const kind of Object.keys(hazardConfig) as HazardKind[]) {
      const { count, radius } = hazardConfig[kind];
      for (let n = 0; n < count; n++) {
        for (let attempt = 0; attempt < 256; attempt++) {
          const x = 350 + random() * (arena.width - 700);
          const y = 350 + random() * (arena.height - 700);
          if (participants.some(({ position }) => Math.hypot(position.x - x, position.y - y) < radius + 450) ||
              this.sites.some((site) => Math.hypot(site.x - x, site.y - y) < radius + site.radius + 100)) continue;
          this.sites.push({ x, y, kind, radius, readyAt: 0, contacts: new Set(), victims: new Map() });
          break;
        }
      }
    }
  }

  discharged(site: Hazard): boolean { return site.readyAt > this.time; }

  step(participants: readonly Participant[], salvage: Salvage, dt: number): void {
    this.time += dt;
    for (const magnet of participants) {
      const state = magnet.combat;
      let heat = false;
      let cold = false;
      let corrosion: 'acid' | 'water' | undefined;
      for (const site of this.sites) {
        const touching = Math.hypot(magnet.position.x - site.x, magnet.position.y - site.y) <= magnet.radius + site.radius;
        if (site.kind === 'flux') {
          if (!touching) {
            site.contacts.delete(magnet.id);
            continue;
          }
          if (site.contacts.has(magnet.id)) continue;
          site.contacts.add(magnet.id);
          const config = hazardConfig.flux;
          if (magnet.mass < config.threshold || this.time < site.readyAt ||
              this.time < (site.victims.get(magnet.id) ?? 0)) continue;
          const multiplier = state.brittle ? hazardConfig.cold.damage : 1;
          const lost = salvage.detach(magnet, Math.round(shell(magnet) * config.fraction * multiplier));
          if (lost) state.brittle = false;
          state.lostToHazards += lost;
          site.readyAt = this.time + config.discharge;
          site.victims.set(magnet.id, this.time + config.personalDelay);
          continue;
        }
        if (!touching) continue;
        if (site.kind === 'heat') heat = true;
        else if (site.kind === 'cold') cold = true;
        else if (site.kind === 'acid' || !corrosion) corrosion = site.kind;
      }
      state.heat = heat ? Math.min(1, state.heat + hazardConfig.heat.build * dt)
        : Math.max(0, state.heat - hazardConfig.heat.decay * dt);
      if (cold && !heat) {
        state.coldRecovery = hazardConfig.cold.recovery;
        state.cold += dt;
        if (!state.coldTriggered && state.cold + 1e-9 >= hazardConfig.cold.delay) {
          state.brittle = true;
          state.coldTriggered = true;
        }
      } else {
        state.cold = 0;
        state.coldTriggered = false;
        state.coldRecovery -= dt;
        if (state.coldRecovery <= 0) state.brittle = false;
      }
      if (state.corrosion !== corrosion) {
        state.corrosion = corrosion;
        state.corrosionIn = corrosion ? hazardConfig[corrosion].delay : 0;
      }
      if (!corrosion) continue;
      state.corrosionIn -= dt;
      if (state.corrosionIn <= 1e-9) {
        state.corrosionIn += 1;
        state.lostToHazards += salvage.detach(magnet,
          Math.max(1, Math.round(shell(magnet) * hazardConfig[corrosion].fraction)));
      }
    }
  }
}
