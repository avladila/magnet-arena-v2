import type Phaser from 'phaser';
import type { ArenaModel } from '../../src/arena-model';
import { advanceAttraction } from '../../src/attraction';
import type { bindInput } from '../../src/browser-input';
import { viewConfig } from '../../src/config';
import { addMass, attractionReach } from '../../src/growth';
import { advance, createPlayer, type Point } from '../../src/movement';
import type { ParticleView } from '../../src/particle-view';
import { ParticlePool, type Collection, type Scrap } from '../../src/particles';
import { themes, type ThemeMode } from '../../src/theme';
import { ArenaCamera, type MagnetScale } from '../../src/view';

type Graphics = Phaser.GameObjects.Graphics;
type Region = { x: number; y: number; width: number; height: number };
type Fixture = { hz: number; mass: number; theme: ThemeMode; capture: boolean };
type GameScene = Phaser.Scene & {
  model: ArenaModel;
  framing: ArenaCamera;
  floor: { graphics: Graphics };
  field: { rings: Graphics };
  magnet: Graphics;
  magnetScale: MagnetScale;
  botViews: { body: Graphics; label: Phaser.GameObjects.Text }[];
  particleView: Pick<ParticleView, 'render'> & {
    pieces: Graphics; glints: Graphics; effects: { x: number; y: number; remaining: number }[];
  };
  controls: ReturnType<typeof bindInput>;
  positionCamera(): void;
  width: number;
  height: number;
};

declare global {
  var __scrapMotion: { renderer: 'Canvas' | 'WebGL'; advancing: boolean; game: Phaser.Game };
}

function scene(): GameScene {
  return __scrapMotion.game.scene.scenes[0] as GameScene;
}

function readPixels(s: GameScene, { x, y, width, height }: Region): Uint8ClampedArray {
  const renderer = s.game.renderer;
  if (!('gl' in renderer)) return renderer.gameContext.getImageData(x, y, width, height).data;
  const data = new Uint8Array(width * height * 4);
  renderer.gl.readPixels(x, s.game.canvas.height - y - height, width, height,
    renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, data);
  const topDown = new Uint8ClampedArray(data.length);
  const stride = width * 4;
  for (let row = 0; row < height; row++) {
    topDown.set(data.subarray(row * stride, (row + 1) * stride), (height - row - 1) * stride);
  }
  return topDown;
}

function png(pixels: Uint8ClampedArray, { width, height }: Region): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const data = context.createImageData(width, height);
  data.data.set(pixels);
  context.putImageData(data, 0, 0);
  return canvas.toDataURL().split(',')[1];
}

function pixelFootprint(pixels: Uint8ClampedArray, region: Region, background: number, squares: Region[], padding = 1) {
  const red = background >> 16;
  const green = (background >> 8) & 255;
  const blue = background & 255;
  let changed = 0;
  let outside = 0;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let i = 0; i < pixels.length; i += 4) {
    if (Math.max(Math.abs(pixels[i] - red), Math.abs(pixels[i + 1] - green), Math.abs(pixels[i + 2] - blue)) <= 2) continue;
    const index = i / 4;
    const x = region.x + index % region.width;
    const y = region.y + Math.floor(index / region.width);
    changed++;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    if (!squares.some((box) => x + 1 > box.x - padding && x < box.x + box.width + padding &&
        y + 1 > box.y - padding && y < box.y + box.height + padding)) outside++;
  }
  return { changed, outside, box: changed ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } : null };
}

