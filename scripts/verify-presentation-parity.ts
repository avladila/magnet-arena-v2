import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { ArenaModel } from '../src/arena-model';
import { arm, bearingTo, cancelArm, gapBetween, release } from '../src/combat';
import { matchConfig, theftConfig } from '../src/competition-config';
import { rankings, type Difficulty } from '../src/match';
import type { Participant, Point } from '../src/movement';
import { ArenaCamera } from '../src/view';
import { GameplayPilot, onScreen, type Strategy } from './gameplay-pilot';

type Source = { seed: number; difficulty: Difficulty; strategy: Strategy; width: number; height: number };
type AttackInput = 'arm' | 'cancel' | number | null;
type Input = [number | null, number | null, AttackInput];
type Replay = Source & { inputs: Input[]; checkpoints: string[] };
const sources = [
  { seed: 11216, difficulty: 'normal', strategy: 'balanced', width: 1366, height: 768 },
  { seed: 13547, difficulty: 'normal', strategy: 'salvage', width: 390, height: 844 },
  { seed: 46191, difficulty: 'easy', strategy: 'energy', width: 844, height: 390 },
  { seed: 68712, difficulty: 'hard', strategy: 'hunter', width: 1366, height: 768 },
  { seed: 41011, difficulty: 'hard', strategy: 'defensive', width: 390, height: 844 },
  { seed: 7151, difficulty: 'easy', strategy: 'collector', width: 1366, height: 768 },
] as const satisfies readonly Source[];

function serializable(_key: string, value: unknown) {
  if (value instanceof Map) return [...value];
  if (value instanceof Set) return [...value];
  return value;
}

function digest(model: ArenaModel, claims: string): string {
  const tactics = Reflect.get(model, 'tactics') as Map<Participant, Record<string, unknown>>;
  // References inside tactical commitments are summarized by participant ID. Their state is recorded below.
  const commitments = [...tactics].map(([bot, state]) => [bot.id, JSON.stringify(state, (key, value) =>
    key && value && typeof value === 'object' && 'combat' in value ? value.id : serializable(key, value))]);
  const state = {
    participants: model.participants, commitments, claims, slots: model.particles.slots,
    world: model.particles.regionStats, debris: model.salvage, hazards: model.hazards,
    hotspots: model.hotspots, signal: model.signal, playerBest: model.bestPlace,
    ranks: rankings(model.participants).map(({ participant, place }) => [participant.id, place]),
  };
  return createHash('sha256').update(JSON.stringify(state, serializable)).digest('hex');
}

function replay(source: Source, inputs?: readonly Input[]): Replay {
  const { seed, difficulty, strategy, width, height } = source;
  const model = new ArenaModel(seed, difficulty);
  const player = model.player;
  const view = new ArenaCamera(player.position);
  view.resize(width, height);
  const pilot = inputs ? undefined : new GameplayPilot(strategy);
  const dt = matchConfig.step;
  const commands: Input[] = [];
  const claims = createHash('sha256');
  const checkpoints = [digest(model, claims.copy().digest('hex'))];
  let aimed: Participant | undefined;
  let attackAt = 0;
  for (let index = 0; index < matchConfig.duration / dt; index++) {
    const elapsed = index * dt;
    const bounds = view.bounds;
    let command = inputs?.[index];
    if (!command) {
      const choice = pilot!.decide(model, bounds, elapsed);
      let attack: AttackInput = null;
      if (aimed && elapsed >= attackAt) {
        attack = gapBetween(player, aimed) <= theftConfig.reach - 5 && aimed.combat.guardFor <= 1e-9 &&
          onScreen(aimed.position, bounds, aimed.radius) ? bearingTo(player.position, aimed.position) : 'cancel';
        aimed = undefined;
      } else if (!aimed && choice.victim && player.combat.attack.phase === 'idle' && player.combat.energy === theftConfig.energy &&
          gapBetween(player, choice.victim) <= theftConfig.reach - 25) {
        attack = 'arm';
        attackAt = elapsed + 0.22;
        aimed = choice.victim;
      }
      command = [choice.point?.x ?? null, choice.point?.y ?? null, attack];
      commands.push(command);
    }
    const [x, y, attack] = command;
    if (attack === 'arm') arm(player);
    else if (attack === 'cancel') cancelArm(player);
    else if (attack !== null) release(player, attack);
    const point: Point | undefined = x !== null && y !== null ? { x, y } : undefined;
    const result = model.step(point ? { kind: 'target', point } : { kind: 'idle' }, dt);
    view.follow(player.position, dt, player.mass);
    model.replenish(view.bounds);
    for (const collection of result?.collections ?? []) claims.update(JSON.stringify(collection));
    if ((index + 1) % 600 === 0) checkpoints.push(digest(model, claims.copy().digest('hex')));
  }
  return { seed, difficulty, strategy, width, height, inputs: commands, checkpoints };
}

const [mode, path] = process.argv.slice(2);
if (mode === 'record' && path) {
  const recorded = sources.map((source) => replay(source));
  writeFileSync(path, gzipSync(JSON.stringify(recorded)));
  console.log(JSON.stringify(recorded.map(({ inputs, checkpoints, ...source }) =>
    ({ ...source, inputs: inputs.length, checkpoints: checkpoints.length, final: checkpoints.at(-1) })), null, 2));
} else if (mode === 'verify' && path) {
  const recorded = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as Replay[];
  const verified = recorded.map(({ inputs, checkpoints, ...source }) => {
    if (inputs.length !== matchConfig.duration / matchConfig.step) throw Error('Incomplete replay ' + source.seed);
    const observed = replay(source, inputs);
    const mismatched = observed.checkpoints.findIndex((hash, index) => checkpoints[index] !== hash);
    if (mismatched >= 0 || observed.checkpoints.length !== checkpoints.length) {
      throw Error(source.seed + ' diverged at checkpoint ' + mismatched);
    }
    return { ...source, inputs: inputs.length, checkpoints: checkpoints.length, final: checkpoints.at(-1) };
  });
  console.log(JSON.stringify(verified, null, 2));
} else throw Error('Use record or verify followed by the replay .json.gz path.');
