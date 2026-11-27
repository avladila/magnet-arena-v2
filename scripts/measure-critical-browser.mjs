import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const [baseline, candidate] = process.argv.slice(2);
if (!baseline || !candidate) throw new Error('Pass the RC7A and RC7B Vite development URLs');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });

async function open(baseURL, quality, reducedMotion, width, height) {
  const page = await browser.newPage({ baseURL, viewport: { width, height }, reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    ...(width < 900 && { hasTouch: true, isMobile: true }) });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ quality, reducedMotion }) => {
    localStorage.setItem('magnet-theme', 'dark');
    localStorage.setItem('magnet.progress.v1', JSON.stringify({ quality, reducedMotion, master: 0 }));
    crypto.getRandomValues = buffer => { if (buffer instanceof Uint32Array) buffer.fill(17889); return buffer; };
  }, { quality, reducedMotion });
  await page.route(url => url.pathname === '/src/main.ts', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const anchor = 'this.floor = new ArenaFloor';
    assert.ok(source.includes(anchor));
    await route.fulfill({ response, body: source.replace(anchor, 'window.measureScene = this; ' + anchor) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play Arena' }).click();
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.setMass = (await import('/src/growth.ts')).addMass;
    window.measureScene.clock.countdown = 0;
  });
  await page.locator('#arena').focus();
  return { page, errors };
}

async function fill(page, offscreen) {
  await page.evaluate(offscreen => {
    const scene = window.measureScene;
    const { model } = scene;
    const { player, bots } = model;
    const center = { x: player.position.x - (offscreen ? 1120 : 0), y: player.position.y };
    if (!offscreen) window.setMass(player, 11050 - player.mass);
    scene.magnetScale.scale = player.physicalScale;
    model.replenish = () => {};
    model.botSteering = () => ({ kind: 'idle' });
    if (model.critical) model.endgameSteering = () => undefined;
    model.hazards.sites.length = 0;
    const point = (x, y) => ({ x: center.x + x, y: center.y + y });
    bots.forEach((bot, i) => {
      const angle = i * 2.399963;
      const r = 410 + (i % 5) * 31;
      bot.position = offscreen && i === 0 ? center : point(Math.cos(angle) * r, Math.sin(angle) * r);
      const mass = i < 7 ? 8300 + i * 350 : 80 + i * 15;
      window.setMass(bot, mass - bot.mass);
      scene.botViews[i].scale.scale = bot.physicalScale;
    });
    for (const slot of model.particles.slots) slot.state = 'inactive';
    for (let i = 0; i < model.salvage.capacity; i++) {
      const at = point((1280 + i % 132) * (i % 2 ? 1 : -1), i * 29 % 1140 - 570);
      model.salvage.chunks.push({ ...at, origin: at, destination: at, age: .6, value: 25 + i % 65 });
    }
    scene.framing.follow(player.position, 8, player.mass);
  }, offscreen);
}

async function sample(page, trigger) {
  return page.evaluate(trigger => new Promise(resolve => {
    const scene = window.measureScene;
    const { model, game } = scene;
    const samples = new Map();
    const initial = scene.clock.elapsed;
    let start = 0, prior = 0, lastPhase = '', peakLoot = 0, peakVisible = 0, peakFragments = 0;
    const prestep = () => { start = performance.now(); };
    const postrender = () => {
      const ended = performance.now();
      const phase = model.critical?.committed ? 'wave' : model.critical?.claim ? 'countdown' : 'play';
      if (start) {
        const group = samples.get(phase) ?? { cpu: [], cadence: [] };
        group.cpu.push(ended - start);
        if (prior && lastPhase === phase) group.cadence.push(ended - prior);
        samples.set(phase, group);
      }
      prior = ended;
      lastPhase = phase;
      const bound = scene.framing.bounds;
      peakLoot = Math.max(peakLoot, model.salvage.chunks.length);
      peakVisible = Math.max(peakVisible, model.participants.filter(actor => {
        const { position: p, radius } = actor;
        return p.x + radius >= bound.left && p.x - radius <= bound.right && p.y + radius >= bound.top && p.y - radius <= bound.bottom &&
          !model.critical?.removed(actor);
      }).length);
      peakFragments = Math.max(peakFragments, scene.criticalView?.plates.pool.length ?? 0);
      if (trigger ? !scene.clock.ended : scene.clock.elapsed - initial < 4) return;
      game.events.off('prestep', prestep);
      game.events.off('postrender', postrender);
      const percentile = values => {
        values.sort((a, b) => a - b);
        return [0.5, 0.95].map(q => values.length ? Math.round(values[Math.floor(values.length * q)] * 100) / 100 : null);
      };
      const phases = [...samples].map(([phase, { cpu, cadence }]) => ({ phase, frames: cpu.length, cpu: percentile(cpu), cadence: percentile(cadence) }));
      resolve({ participantCount: model.participants.length, peakVisible, peakLoot, peakFragments, phases,
        destroyed: model.critical?.destroyedCount ?? 0, result: model.matchResult?.cause });
    };
    game.events.on('prestep', prestep);
    game.events.on('postrender', postrender);
    if (trigger) {
      const actor = trigger === 'offscreen' ? model.bots[0] : model.player;
      window.setMass(actor, 12000 - actor.mass);
    }
  }), trigger);
}