function drawProbe(s: GameScene) {
  const { pieces, glints, effects } = s.particleView;
  const dimensions = new Set<string>();
  let fills = 0, pieceClears = 0, glintClears = 0, prepareMs = 0;
  const fillRect = pieces.fillRect;
  const clearPieces = pieces.clear;
  const clearGlints = glints.clear;
  const render = s.particleView.render;
  pieces.fillRect = function(x, y, width, height) {
    fills++;
    dimensions.add(`${width}×${height}`);
    return fillRect.call(this, x, y, width, height);
  };
  pieces.clear = function() { pieceClears++; return clearPieces.call(this); };
  glints.clear = function() { glintClears++; return clearGlints.call(this); };
  s.particleView.render = function(...args) {
    const start = performance.now();
    render.apply(this, args);
    prepareMs = performance.now() - start;
  };
  return (collections: readonly Collection[]) => {
    const data = {
      dimensions: [...dimensions], visiblePieces: fills / 2, pieceClears, glintClears,
      pieceCommands: pieces.commandBuffer.length, glintCommands: glints.commandBuffer.length,
      activeEffects: effects.filter((effect) => effect.remaining > 0).length, collections: collections.length, prepareMs,
    };
    dimensions.clear();
    fills = pieceClears = glintClears = 0;
    return data;
  };
}

const change = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });

function sample(s: GameScene, slot: Scrap, prior: { generation: number; world: Point; screen: Point }, velocity: Point) {
  const world = { x: slot.x, y: slot.y };
  const screen = s.framing.toScreen(world);
  const sameLifetime = slot.generation === prior.generation && slot.state === 'active';
  return {
    world, screen, generation: slot.generation, state: slot.state,
    worldDisplacement: sameLifetime ? change(world, prior.world) : null,
    screenDisplacement: sameLifetime ? change(screen, prior.screen) : null,
    camera: s.framing.midpoint, zoom: s.framing.zoom, playerVelocity: { ...velocity },
  };
}

