import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArenaModel } from '../src/arena-model';
import { arm, bearingTo, release } from '../src/combat';
import { criticalMassConfig as rules, matchConfig, overloadStage, theftConfig } from '../src/competition-config';
import { CriticalMass, sweptBlastHit } from '../src/critical-mass';
import { escapeRoute } from '../src/critical-tactics';
import { attractionReach, addMass } from '../src/growth';
import { MatchClock } from '../src/match';
import { advance, createParticipant, createPlayer, type Participant } from '../src/movement';
import { resourceKind } from '../src/particles';
import { clearProgress, loadProgress, recordMatch } from '../src/progress';

const dt = matchConfig.step;
const idle = { kind: 'idle' } as const;
const center = { x: 7680, y: 5000 };

function actor(id: string, mass: number, dx = 0, dy = 0): Participant {
  const participant = createParticipant(id, id === 'player' ? 'player' : 'bot', { x: center.x + dx, y: center.y + dy });
  return grow(participant, mass);
}
function grow<T extends Participant>(p: T, mass: number): T {
  addMass(p, mass - p.mass);
  return p;
}
function fixture() {
  const model = new ArenaModel(7, 'normal', false, { mode: 'arena', participantCount: 4 });
  model.hazards!.sites.length = 0;
  for (const slot of model.particles.slots) slot.state = 'inactive';
  for (const bot of model.bots) bot.position = { x: 3000, y: 3000 };
  Object.assign(model, { botSteering: () => idle });
  return { model, critical: model.critical!, p: model.player, b: model.bots[0] };
}

function commit(critical: CriticalMass, participants: Participant[]) {
  critical.afterStep(participants, dt, 10);
  critical.afterStep(participants, rules.countdown, 10 + rules.countdown, 3);
}

test('overload thresholds are reversible and every post-Colossus form keeps the same physical field', () => {
  const p = createPlayer();
  const base = grow(p, 4352);
  const reach = attractionReach(base.physicalScale);
  for (const [mass, stage] of [[7999,'standard'],[8000,'ultimate'],[9999,'ultimate'],[10000,'unstable'],
    [11000,'severe'],[12000,'critical'],[7990,'standard']] as const) {
    grow(p, mass);
    assert.equal(p.physicalScale, 12);
    assert.equal(p.radius, 360);
    assert.equal(attractionReach(p.physicalScale), reach);
    assert.equal(overloadStage(p.mass), stage);
  }
  assert.equal(p.combat.highest, 12000);
});

test('only explicit Arena opts in, and Endless, tutorial, disabled, and legacy fixtures exclude the countdown', () => {
  for (const model of [new ArenaModel(5, 'normal'), new ArenaModel(5, 'normal', false, {mode:'arena',critical:false}),
    new ArenaModel(5, 'normal', false, {mode:'endless'}), new ArenaModel(5, 'normal', false, {mode:'tutorial'}),
    new ArenaModel(5, 'normal', true, {mode:'arena'})]) {
    grow(model.player, 14000);
    model.step(idle, dt);
    assert.equal(model.critical, undefined);
  }
  assert.equal(new ArenaModel(5, 'easy', false, {mode:'arena'}).critical!.state, 'play');
});

test('the active Arena and a disabled Arena play the same seeded steps below the first claim', () => {
  const active = new ArenaModel(9441, 'normal', false, { mode: 'arena' });
  const disabled = new ArenaModel(9441, 'normal', false, { mode: 'arena', critical: false });
  for (let step = 0; step < 240; step++) {
    const steering = { kind: 'target' as const, point: { x: center.x + 1400, y: center.y - 460 } };
    for (const model of [active, disabled]) {
      model.step(steering, dt);
      if (step % 30 === 0) model.replenish({ left: 7100, right: 8500, top: 4500, bottom: 5500 });
    }
  }
  const state = (model: ArenaModel) => model.participants.map(({ id, mass, position, velocity, radius, heading, combat }) =>
    ({ id, mass, position, velocity, radius, heading, combat }));
  assert.equal(active.critical!.state, 'play');
  assert.deepEqual(state(active), state(disabled));
  assert.deepEqual(active.particles.slots, disabled.particles.slots);
  assert.deepEqual(active.salvage.chunks, disabled.salvage.chunks);
});

