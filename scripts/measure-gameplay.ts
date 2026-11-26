import { ArenaModel } from '../src/arena-model';
import { arm, bearingTo, cancelArm, gapBetween, release, salvageEligible, theftDamage, type Debris } from '../src/combat';
import type { TheftImpact } from '../src/combat-state';
import { matchConfig, theftConfig } from '../src/competition-config';
import { rankings, type Difficulty } from '../src/match';
import type { Participant } from '../src/movement';
import { ArenaCamera } from '../src/view';
import { GameplayPilot, onScreen, strategies, type Strategy } from './gameplay-pilot';

const levels: Difficulty[] = ['easy', 'normal', 'hard'];
const dt = matchConfig.step;
const sample = 0.25;
const windows = [30, 60, 120, 180, 240, 300];
const meaningfulSeconds = 0.75;

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const valuesInOrder = [...values].sort((a, b) => a - b);
  return (valuesInOrder[Math.floor(values.length / 2)] + valuesInOrder[Math.floor((values.length - 1) / 2)]) / 2;
}

type Pulse = { time: number; impact: TheftImpact; recovered: number; first?: number; wound: number; attacker: Participant; start: { x: number; y: number }; moved: number };

// Observe the existing detach and claim paths on both revisions. The same model still resolves every claim.
class Rewards {
  time = 0;
  private readonly pulses = new Map<string, Pulse>();
  private readonly impacts = new Map<NonNullable<Debris['source']>, Map<string, Pulse>>();
  private readonly recent = new Map<string, Pulse>();
  private current?: Debris;
  private thirdParty = 0;
  private victimReclaimed = 0;
  private detached = 0;
  private damageEvents = 0;
  private reduction = 0;

  constructor(model: ArenaModel) {
    const salvage = model.salvage;
    const pull = salvage as unknown as { pull: (chunk: Debris, participants: readonly Participant[], dt: number) => boolean };
    const actualPull = pull.pull.bind(salvage);
    pull.pull = (chunk, participants, seconds) => {
      this.current = chunk;
      try { return actualPull(chunk, participants, seconds); }
      finally { this.current = undefined; }
    };
    const byId = new Map(model.participants.map((p) => [p.id, p]));
    for (const p of model.participants) {
      let mass = p.combat.salvage;
      Object.defineProperty(p.combat, 'salvage', { enumerable: true, get: () => mass, set: (value: number) => {
        if (value > mass) this.claim(p, value - mass);
        mass = value;
      } });
    }
    const detach = salvage.detachTheft.bind(salvage);
    salvage.detachTheft = (victim, requested, limit, impact, credits) => {
      const start = salvage.chunks.length;
      const waiting = salvage.pending.length;
      const loss = detach(victim, requested, limit, impact, credits);
      const chunk = salvage.chunks[start] ?? salvage.pending[waiting];
      if (!loss || !chunk?.source) return loss;
      this.detached += loss;
      this.damageEvents++;
      this.reduction += impact.reduction;
      const earlier = this.recent.get(victim.id);
      if (earlier && this.time > earlier.time && this.time <= earlier.time + theftConfig.lifetime &&
          Math.hypot(victim.position.x - earlier.impact.origin.x, victim.position.y - earlier.impact.origin.y) < 800) earlier.wound += loss;
      const group = new Map<string, Pulse>();
      for (const { id } of credits) {
        const attacker = byId.get(id)!;
        const key = `${id}/${attacker.combat.hits}`;
        let pulse = this.pulses.get(key);
        if (!pulse) {
          pulse = { time: this.time, impact, recovered: 0, wound: 0, attacker, start: attacker.position, moved: Infinity };
          this.pulses.set(key, pulse);
        }
        group.set(id, pulse);
        this.recent.set(id, pulse);
      }
      this.impacts.set(chunk.source, group);
      return loss;
    };
  }

  private claim(winner: Participant, value: number): void {
    const chunk = this.current;
    const source = chunk?.source;
    if (!source) return;
    if (source.victimId === winner.id) this.victimReclaimed += value;
    else if (!source.credits.some(({ id }) => id === winner.id)) this.thirdParty += value;
    const pulse = this.impacts.get(source)?.get(winner.id);
    if (!pulse) return;
    const first = chunk!.offset ?? 0;
    let offset = 0;
    for (const credit of source.credits) {
      if (credit.id === winner.id) {
        const credited = Math.max(0, Math.min(first + value, offset + credit.value) - Math.max(first, offset));
        if (credited > 0 && pulse.first === undefined) {
          pulse.first = this.time - pulse.time;
          pulse.moved = Math.hypot(winner.position.x - pulse.start.x, winner.position.y - pulse.start.y);
        }
        pulse.recovered += credited;
        break;
      }
      offset += credit.value;
    }
  }