export function isolated({ hz, mass, theme, capture }: Fixture) {
  const s = scene();
  s.game.loop.sleep();
  s.floor.graphics.setVisible(false);
  s.field.rings.setVisible(false);
  s.magnet.setVisible(false);
  for (const { body, label } of s.botViews) { body.setVisible(false); label.setVisible(false); }
  const palette = themes[theme];
  s.cameras.main.setBackgroundColor(palette.arena.background);
  const deltaMs = 1000 / hz;
  const inspectDraw = drawProbe(s);
  const captures: Record<string, string> = {};
  const dx = s.game.canvas.width / s.width;
  const dy = s.game.canvas.height / s.height;
  let time = 0;

  const scenarios = (['A-static', 'B-camera', 'C-pull', 'E-pickup'] as const).map((name) => {
    const player = createPlayer();
    addMass(player, mass - player.mass);
    const reach = attractionReach(player.physicalScale);
    s.framing = new ArenaCamera(player.position);
    s.framing.resize(s.width, s.height);
    s.framing.follow(player.position, 10, player.mass);
    if (name === 'B-camera') {
      for (let frame = 0; frame < Math.ceil(0.6 * hz); frame++) {
        advance(player, { kind: 'joystick', point: { x: 1, y: 0 } }, 1 / hz);
        s.framing.follow(player.position, 1 / hz, player.mass);
      }
    }
    const pool = new ParticlePool(2026, [player], 1);
    const [piece] = pool.slots;
    const { x, y } = player.position;
    Object.assign(piece, name === 'C-pull' ? { x: x + reach - 4, y } : name === 'E-pickup'
      ? { x: x + player.radius + piece.radius - 0.25, y }
      : { x: x + 48, y: y + reach + 64 }, { colorIndex: 4 });
    // The neighbor is a presentation fixture so attraction cannot remove it during the glint comparison.
    const neighbor: Scrap = { ...piece, x: piece.x + 7, id: 1 };
    let prior = { generation: piece.generation, world: { x: piece.x, y: piece.y }, screen: s.framing.toScreen(piece) };
    // The probe moves horizontally. Keep the entire previous and current path inside the readback.
    const left = Math.max(0, Math.floor((prior.screen.x - 155) * dx));
    const top = Math.max(0, Math.floor((prior.screen.y - 42) * dy));
    const right = Math.min(s.game.canvas.width, Math.ceil((prior.screen.x + 42) * dx));
    const bottom = Math.min(s.game.canvas.height, Math.ceil((prior.screen.y + 42) * dy));
    const region = { x: left, y: top, width: right - left, height: bottom - top };
    let previousStep: number | undefined;

    function frame(label: string, collections: readonly Collection[], slots: readonly Scrap[] = [piece], elapsed = 1 / hz) {
      const start = performance.now();
      s.particleView.render(slots, s.framing.bounds, collections, elapsed, palette);
      s.positionCamera();
      s.game.step(time += deltaMs, deltaMs);
      const totalMs = performance.now() - start;
      const row = sample(s, piece, prior, player.velocity);
      prior = { generation: piece.generation, world: row.world, screen: row.screen };
      const squares = slots.filter((slot) => slot.state === 'active').map((slot) => {
        const screen = s.framing.toScreen(slot);
        const radius = 3.5 * s.framing.zoom;
        return { x: dx * (screen.x - radius), y: dy * (screen.y - radius), width: 2 * dx * radius, height: 2 * dy * radius };
      });
      const pixels = readPixels(s, region);
      const footprint = pixelFootprint(pixels, region, palette.arena.background, squares);
      const wallIntervalMs = previousStep === undefined ? null : start - previousStep;
      previousStep = start;
      if (capture && ['start', 'next', 'end', 'overlap', 'glint-only', 'expired'].includes(label)) {
        captures[`${name}-${label}`] = png(pixels, region);
      }
      return { label, ...row, draw: inspectDraw(collections), footprint, region,
        targetDeltaMs: deltaMs, simulationDeltaMs: elapsed * 1000, wallIntervalMs, totalMs };
    }

    if (name === 'E-pickup') {
      const rows = [frame('start', [], [piece, neighbor], 0)];
      const result = advanceAttraction(pool, [player], 0);
      rows.push(frame('overlap', result.collections, [piece, neighbor], 0));
      rows.push(frame('glint-only', [], [piece], 0.11));
      rows.push(frame('expired', [], [piece], 0.12));
      return { name, rows };
    }

    const rows = [frame('start', [], [piece], 0)];
    const steps = Math.floor(hz * (name === 'C-pull' ? 0.12 : 0.25));
    for (let step = 1; step <= steps; step++) {
      if (name === 'B-camera') {
        advance(player, { kind: 'joystick', point: { x: 1, y: 0 } }, 1 / hz);
        s.framing.follow(player.position, 1 / hz, player.mass);
      }
      const label = step === 1 ? 'next' : step === steps ? 'end' : 'step';
      rows.push(frame(label, advanceAttraction(pool, [player], 1 / hz).collections));
    }
    piece.state = 'inactive';
    rows.push(frame('clear', []));
    return { name, rows };
  });

  return { scenarios, captures };
}

