import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, normalizePath } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SCRAP_PLAYWRIGHT_MODULE ?? 'playwright-core');
const repo = fileURLToPath(new URL('../../', import.meta.url));
const mainFile = normalizePath(join(repo, 'src/main.ts'));
const output = process.env.SCRAP_OUTPUT_DIR ? resolve(process.env.SCRAP_OUTPUT_DIR) : await mkdtemp(join(tmpdir(), 'magnet-scrap-'));
const matrix = [
  { name: 'desktop-1', width: 1280, height: 800, dpr: 1, hz: 60, theme: 'light', mass: 20, reduced: false },
  { name: 'desktop-2', width: 1280, height: 800, dpr: 2, hz: 30, theme: 'dark', mass: 400, reduced: true },
  { name: 'portrait-2', width: 390, height: 844, dpr: 2, hz: 60, theme: 'dark', mass: 2000, reduced: false },
  { name: 'portrait-3', width: 390, height: 844, dpr: 3, hz: 120, theme: 'light', mass: 4352, reduced: true },
  { name: 'landscape-1', width: 844, height: 390, dpr: 1, hz: 120, theme: 'dark', mass: 400, reduced: true },
  { name: 'landscape-3', width: 844, height: 390, dpr: 3, hz: 30, theme: 'light', mass: 4352, reduced: false },
];
const selected = process.env.SCRAP_CASE ? matrix.filter(({ name }) => name === process.env.SCRAP_CASE) : matrix;
const renderers = process.env.SCRAP_RENDERER ? [process.env.SCRAP_RENDERER] : ['Canvas', 'WebGL'];
assert.ok(selected.length, 'Unknown SCRAP_CASE');
assert.ok(renderers.every((name) => name === 'Canvas' || name === 'WebGL'), 'Unknown SCRAP_RENDERER');
await mkdir(output, { recursive: true });

const server = await createServer({
  root: repo, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'magnet-scrap-motion-fixture',
    enforce: 'pre',
    transform(source, id) {
      if (id !== mainFile) return;
      const changes = [
        ['Math.floor(Math.random() * 0x100000000)', '2026'],
        ['new Phaser.Game({', 'globalThis.__scrapMotion.game = new Phaser.Game({'],
        ['type: Phaser.AUTO,', "type: globalThis.__scrapMotion.renderer === 'Canvas' ? Phaser.CANVAS : Phaser.WEBGL,"],
        ['update(_time: number, delta: number): void {',
          'update(_time: number, delta: number): void {\n    if (!globalThis.__scrapMotion.advancing) return;'],
      ];
      for (const [before, after] of changes) {
        assert.ok(source.includes(before), `Fixture hook missing in src/main.ts: ${before}`);
        source = source.replace(before, after);
      }
      return source;
    },
  }],
});

async function open(browser, renderer, spec) {
  const mobile = !spec.name.startsWith('desktop');
  const page = await browser.newPage({
    viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: spec.dpr, isMobile: mobile, hasTouch: mobile,
    reducedMotion: spec.reduced ? 'reduce' : 'no-preference',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(({ renderer, theme }) => {
    globalThis.__scrapMotion = { renderer, advancing: false };
    if (location.protocol === 'http:') localStorage.setItem('magnet-theme', theme);
  }, { renderer, theme: spec.theme });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__scrapMotion?.game?.scene?.scenes[0]?.controls, null, { timeout: 20000 })
    .catch((error) => { throw new Error(errors.join('\n') || error.message); });
  const environment = await page.evaluate(() => {
    const { game } = globalThis.__scrapMotion;
    const gl = game.renderer.gl;
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: gl ? 'WebGL' : 'Canvas', backend: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
      canvas: [game.canvas.width, game.canvas.height], theme: document.documentElement.dataset.theme,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      clearBeforeRender: game.config.clearBeforeRender, roundPixels: game.config.roundPixels,
      preserveDrawingBuffer: game.config.preserveDrawingBuffer,
    };
  });
  assert.equal(environment.renderer, renderer);
  assert.deepEqual(environment.canvas, [spec.width * spec.dpr, spec.height * spec.dpr]);
  assert.equal(environment.theme, spec.theme);
  assert.equal(environment.reduced, spec.reduced);
  return { page, environment, errors };
}