test('a gold payout overshoots the threshold after the entire simulation step', () => {
  const { model, critical, p } = fixture();
  grow(p, rules.threshold - 5);
  model.step(idle, dt);
  assert.equal(critical.state, 'play');
  let resourceId = 0;
  while (resourceKind(resourceId) !== 'gold') resourceId++;
  Object.assign(model.particles.slots[0], p.position, { state: 'active', resourceId });
  model.step(idle, dt);
  assert.equal(p.mass, rules.threshold + 5);
  assert.equal(p.combat.gold, 1);
  assert.equal(critical.claim?.actor, p);
  assert.equal(critical.claim?.remaining, rules.countdown);
});

test('a participant that drops below qualifying mass in the same step never begins a countdown', () => {
  const { model, critical, p } = fixture();
  grow(p, rules.threshold + 1);
  model.hazards!.sites.push({ ...p.position, kind: 'flux', radius: 28, readyAt: 0, contacts: new Set(), victims: new Map() });
  model.step(idle, dt);
  assert.ok(p.mass < rules.threshold);
  assert.equal(critical.state, 'play');
  assert.deepEqual(critical.events, []);
});

test('ties use current mass, peak, resource mass, then stable ID', () => {
  const candidates = ['zinc', 'alloy', 'copper'].map(id => actor(id, 12000));
  const chosen = () => {
    const c = new CriticalMass();
    c.afterStep(candidates, dt, 1);
    assert.equal(c.state, 'countdown');
    return c.claim?.actor.id;
  };
  assert.equal(chosen(), 'alloy');
  candidates[2].combat.resourceMass = 1000;
  assert.equal(chosen(), 'copper');
  candidates[1].combat.highest = 13000;
  assert.equal(chosen(), 'alloy');
  grow(candidates[0], 12001);
  assert.equal(chosen(), 'zinc');
});

test('a claimant at the exact threshold stays anchored, loses its held arm, and keeps charge and collection', () => {
  const { model, critical, p } = fixture();
  grow(p, rules.threshold);
  p.combat.energy = theftConfig.energy;
  assert.equal(arm(p), true);
  model.step(idle, dt);
  const anchor = critical.claim!.center;
  assert.equal(p.combat.attack.phase, 'idle');
  assert.equal(arm(p), false);
  assert.equal(release(p, Math.PI), false);
  assert.equal(p.combat.energy, theftConfig.energy);
  Object.assign(model.particles.slots[0], p.position, { state: 'active' });
  model.step({ kind: 'target', point: { x: p.position.x + 1000, y: p.position.y } }, .5);
  assert.deepEqual(p.position, anchor);
  assert.deepEqual(p.velocity, { x: 0, y: 0 });
  assert.equal(p.mass, rules.threshold + 1);
  assert.equal(critical.claim!.remaining, 2.5);
});

test('a real theft interrupts the countdown and attributes the crossing to its attacker', () => {
  const { model, critical, p, b } = fixture();
  grow(p, rules.threshold);
  model.step(idle, dt);
  p.combat.energy = 100;
  b.position = { x: center.x + 455, y: center.y };
  b.combat.energy = 100;
  assert.ok(arm(b) && release(b, Math.PI));
  for (let i = 0; i < 19; i++) model.step(idle, dt);
  assert.equal(critical.claim, undefined);
  assert.equal(critical.interruptions[0].attackerId, b.id);
  assert.equal(critical.interruptions[0].cause, 'theft');
  assert.equal(p.mass, 1051);
  assert.equal(p.combat.guardFor > 0, true);
  assert.equal(arm(p), true);
});