export function gameplay({ hz, mass, capture }: Fixture) {
  const s = scene();
  s.game.loop.sleep();
  const { player, particles } = s.model;
  addMass(player, mass - player.mass);
  s.framing.follow(player.position, 10, player.mass);
  s.magnetScale.update(player.physicalScale, 10);
  s.positionCamera();
  const reach = attractionReach(player.physicalScale);
  const [tracked, outside] = particles.slots;
  Object.assign(tracked, { x: player.position.x + reach - 8, y: player.position.y });
  Object.assign(outside, { x: player.position.x + 40, y: player.position.y - reach - 65 });
  const slots = [tracked, outside];
  let prior = slots.map((slot) => ({ generation: slot.generation, world: { x: slot.x, y: slot.y }, screen: s.framing.toScreen(slot) }));
  const inspectDraw = drawProbe(s);
  const captures: Record<string, string> = {};
  let collected: readonly Collection[] = [];
  const stepModel = s.model.step.bind(s.model);
  s.model.step = (...args) => {
    const result = stepModel(...args);
    collected = result?.collections ?? [];
    return result;
  };
  const graphicsCount = () => s.children.list.filter(({ type }) => type === 'Graphics').length;
  const readyGraphics = graphicsCount();
  const delta = 1000 / hz;
  const frames = [];
  let previousStep: number | undefined;
  for (let tick = 0; tick < hz; tick++) {
    const phase = tick < hz * 0.4 ? 'move' : tick < hz * 0.7 ? 'turn' : 'stop';
    if (phase === 'move') s.controls.input.mouseMove({ x: s.width * 0.85, y: s.height * 0.5 });
    else if (phase === 'turn') s.controls.input.mouseMove({ x: s.width * 0.5, y: s.height * 0.88 });
    else s.controls.input.mouseLeave();
    const start = performance.now();
    __scrapMotion.advancing = true;
    s.game.step((tick + 1) * delta, delta);
    __scrapMotion.advancing = false;
    const totalMs = performance.now() - start;
    const tracking = slots.map((slot, i) => sample(s, slot, prior[i], player.velocity));
    prior = tracking.map(({ generation, world, screen }) => ({ generation, world, screen }));
    const bounds = s.framing.bounds;
    const expectedVisible = particles.slots.filter((p) => p.state === 'active' && p.x + p.radius >= bounds.left &&
      p.x - p.radius <= bounds.right && p.y + p.radius >= bounds.top && p.y - p.radius <= bounds.bottom).length;
    frames.push({ phase, tracking, draw: inspectDraw(collected), expectedVisible, targetDeltaMs: delta,
      wallIntervalMs: previousStep === undefined ? null : start - previousStep, totalMs });
    previousStep = start;
    if (capture && [0, Math.floor(hz / 2), hz - 1].includes(tick)) {
      const region = { x: 0, y: 0, width: s.game.canvas.width, height: s.game.canvas.height };
      captures[`${phase}-${tick}`] = png(readPixels(s, region), region);
    }
  }
  return { frames, captures, graphicsObjects: [readyGraphics, graphicsCount()],
    activeScrap: particles.slots.filter((slot) => slot.state === 'active').length, stats: particles.regionStats };
}

export async function profile(seconds: number, mass: number) {
  const s = scene();
  const delta: number[] = [], render: number[] = [], prep: number[] = [], visible: number[] = [];
  const pieces = s.particleView.pieces;
  const graphicsCount = () => s.children.list.filter(({ type }) => type === 'Graphics').length;
  const graphicsBefore = graphicsCount();
  const pickupStart = s.model.participants.map((p) => p.pickupsCollected);
  const { player } = s.model;
  addMass(player, mass - player.mass);
  s.framing.follow(player.position, 10, player.mass);
  s.magnetScale.update(player.physicalScale, 10);
  const renderer = s.game.renderer;
  const preRender = renderer.preRender;
  const postRender = renderer.postRender;
  const prepare = s.particleView.render;
  let drawStart: number;
  renderer.preRender = function() {
    drawStart = performance.now();
    preRender.call(this);
  };
  renderer.postRender = function() {
    postRender.call(this);
    render.push(performance.now() - drawStart);
  };
  s.particleView.render = function(...args) {
    const start = performance.now();
    prepare.apply(this, args);
    prep.push(performance.now() - start);
    visible.push(pieces.commandBuffer.length / 16);
  };
  __scrapMotion.advancing = true;
  s.controls.input.mouseMove({ x: s.width * 0.9, y: s.height * 0.5 });
  await new Promise<void>((resolve) => {
    let start: number, previous: number;
    function next(now: number) {
      start ??= now;
      if (previous !== undefined) delta.push(now - previous);
      previous = now;
      if (now - start < seconds * 1000) requestAnimationFrame(next);
      else resolve();
    }
    requestAnimationFrame(next);
  });
  s.controls.input.mouseLeave();
  __scrapMotion.advancing = false;
  renderer.preRender = preRender;
  renderer.postRender = postRender;
  s.particleView.render = prepare;
  return { delta, render, prep, visible, pickups: s.model.participants.map((p, i) => p.pickupsCollected - pickupStart[i]),
    graphicsObjects: [graphicsBefore, graphicsCount()] };
}