  report() {
    const damaging = [...this.pulses.values()];
    const paid = damaging.filter((pulse) => pulse.recovered > 0);
    const summary = (pulses: readonly Pulse[]) => ({ damaging: pulses.length,
      paid: pulses.filter(({ recovered }) => recovered > 0).length,
      recoverySamples: pulses.map(({ recovered }) => recovered),
      delaySamples: pulses.flatMap(({ first }) => first === undefined ? [] : [first]),
      wounds: pulses.filter(({ wound }) => wound > 0).length,
      woundMass: pulses.reduce((sum, pulse) => sum + pulse.wound, 0) });
    return { ...summary(damaging), player: summary(damaging.filter(({ attacker }) => attacker.kind === 'player')),
      noTravel: paid.filter(({ moved }) => moved < 20).length, thirdParty: this.thirdParty, victimReclaimed: this.victimReclaimed,
      detached: this.detached, damageEvents: this.damageEvents, reduction: this.reduction };
  }
}

function trial(seed: number, difficulty: Difficulty, strategy: Strategy, mobile: boolean, cohort: string) {
  const model = new ArenaModel(seed, difficulty);
  const clock = new ArenaCamera(model.player.position);
  clock.resize(...(mobile ? [390, 844] : [1366, 768]) as [number, number]);
  const pilot = new GameplayPilot(strategy);
  const player = model.player;
  const reward = new Rewards(model);
  const encountering = new Map<Participant, number>();
  const durations: number[] = [];
  const waves = windows.map((end) => ({ end, none: 0, two: 0, moves: 0, pulses: 0, mass: 20, rivals: 0 }));
  let wave = 0;
  let visibleFirst: number | null = null;
  let meaningfulFirst: number | null = null;
  let rawFirst = 0, raw = 0, zero = 0, one = 0, two = 0, longest = 0, emptySince = 0, emptyOver20 = 0;
  let nearestSum = 0, visibleResourceSum = 0, eligibleSalvageSamples = 0, readyRivalSamples = 0, opportunitySamples = 0;
  let opportunity = false, opportunities = 0, hazard = 0, rankChanges = 0, lastRank = 1, duplicateClaims = 0;
  let earliestPulse: number | null = null, previousPulses = 0, signalSeconds = 0, contendersAtSignal = 0;
  let hotSamples = 0, hotResources = 0, maxCache = 0;
  let attackAt = Infinity;
  let aimed: Participant | undefined;
  const stepTimes: number[] = [];
  const claims = new Int32Array(model.particles.slots.length).fill(-1);
  const totalPulses = () => model.participants.reduce((sum, { combat }) => sum + combat.hits + combat.misses + combat.guarded + combat.protectedHits, 0);
  for (let frame = 0; frame < matchConfig.duration / dt; frame++) {
    const time = frame * dt;
    const bounds = clock.bounds;
    const choice = pilot.decide(model, bounds, time);
    if (aimed && time >= attackAt) {
      if (gapBetween(player, aimed) <= theftConfig.reach - 5 && aimed.combat.guardFor <= 1e-9 && onScreen(aimed.position, bounds, aimed.radius)) {
        release(player, bearingTo(player.position, aimed.position));
      } else cancelArm(player);
      aimed = undefined;
    }
    if (!aimed && choice.victim && gapBetween(player, choice.victim) <= theftConfig.reach - 25 && arm(player)) {
      aimed = choice.victim;
      attackAt = time + 0.22;
    }
    reward.time = time;
    const start = frame % 31 === 0 ? performance.now() : 0;
    const result = model.step(choice.point ? { kind: 'target', point: choice.point } : { kind: 'idle' }, dt);
    clock.follow(player.position, dt, player.mass);
    model.replenish(clock.bounds);
    if (start) stepTimes.push(performance.now() - start);
    for (const collection of result?.collections ?? []) {
      if (claims[collection.id] >= collection.generation) duplicateClaims++;
      claims[collection.id] = collection.generation;
    }
    if (frame % 15 !== 0) continue;
    if (time >= windows[wave] && wave < windows.length - 1) wave++;
    const rhythm = waves[wave];
    rhythm.moves += sample;
    rhythm.mass = player.mass;
    const scan = clock.bounds;
    const inner = 18 / clock.zoom;
    const middle = { left: scan.left + inner, right: scan.right - inner, top: scan.top + inner, bottom: scan.bottom - inner };
    let count = 0;
    let nearest = Infinity;
    let near = false, canAttack = false, readyRival = false;
    for (const bot of model.bots) {
      const gap = gapBetween(player, bot);
      nearest = Math.min(nearest, gap);
      near ||= gap <= 500;
      const visible = onScreen(bot.position, scan, bot.radius);
      count += Number(visible);
      readyRival ||= visible && gap <= 650 && bot.combat.energy === 100;
      canAttack ||= visible && gap <= theftConfig.reach && bot.combat.guardFor <= 0 &&
        player.combat.energy === 100 && theftDamage(player, bot) > 0;
      if (gap <= 650 && onScreen(bot.position, middle)) {
        if (!encountering.has(bot)) encountering.set(bot, time);
        const begun = encountering.get(bot)!;
        if (time + sample - begun >= meaningfulSeconds && meaningfulFirst === null) meaningfulFirst = begun;
      } else if (encountering.has(bot)) {
        const duration = time - encountering.get(bot)!;
        if (duration >= meaningfulSeconds) durations.push(duration);
        encountering.delete(bot);
      }
    }
    if (near && !raw) rawFirst++;
    raw = Number(near);
    nearestSum += nearest;
    rhythm.rivals += count;
    if (count === 0) {
      zero += sample;
      rhythm.none += sample;
      emptySince += sample;
      longest = Math.max(longest, emptySince);
    } else {
      visibleFirst ??= time;
      if (emptySince >= 20) emptyOver20++;
      emptySince = 0;
      if (count === 1) one += sample;
      else { two += sample; rhythm.two += sample; }
    }
    if (canAttack && !opportunity) opportunities++;
    opportunity = canAttack;
    opportunitySamples += Number(canAttack);
    readyRivalSamples += Number(readyRival);
    eligibleSalvageSamples += Number(model.salvage.chunks.some((chunk) => onScreen(chunk, scan) &&
      Math.hypot(chunk.x - player.position.x, chunk.y - player.position.y) < 630 && salvageEligible(chunk, player.id)));
    let inSight = 0;
    for (const scrap of model.particles.slots) if (scrap.state === 'active' && onScreen(scrap, scan)) inSight++;
    visibleResourceSum += inSight;
    if (model.hazards?.sites.some((site) => Math.hypot(site.x - player.position.x, site.y - player.position.y) <= site.radius + player.radius)) hazard += sample;
    const place = rankings(model.participants).find(({ participant }) => participant === player)!.place;
    if (place !== lastRank) rankChanges++;
    lastRank = place;
    const pulses = totalPulses();
    if (pulses > 0) earliestPulse ??= time;
    rhythm.pulses += pulses - previousPulses;
    previousPulses = pulses;
    if (model.signal) {
      signalSeconds += sample;
      contendersAtSignal += model.participants.filter((p) => Math.hypot(p.position.x - model.signal!.x, p.position.y - model.signal!.y) < 550).length;
    }
    const hotspots = (model as ArenaModel & { hotspots?: readonly { x: number; y: number; radius: number }[] }).hotspots;
    if (frame % 120 === 0) {
      maxCache = Math.max(maxCache, model.particles.regionStats.cachedRegions);
      for (const spot of hotspots ?? []) {
        hotSamples++;
        for (const scrap of model.particles.slots) if (scrap.state === 'active' &&
          (scrap.x - spot.x) ** 2 + (scrap.y - spot.y) ** 2 <= spot.radius ** 2) hotResources++;
      }
    }
  }
  if (emptySince >= 20) emptyOver20++;
  for (const began of encountering.values()) if (matchConfig.duration - began >= meaningfulSeconds) durations.push(matchConfig.duration - began);
  const final = rankings(model.participants);
  const n = matchConfig.duration / sample;
  stepTimes.sort((a,b) => a-b);
  return { seed, difficulty, strategy, cohort, view: mobile ? '390x844' : '1366x768',
    rank: final.find(({ participant }) => participant === player)!.place, mass: player.mass, peak: player.combat.highest,
    leader: final[0].participant.mass, zero, one, two, longest, emptyOver20, visibleFirst, meaningfulFirst,
    encounters: durations.length, nearbyEntries: rawFirst, duration: median(durations), durations,
    nearest: nearestSum / n, visibleResources: visibleResourceSum / n,
    opportunities, opportunitySeconds: opportunitySamples * sample, readyRival: readyRivalSamples * sample,
    eligibleSalvage: eligibleSalvageSamples * sample, hazard, rankChanges, earliestPulse,
    pulses: totalPulses(), playerHits: player.combat.hits, playerSalvage: player.combat.salvage, botPickups: model.bots.reduce((n,p) => n + p.pickupsCollected, 0),
    signalSeconds, signalContenders: signalSeconds ? contendersAtSignal / (signalSeconds / sample) : null,
    hotSamples, hotResources: hotSamples ? hotResources / hotSamples : null,
    awards: reward.report(), duplicateClaims, maxCache, active: model.particles.slots.filter(({ state }) => state === 'active').length,
    stepP95: stepTimes[Math.floor(stepTimes.length * 0.95)], rhythm: waves };
}

const cohort = process.env.MAGNET_COHORT ?? 'paired';
const start = Number(process.env.MAGNET_START ?? 0);
const stop = Number(process.env.MAGNET_STOP ?? (cohort === 'validation' ? 24 : 96));
const stride = Number(process.env.MAGNET_STRIDE ?? 1);
for (let index = start; index < stop; index += stride) {
  const difficulty = levels[Math.floor(index / 8) % levels.length];
  const strategy = strategies[index % strategies.length];
  const block = Math.floor(index / 24);
  const seed = (cohort === 'validation' ? 673983 : 8269) + block * 9709 + index % 8 * 421;
  console.log(JSON.stringify(trial(seed, difficulty, strategy, (block + index) % 2 === 1, cohort)));
}
