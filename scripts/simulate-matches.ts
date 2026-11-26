import { ArenaModel } from '../src/arena-model';
import { arm, bearingTo, gapBetween, release, shell } from '../src/combat';
import { arena } from '../src/config';
import { MatchClock, rankings, type Difficulty } from '../src/match';
import type { Point, Steering } from '../src/movement';

const strategies = ['inactive', 'collector', 'aggressive', 'combat', 'hazard-aware', 'edge'] as const;
const levels: Difficulty[] = ['easy', 'normal', 'hard'];
const dt = 1 / 60;
for (let trial = 0; trial < Number(process.env.MAGNET_TRIALS ?? 36); trial++) {
  const seed = 1000 + trial % strategies.length + Math.floor(trial / 18) * strategies.length;
  const strategy = strategies[trial % strategies.length];
  const difficulty = levels[Math.floor(trial / strategies.length) % levels.length];
  const model = new ArenaModel(seed, difficulty);
  const player = model.player;
  const clock = new MatchClock('arena');
  const samples: number[] = [];
  const encounters = new Set<string>();
  const hazards = new Set<string>();
  let nextSample = 0;
  const sampleTimes = [30, 60, 120, 300];
  let steering: Steering = { kind: 'idle' };
  let firstAttack: number | undefined;
  let rankChanges = 0;
  let lastRank = 1;
  let maxCachedRegions = 0;
  let duplicateClaims = 0;
  let botHazardSamples = 0;
  const generations = new Int32Array(model.particles.slots.length).fill(-1);
  const start = performance.now();
  for (let frame = 0; !clock.ended; frame++) {
    if (frame % 30 === 0 && clock.countdown === 0) {
      const { position } = player;
      const nearby = model.bots.filter((bot) => gapBetween(player, bot) < 500);
      for (const bot of nearby) encounters.add(bot.id);
      const rank = rankings(model.participants).find(({ participant }) => participant === player)!.place;
      if (rank !== lastRank) rankChanges++;
      lastRank = rank;
      for (const site of model.hazards!.sites) {
        if (Math.hypot(site.x - position.x, site.y - position.y) < site.radius + player.radius) hazards.add(site.kind);
      }
      const sites = model.hazards!.sites;
      for (const bot of model.bots) {
        if (sites.some((site) => (bot.position.x - site.x) ** 2 + (bot.position.y - site.y) ** 2 < (site.radius + bot.radius) ** 2)) {
          botHazardSamples++;
        }
      }
      maxCachedRegions = Math.max(maxCachedRegions, model.particles.regionStats.cachedRegions);
      let point: Point | undefined;
      if (strategy === 'edge') {
        const corners = [{ x: 150, y: 150 }, { x: arena.width - 150, y: 150 },
          { x: arena.width - 150, y: arena.height - 150 }, { x: 150, y: arena.height - 150 }];
        point = corners[Math.floor(clock.elapsed / 45) % corners.length];
      } else if (strategy !== 'inactive') {
        let best = Infinity;
        for (const scrap of model.particles.slots) {
          if (scrap.state !== 'active') continue;
          const distance = Math.hypot(scrap.x - position.x, scrap.y - position.y);
          const kind = model.particles.kind(scrap);
          const weight = kind === 'gold' ? (strategy === 'collector' ? 1.5 : 4)
            : kind === 'energy' && strategy === 'combat' ? 4 : 1;
          if (strategy === 'hazard-aware' && model.hazards!.sites.some((site) =>
            Math.hypot(site.x - scrap.x, site.y - scrap.y) < site.radius + player.radius + 80)) continue;
          if (distance / weight < best) {
            best = distance / weight;
            point = { x: scrap.x, y: scrap.y };
          }
        }
        if (strategy === 'aggressive' && model.signal) point = model.signal;
        const target = nearby.sort((a, b) => shell(b) - shell(a))[0];
        if (target && (strategy === 'aggressive' || strategy === 'combat')) {
          if (gapBetween(player, target) < 210 && arm(player)) {
            release(player, bearingTo(position, target.position));
            firstAttack ??= clock.elapsed;
          } else if (strategy === 'combat' && player.combat.energy === 100) point = target.position;
        }
      }
      steering = point ? { kind: 'target', point } : { kind: 'idle' };
    }
    clock.advance(dt, (step) => {
      const result = model.step(steering, step);
      for (const event of result?.collections ?? []) {
        if (event.generation <= generations[event.id]) duplicateClaims++;
        generations[event.id] = event.generation;
      }
      if (frame % 2 === 0) {
        const { x, y } = player.position;
        model.replenish({ left: x - 650, right: x + 650, top: y - 500, bottom: y + 500 });
      }
    });
    if (clock.elapsed + 1e-9 >= sampleTimes[nextSample]) {
      samples.push(player.mass);
      nextSample++;
    }
  }
  const order = rankings(model.participants);
  const state = player.combat;
  console.log(JSON.stringify({
    seed, difficulty, strategy, samples, highest: state.highest, scale: player.physicalScale,
    energyCells: state.cells, firstAttack, hits: state.hits, misses: state.misses, detached: state.detached,
    salvage: state.salvage, encounters: encounters.size, hazards: [...hazards], hazardLoss: state.lostToHazards,
    rankChanges, place: order.find(({ participant }) => participant === player)!.place,
    winner: order[0].participant.id, botHits: model.bots.reduce((n, bot) => n + bot.combat.hits, 0),
    botPickups: model.bots.reduce((n, bot) => n + bot.pickupsCollected, 0),
    botAttacks: model.bots.reduce((n, bot) => n + bot.combat.hits + bot.combat.misses, 0),
    botPeakMass: Math.max(...model.bots.map((bot) => bot.combat.highest)),
    botHazardSamples, maxCachedRegions, duplicateClaims,
    activeResources: model.particles.slots.filter(({ state }) => state === 'active').length,
    ms: Math.round(performance.now() - start),
  }));
}
