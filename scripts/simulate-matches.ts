import { ArenaModel } from '../src/arena-model';
import { arm, bearingTo, gapBetween, release, shell } from '../src/combat';
import { arena } from '../src/config';
import { MatchClock, rankings, type Difficulty } from '../src/match';
import type { Participant, Point, Steering } from '../src/movement';

const strategies = ['inactive', 'collector', 'aggressive', 'combat', 'hazard-aware', 'edge'] as const;
const levels: Difficulty[] = ['easy', 'normal', 'hard'];
const dt = 1 / 60;
const combat = process.env.MAGNET_COMBAT === 'legacy' ? 'legacy' : 'impact';
const participantCount = Number(process.env.MAGNET_PARTICIPANTS ?? 20);
for (let trial = Number(process.env.MAGNET_TRIAL_START ?? 0); trial < Number(process.env.MAGNET_TRIALS ?? 36); trial++) {
  const seed = 1000 + trial % strategies.length + Math.floor(trial / 18) * strategies.length;
  const strategy = strategies[trial % strategies.length];
  const difficulty = levels[Math.floor(trial / strategies.length) % levels.length];
  const model = new ArenaModel(seed, difficulty, false, { participantCount, combat });
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
  let firstPulse: number | undefined;
  let entries = 0;
  let firstMinuteEntries = 0;
  let aloneSeconds = 0;
  let firstMinuteAlone = 0;
  let previouslyNear = new Set<Participant>();
  let shortage = 0;
  let minimumSupply = Infinity;
  let totalSupply = 0;
  let botSamples = 0;
  let lowMass = 0;
  let peakSalvage = 0;
  let heapPeak = 0;
  let damageEvents = 0;
  let totalDamage = 0;
  let totalReduction = 0;
  let giantEvents = 0;
  let giantReduction = 0;
  let totalRecoverySeconds = 0;
  let recoveries = 0;
  const wounded = new Map<Participant, { time: number; target: number }>();
  const usedAttacks = new Map<Participant, number>();
  const previousWarnings = new Map<Participant, Participant['combat']['attack']>();
  const resultTimes: number[] = [];
  const generations = new Int32Array(model.particles.slots.length).fill(-1);
  const start = performance.now();
  for (let frame = 0; !clock.ended; frame++) {
    if (frame % 30 === 0 && clock.countdown === 0) {
      const { position } = player;
      const nearby = model.bots.filter((bot) => gapBetween(player, bot) < 500);
      for (const bot of nearby) encounters.add(bot.id);
      const arriving = nearby.filter((bot) => !previouslyNear.has(bot)).length;
      entries += arriving;
      aloneSeconds += Number(nearby.length === 0) / 2;
      if (clock.elapsed < 60) {
        firstMinuteEntries += arriving;
        firstMinuteAlone += Number(nearby.length === 0) / 2;
      }
      previouslyNear = new Set(nearby);
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
        lowMass += Number(bot.mass <= 35);
      }
      if (frame % 120 === 0) {
        heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed);
        for (const magnet of model.participants) {
          let within = 0;
          const { x, y } = magnet.position;
          for (const scrap of model.particles.slots) {
            if (scrap.state === 'active' && (scrap.x - x) ** 2 + (scrap.y - y) ** 2 <= 800 ** 2) within++;
          }
          shortage += Number(within < 10);
          minimumSupply = Math.min(minimumSupply, within);
          totalSupply += within;
          botSamples++;
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
      const start = performance.now();
      const before = model.participants.map(({ mass, physicalScale, combat }) =>
        ({ mass, physicalScale, lost: combat.lostToTheft }));
      const result = model.step(steering, step);
      for (const event of result?.collections ?? []) {
        if (event.generation <= generations[event.id]) duplicateClaims++;
        generations[event.id] = event.generation;
      }
      if (frame % 2 === 0) {
        const { x, y } = player.position;
        model.replenish({ left: x - 650, right: x + 650, top: y - 500, bottom: y + 500 });
      }
      if (frame % 19 === 0) resultTimes.push(performance.now() - start);
      peakSalvage = Math.max(peakSalvage, model.salvage.chunks.length);
      for (const [index, magnet] of model.participants.entries()) {
        const { mass, physicalScale, combat: state } = magnet;
        const old = before[index];
        if (state.attack.phase === 'warning' && previousWarnings.get(magnet) !== state.attack) {
          firstPulse ??= clock.elapsed;
          usedAttacks.set(magnet, (usedAttacks.get(magnet) ?? 0) + 1);
          previousWarnings.set(magnet, state.attack);
        }
        if (state.lostToTheft > old.lost) {
          const reduction = state.impact?.reduction ?? Math.max(0, 1 - physicalScale / old.physicalScale);
          damageEvents++;
          totalDamage += state.lostToTheft - old.lost;
          totalReduction += reduction;
          if (old.physicalScale >= 12) {
            giantEvents++;
            giantReduction += reduction;
          }
          wounded.set(magnet, { time: clock.elapsed, target: state.impact?.mass ?? old.mass });
        } else {
          const wound = wounded.get(magnet);
          if (wound && mass >= wound.target) {
            wounded.delete(magnet);
            recoveries++;
            totalRecoverySeconds += clock.elapsed - wound.time;
          }
        }
      }
    });
    if (clock.elapsed + 1e-9 >= sampleTimes[nextSample]) {
      samples.push(player.mass);
      nextSample++;
    }
  }
  const order = rankings(model.participants);
  const state = player.combat;
  resultTimes.sort((a, b) => a - b);
  const sum = (field: 'guarded' | 'hits' | 'misses' | 'ownSalvage' | 'reclaimedSalvage' | 'protectedHits') =>
    model.participants.reduce((n, p) => n + (p.combat[field] ?? 0), 0);
  const pulses = [...usedAttacks.values()].reduce((a, b) => a + b, 0);
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
    population: model.participants.length, entries, firstMinuteEntries, aloneSeconds, firstMinuteAlone, firstPulse,
    pulses, resolved: sum('hits') + sum('misses') + sum('guarded') + sum('protectedHits'), successful: sum('hits'), guarded: sum('guarded'),
    damageEvents, totalDamage, totalReduction, giantEvents, giantReduction, recoveries, totalRecoverySeconds,
    attackerSalvage: sum('ownSalvage'), victimSalvage: sum('reclaimedSalvage'),
    lowMass, shortage, minimumSupply, totalSupply, supplySamples: botSamples, peakSalvage, heapPeak,
    mostPulses: Math.max(0, ...usedAttacks.values()), stepP95: resultTimes[Math.floor(resultTimes.length * 0.95)],
    ms: Math.round(performance.now() - start),
  }));
}