async function measure(baseURL, revision, label, quality, reducedMotion, width, height, dense = false, trigger) {
  const { page, errors } = await open(baseURL, quality, reducedMotion, width, height);
  try {
    if (dense) await fill(page, trigger === 'offscreen');
    await page.waitForFunction(() => window.measureScene.clock.elapsed > .6);
    const pending = sample(page, trigger);
    if (!dense) await page.keyboard.down('KeyD');
    const result = await pending;
    if (!dense) await page.keyboard.up('KeyD');
    assert.deepEqual(errors, []);
    assert.equal(result.participantCount, 20);
    assert.ok(result.peakFragments <= 72);
    if (dense) assert.equal(result.peakLoot, 1024);
    if (trigger) {
      assert.equal(result.result, 'detonation');
      assert.ok(result.destroyed >= 9);
      assert.equal(await page.locator('#critical-direction').getAttribute('data-offscreen') !== null, trigger === 'offscreen');
    }
    console.log(JSON.stringify({ revision, label, quality, reducedMotion, width, height, ...result }));
  } finally {
    await page.close();
  }
}

async function replay() {
  const { page, errors } = await open(candidate, 'balanced', false, 1366, 768);
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const before = await cdp.send('Runtime.getHeapUsage');
    const result = await page.evaluate(() => {
      const scene = window.measureScene;
      const started = performance.now();
      let results = 0;
      for (let count = 0; count < 50; count++) {
        scene.clock.countdown = 0;
        const { model } = scene;
        model.hazards.sites.length = 0;
        model.replenish = () => {};
        model.botSteering = () => ({ kind: 'idle' });
        for (const bot of model.bots) bot.position = { x: 1800, y: 3000 };
        window.setMass(model.player, 12000 - model.player.mass);
        for (let frame = 0; frame < 35 && !scene.clock.ended; frame++) scene.update(performance.now(), 145);
        if (model.matchResult?.cause === 'detonation') results++;
        document.querySelector('button[data-action="replay"]').click();
        if (scene.model.critical.state !== 'play' || !document.querySelector('#critical-warning').hidden) break;
      }
      return { results, elapsed: performance.now() - started, canvases: document.querySelectorAll('#arena > canvas').length,
        stored: JSON.parse(localStorage.getItem('magnet.progress.v1')).criticalVictories };
    });
    await cdp.send('HeapProfiler.collectGarbage');
    const after = await cdp.send('Runtime.getHeapUsage');
    assert.deepEqual(errors, []);
    assert.equal(result.results, 50);
    assert.equal(result.stored, 50);
    assert.equal(result.canvases, 1);
    const retained = after.usedSize - before.usedSize;
    assert.ok(retained < 12 * 1024 * 1024);
    console.log(JSON.stringify({ revision: 'rc7b', label: '50 detonations and replays', ...result, retained }));
  } finally {
    await page.close();
  }
}

try {
  for (const [label, quality, reduced, w, h] of [['desktop', 'balanced', false, 1366, 768], ['portrait', 'balanced', false, 390, 844],
    ['landscape', 'low', true, 844, 390]]) {
    await measure(baseline, 'rc7a', label, quality, reduced, w, h);
    await measure(candidate, 'rc7b', label, quality, reduced, w, h);
  }
  for (const [quality, reduced] of [['low', false], ['balanced', false], ['high', false], ['high', true]]) {
    await measure(baseline, 'rc7a', 'dense', quality, reduced, 1366, 768, true);
    await measure(candidate, 'rc7b', 'dense', quality, reduced, 1366, 768, true);
    await measure(candidate, 'rc7b', 'onscreen', quality, reduced, 1366, 768, true, 'onscreen');
  }
  await measure(candidate, 'rc7b', 'offscreen', 'balanced', false, 1120, 700, true, 'offscreen');
  await replay();
} finally {
  await browser.close();
}