test('a hunter at the edge of theft range holds position until its interruption shot resolves', () => {
  const model = new ArenaModel(17889, 'normal', false, { mode: 'arena' });
  const p = grow(model.player, rules.threshold);
  const hunter = model.bots.find(bot => bot.strategy === 'hunter')!;
  model.hazards!.sites.length = 0;
  Object.assign(model, { botSteering: () => idle });
  for (const slot of model.particles.slots) slot.state = 'inactive';
  for (const bot of model.bots) bot.position = { x: 1500, y: 3500 };
  hunter.position = { x: p.position.x + p.radius + hunter.radius + theftConfig.reach - 1, y: p.position.y };
  const firingPoint = hunter.position;
  model.step(idle, dt);
  hunter.combat.energy = 100;
  model.step(idle, dt);
  assert.equal(hunter.combat.attack.phase, 'warning');
  for (let step = 0; step < 16 && model.critical!.claim; step++) model.step(idle, dt);
  assert.deepEqual(hunter.position, firingPoint);
  assert.equal(hunter.combat.hits, 1);
  assert.equal(model.critical!.interruptions[0]?.attackerId, hunter.id);
});

test('actual acid damage interrupts without assigning an attacker and the claimant may qualify again', () => {
  const { model, critical, p } = fixture();
  grow(p, rules.threshold);
  model.step(idle, dt);
  model.hazards!.sites.push({ ...p.position, kind: 'acid', radius: 115, readyAt: 0, contacts: new Set(), victims: new Map() });
  for (let i = 0; i < 40; i++) model.step(idle, dt);
  assert.equal(critical.claim, undefined);
  assert.ok(p.combat.lostToHazards > 0);
  assert.deepEqual(critical.interruptions.map(x => [x.cause, x.attackerId]), [['hazard', undefined]]);
  model.hazards!.sites.length = 0;
  grow(p, rules.threshold);
  model.step(idle, dt);
  assert.equal(critical.claim!.remaining, 3);
  grow(p, rules.threshold - 1);
  model.step(idle, dt);
  assert.equal(critical.interruptions.length, 2);
  grow(p, rules.threshold);
  model.step(idle, dt);
  assert.equal(critical.claim!.serial, 3);
  assert.equal(critical.claim!.remaining, 3);
});

test('another qualifier takes a fresh countdown after the current claimant loses mass', () => {
  const first = actor('first', 12200);
  const second = actor('second', 12050, 3000);
  const c = new CriticalMass();
  c.afterStep([second, first], dt, 10);
  assert.equal(c.claim!.actor, first);
  grow(first, 11999);
  c.afterStep([second, first], .8, 10.8);
  assert.equal(c.claim!.actor, second);
  assert.equal(c.claim!.remaining, 3);
  assert.equal(first.combat.attackBlocked, undefined);
});

test('the active countdown stops when its fixed-step updates stop', () => {
  const { model, critical, p } = fixture();
  const clock = new MatchClock('arena');
  clock.countdown = 0;
  grow(p, 12000);
  clock.advance(dt, t => model.step(idle, t), critical);
  clock.advance(.2, t => model.step(idle, t), critical);
  assert.equal(critical.claim!.remaining, 2.8);
  const stopped = critical.claim;
  clock.advance(0, t => model.step(idle, t), critical);
  assert.equal(critical.claim, stopped);
  clock.advance(.3, t => model.step(idle, t), critical);
  assert.equal(critical.claim!.remaining, 2.5);
});

test('commitment captures mass and ranking stats, disarms both sides, and makes the winner irreversible', () => {
  const p = actor('player', 12000);
  const foe = actor('foe', 2000, 1800);
  foe.combat.resourceMass = 813;
  foe.combat.energy = 100;
  arm(foe);
  const c = new CriticalMass();
  commit(c, [p, foe]);
  assert.equal(c.state, 'detonation');
  assert.equal(c.blast!.radius, 0);
  assert.equal(c.blast!.winner, p);
  assert.equal(c.removed(p), true);
  assert.equal(c.destroyed(p), false);
  assert.equal(foe.combat.attack.phase, 'idle');
  assert.equal(arm(foe), false);
  assert.equal(c.finishTimeout([p, foe], 300), undefined);
  grow(p, 8000);
  grow(foe, 14000);
  foe.combat.resourceMass = 999;
  c.afterStep([foe, p], 100, 113);
  c.advanceWave([foe, p], .4, () => {});
  assert.equal(c.state, 'shockwave');
  assert.equal(c.blast!.radius, 700);
  c.advanceWave([foe, p], .4, () => {});
  assert.equal(c.blast!.radius, 1400);
  assert.equal(c.result!.winnerId, p.id);
  assert.deepEqual(c.result!.standings.map(x => [x.id, x.mass, x.combat.resourceMass]), [[p.id,12000,0],[foe.id,2000,813]]);
  assert.ok(Object.isFrozen(c.result!.standings[0].combat) && Object.isFrozen(c.result!.detonation!.center));
  const result = c.result;
  c.advanceWave([p, foe], 60, () => {});
  assert.equal(c.result, result);
});