async function writeCaptures(dir, prefix, { captures, ...data }) {
  for (const [name, base64] of Object.entries(captures)) await writeFile(join(dir, `${prefix}-${name}.png`), Buffer.from(base64, 'base64'));
  return { ...data, captures: Object.keys(captures).map((name) => `${prefix}-${name}.png`) };
}

const length = ({ x, y }) => Math.hypot(x, y);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} differs from ${b}`);

function assertDraw(draw) {
  assert.equal(draw.pieceClears, 1);
  assert.equal(draw.glintClears, 1);
  assert.deepEqual(draw.dimensions, draw.visiblePieces ? ['7×7', '3×2'] : []);
  assert.equal(draw.pieceCommands, 16 * draw.visiblePieces);
  assert.ok(draw.activeEffects <= 20);
}

function checkIsolated(probes, dpr) {
  for (const { name, rows } of probes.scenarios) {
    for (const row of rows) assertDraw(row.draw);
    if (name === 'E-pickup') {
      const [start, overlap, only, expired] = rows;
      assert.equal(start.draw.visiblePieces, 2);
      assert.equal(start.draw.activeEffects, 0);
      assert.equal(start.footprint.outside, 0);
      assert.equal(overlap.draw.visiblePieces, 1);
      assert.equal(overlap.draw.collections, 1);
      assert.ok(overlap.footprint.outside > 0);
      assert.equal(only.draw.visiblePieces, 0);
      assert.equal(only.draw.activeEffects, 1);
      assert.ok(only.footprint.box.width > 7 * only.zoom * dpr);
      assert.equal(expired.draw.activeEffects, 0);
      assert.equal(expired.footprint.changed, 0);
      continue;
    }
    const active = rows.slice(0, -1);
    const first = active[0];
    for (const row of active) {
      assert.equal(row.draw.visiblePieces, 1);
      assert.equal(row.draw.collections, 0);
      assert.equal(row.draw.activeEffects, 0);
      assert.equal(row.footprint.outside, 0, JSON.stringify({ name, row }));
      for (const dimension of [row.footprint.box.width, row.footprint.box.height]) {
        assert.ok(Math.abs(dimension - 7 * row.zoom * dpr) <= 2, JSON.stringify({ name, row, dpr }));
      }
      if (name !== 'C-pull') assert.equal(length(row.worldDisplacement), 0);
      if (name === 'A-static') {
        assert.equal(length(row.screenDisplacement), 0);
        assert.deepEqual(row.footprint, first.footprint);
      }
      if (name === 'B-camera') near(row.screen.x - first.screen.x, -(row.camera.x - first.camera.x) * row.zoom);
      if (name === 'C-pull') {
        assert.deepEqual(row.camera, first.camera);
        near(length(row.screenDisplacement), length(row.worldDisplacement) * row.zoom);
      }
    }
    assert.equal(rows.at(-1).footprint.changed, 0);
    if (name !== 'A-static') assert.ok(Math.abs(active.at(-1).screen.x - first.screen.x) > 1);
  }
}

function checkGameplay({ frames, graphicsObjects, activeScrap, stats }) {
  for (const { draw, expectedVisible } of frames) {
    assertDraw(draw);
    assert.equal(draw.visiblePieces, expectedVisible);
  }
  assert.equal(graphicsObjects[0], graphicsObjects[1]);
  assert.equal(activeScrap, 720);
  assert.equal(stats.duplicateActivations, 0);
  assert.ok(frames.some(({ draw }) => draw.collections > 0));
  assert.ok(frames.some(({ tracking }) => tracking[0].worldDisplacement && length(tracking[0].worldDisplacement) > 0));
  assert.ok(frames.some(({ phase, tracking }) => phase === 'move' && tracking[0].playerVelocity.x > 400));
  assert.ok(frames.some(({ phase, tracking }) => phase === 'turn' && tracking[0].playerVelocity.y > 300));
  assert.ok(frames.filter(({ phase }) => phase === 'stop').every(({ tracking }) => length(tracking[0].playerVelocity) === 0));
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, p50: sorted[Math.floor((sorted.length - 1) * 0.5)],
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)], max: sorted.at(-1) };
}

async function profile(page, mass) {
  const cdp = await page.context().newCDPSession(page);
  const usedHeap = () => page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  await cdp.send('HeapProfiler.collectGarbage');
  const heapBefore = await usedHeap();
  const gc = [];
  cdp.on('Tracing.dataCollected', ({ value }) => {
    for (const event of value) {
      if (event.ph === 'X' && /^(MinorGC|MajorGC)$/.test(event.name)) gc.push({ name: event.name, durationMs: event.dur / 1000 });
    }
  });
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8', transferMode: 'ReportEvents' });
  const raw = await page.evaluate(async (mass) => (await import('/scripts/scrap-motion/fixture.ts')).profile(8, mass), mass);
  const traceEnded = new Promise((done) => cdp.once('Tracing.tracingComplete', done));
  await cdp.send('Tracing.end');
  await traceEnded;
  await cdp.send('HeapProfiler.collectGarbage');
  const heapAfter = await usedHeap();
  assert.equal(raw.graphicsObjects[0], raw.graphicsObjects[1]);
  assert.ok(raw.pickups[0] > 0);
  return { frameMs: summarize(raw.delta), rendererMs: summarize(raw.render), particlesMs: summarize(raw.prep),
    visiblePieces: summarize(raw.visible), pickups: raw.pickups, graphicsObjects: raw.graphicsObjects,
    fps: 1000 * raw.delta.length / raw.delta.reduce((sum, frame) => sum + frame, 0),
    framesOver33_5Ms: raw.delta.filter((time) => time > 33.5).length,
    heapBefore, heapAfter, gc, raw };
}

const report = { seed: 2026, results: [], skipped: [] };
try {
  await server.listen();
  for (const renderer of renderers) {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE,
      args: ['--enable-precise-memory-info', ...(renderer === 'WebGL' ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [])] });
    try {
      if (renderer === 'WebGL') {
        const probe = await browser.newPage();
        const supported = await probe.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
        await probe.close();
        if (!supported) { report.skipped.push({ renderer, reason: 'Chromium could not create a WebGL context' }); continue; }
      }
      for (const spec of selected) {
        const tag = `${renderer.toLowerCase()}-${spec.name}`;
        const dir = join(output, tag);
        await mkdir(dir, { recursive: true });
        const main = await open(browser, renderer, spec);
        const parameters = { ...spec, capture: true };
        const probes = await main.page.evaluate(async (args) => (await import('/scripts/scrap-motion/fixture.ts')).isolated(args), parameters);
        checkIsolated(probes, spec.dpr);
        const row = { chromium: browser.version(), spec, environment: main.environment,
          isolated: await writeCaptures(dir, 'probe', probes) };
        await main.page.close();
        const live = await open(browser, renderer, spec);
        const game = await live.page.evaluate(async (args) => (await import('/scripts/scrap-motion/fixture.ts')).gameplay(args), parameters);
        checkGameplay(game);
        row.gameplay = await writeCaptures(dir, 'game', game);
        await live.page.close();
        if (process.env.SCRAP_PROFILE !== '0' && ['desktop-1', 'portrait-3', 'landscape-3'].includes(spec.name)) {
          const running = await open(browser, renderer, spec);
          row.profile = await profile(running.page, spec.mass);
          await running.page.close();
          assert.deepEqual(running.errors, []);
        }
        assert.deepEqual([...main.errors, ...live.errors], []);
        report.results.push(row);
        await writeFile(join(dir, 'measurements.json'), JSON.stringify(row, null, 2));
        console.log(`${renderer} ${spec.name}, ${spec.hz} Hz, mass ${spec.mass}: passed${row.profile ? ` · ${row.profile.fps.toFixed(1)} fps` : ''}`);
      }
    } finally {
      await browser.close();
    }
  }
  console.log(`Captures and per-frame records in ${output}`);
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  await server.close();
}