test('the filled wave intersects body radius, including a complete swept crossing with both endpoints clear', () => {
  const origin = { x: 0, y: 0 };
  assert.equal(sweptBlastHit({x:-60,y:0},{x:63,y:0},origin,2,5,9), true);
  assert.equal(sweptBlastHit({x:-60,y:27},{x:63,y:27},origin,2,5,9), false);
  assert.equal(sweptBlastHit({x:1430,y:0},{x:1430,y:0},origin,30,1390,1400), true);
  assert.equal(sweptBlastHit({x:1430.01,y:0},{x:1430.01,y:0},origin,30,1390,1400), false);
  assert.equal(sweptBlastHit({x:40,y:0},{x:60,y:0},origin,10,50,80), true);
});

test('a giant inside the blast is destroyed even while guarded and its frozen mass ranks below every survivor', () => {
  const giant = actor('giant', 4352, 1735);
  giant.combat.guardFor = 1.5;
  const min = actor('tiny', 20, -2400);
  const mate = actor('mate', 20, -2300);
  const p = actor('player', 12000);
  const participants = [p, giant, min, mate];
  const c = new CriticalMass();
  commit(c, participants);
  c.advanceWave(participants, .8, () => {});
  assert.equal(giant.mass, 4352);
  assert.deepEqual(c.result!.standings.map(({ id, place, outcome, survivalPoints }) => [id,place,outcome,survivalPoints]), [
    ['player',1,'detonator',0],['tiny',2,'survivor',1000],['mate',2,'survivor',1000],['giant',4,'destroyed',0],
  ]);
});

test('a low-mass participant can move out while the wave expands and keeps movement speed', () => {
  const winner = actor('rival', 12000);
  const p = actor('player', 20, 1340);
  const c = new CriticalMass();
  commit(c, [winner,p]);
  const original = p.position.x;
  c.advanceWave([winner,p], .8, (p,t) => advance(p, {kind:'target',point:{x:14000,y:5000}},t));
  assert.equal(p.position.x - original, .8 * 460);
  assert.equal(c.result!.standings[1].outcome, 'survivor');
  assert.equal(c.result!.standings[1].survivalPoints, 1000);
});

test('wall and corner blasts do not wrap, and escape routing keeps the destination legal', () => {
  for (const point of [{x:360,y:360},{x:360,y:4000}]) {
    const winning = actor('winner', 12000);
    winning.position = point;
    const near = actor('near', 400);
    near.position = {x:near.radius,y:point.y + 390};
    const far = actor('far-edge', 20);
    far.position = {x:15330,y:point.y};
    const route = escapeRoute(near,point,rules,[]);
    assert.ok(route.x >= near.radius && route.y >= near.radius);
    assert.ok(Math.hypot(route.x - point.x,route.y - point.y) - near.radius > rules.radius);
    const c = new CriticalMass();
    commit(c,[winning,near,far]);
    c.advanceWave([winning,near,far],.8,()=>{});
    assert.equal(c.destroyed(near),true);
    assert.equal(c.destroyed(far),false);
  }
});

test('zero and nineteen destructions follow the same geometry and grant only survivor rewards', () => {
  for (const [offset, count] of [[390,19],[4700,0]]) {
    const p = actor('player',12000);
    const participants = [p,...Array.from({length:19},(_,i)=>actor('bot-'+i,400,offset,i*20))];
    const c = new CriticalMass();
    commit(c, participants);
    c.advanceWave(participants,.8,()=>{});
    assert.deepEqual([c.result!.detonation!.destroyed,c.result!.detonation!.survived],[count,19-count]);
    assert.equal(c.result!.standings.reduce((sum,row)=>sum+(row.survivalPoints??0),0),(19-count)*1000);
  }
});

test('after commitment model disables all ordinary simulation until every survivor has resolved', () => {
  const { model, critical, p, b } = fixture();
  grow(b,12000);
  b.position = center;
  p.position = {x:center.x+1320,y:center.y};
  critical.afterStep(model.participants,dt,14);
  critical.afterStep(model.participants,3,17);
  const physical = p.mass;
  const natural = model.particles.slots[0];
  Object.assign(natural,p.position,{state:'active'});
  model.hazards!.sites.push({...p.position,kind:'flux',radius:28,readyAt:0,contacts:new Set(),victims:new Map()});
  model.step({kind:'target',point:{x:14000,y:5000}},.8);
  assert.equal(p.mass,physical);
  assert.equal(natural.state,'active');
  assert.equal(model.salvage.chunks.length,0);
  assert.equal(critical.result!.standings.find(x=>x.id==='player')!.outcome,'survivor');
});

function finalStep(remaining: number, hurt: boolean) {
  const {model,critical,p,b} = fixture();
  const clock = new MatchClock('arena');
  clock.countdown = 0;
  clock.elapsed = matchConfig.duration - dt;
  Reflect.set(model,'elapsed',clock.elapsed);
  grow(p,12000);
  critical.afterStep(model.participants,dt,clock.elapsed);
  critical.afterStep(model.participants,3-remaining,clock.elapsed);
  if (hurt) {
    b.position = {x:p.position.x+480,y:p.position.y};
    b.combat.energy = 100;
    b.combat.attack = {phase:'warning',bearing:bearingTo(b.position,p.position),remaining:dt};
  }
  clock.advance(dt,t=>model.step(idle,t),critical);
  return {model,critical,clock};
}

test('ordinary end time wins over an unfinished countdown and never credits a survival reward', () => {
  const {model,clock,critical}=finalStep(.4,false);
  assert.equal(clock.ended,true);
  const out=model.finish('arena',clock.elapsed)!;
  assert.equal(out.cause,'timeout');
  assert.ok(out.standings.every(x=>!x.outcome && !x.survivalPoints));
  assert.equal(critical.claim,undefined);
  assert.equal(out.winnerId,'player');
});

test('an exact final-step detonation takes precedence and the wave finishes after time expires', () => {
  const {model,clock,critical}=finalStep(dt,false);
  assert.equal(critical.committed,true);
  assert.equal(clock.ended,false);
  assert.equal(clock.elapsed,300);
  clock.advance(.8,t=>model.step(idle,t),critical);
  assert.equal(clock.ended,true);
  assert.equal(clock.elapsed,300);
  assert.equal(model.finish('arena',clock.elapsed)!.cause,'detonation');
});

test('actual final-step theft takes priority over detonation when it breaks the threshold', () => {
  const {model,clock,critical}=finalStep(dt,true);
  assert.equal(clock.ended,true);
  assert.equal(critical.committed,false);
  assert.equal(critical.interruptions[0].cause,'theft');
  assert.equal(model.finish('arena',clock.elapsed)!.cause,'timeout');
});

test('new sessions start clean and older saved data defaults safely; each result is recorded exactly once', () => {
  const old = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  let stored = '{"completed":12,"arenaMass":3456,"victories":4}';
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:(_key:string,value:string)=>{stored=value;}}});
  try {
    const progress=loadProgress();
    assert.equal(progress.completed,12);
    assert.equal(progress.criticalVictories,0);
    assert.equal(progress.survivedDetonations,0);
    const p=actor('player',12000);
    const b=actor('rival',20,800);
    const a=new CriticalMass();
    commit(a,[p,b]);
    a.advanceWave([p,b],.8,()=>{});
    assert.equal(recordMatch(progress,a.result!),true);
    assert.equal(recordMatch(progress,a.result!),undefined);
    const loaded=loadProgress();
    assert.deepEqual([loaded.completed,loaded.victories,loaded.criticalVictories,loaded.mostDestroyed],[13,5,1,1]);
    const fresh=fixture();
    assert.deepEqual([fresh.critical.state,fresh.critical.destroyedCount,fresh.critical.events.length],['play',0,0]);
    assert.equal(fresh.p.combat.attackBlocked,undefined);
    assert.equal(clearProgress().criticalVictories,0);
  } finally {
    if (old) Object.defineProperty(globalThis,'localStorage',old);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }
});
