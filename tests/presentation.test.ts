import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Phaser from 'phaser';
import { drawArena } from '../src/art';
import { advanceAttraction } from '../src/attraction';
import { arena, arenaArt, growthFeedback } from '../src/config';
import { addMass, attractionReach } from '../src/growth';
import { GrowthFeedback, GrowthFeedbackView } from '../src/growth-feedback';
import { createPlayer, type Point } from '../src/movement';
import { ParticleView } from '../src/particle-view';
import { ParticlePool } from '../src/particles';
import { themes } from '../src/theme';
import { bindThemeToggle, ThemePreference } from '../src/theme-control';
import { ArenaCamera } from '../src/view';

class GraphicsRecorder {
  readonly paths: Point[] = [];
  readonly fills: number[] = [];
  readonly circles: { x: number; y: number; radius: number; color: number }[] = [];
  position: Point = { x: 0, y: 0 };
  private lineColor = 0;

  clear() {
    this.paths.length = 0;
    this.fills.length = 0;
    this.circles.length = 0;
    return this;
  }

  fillStyle(color: number) { this.fills.push(color); return this; }
  fillRect() { return this; }
  lineStyle(_width: number, color: number) { this.lineColor = color; return this; }
  strokeRect() { return this; }
  beginPath() { return this; }
  moveTo(x: number, y: number) { this.paths.push({ x, y }); return this; }
  lineTo(x: number, y: number) { return this.moveTo(x, y); }
  strokePath() { return this; }
  strokeCircle(x: number, y: number, radius: number) {
    this.circles.push({ x, y, radius, color: this.lineColor });
    return this;
  }

  setDepth() { return this; }
  setPosition(x: number, y: number) { this.position = { x, y }; return this; }
}

function sceneWithGraphics(...recorders: GraphicsRecorder[]): Phaser.Scene {
  return { add: { graphics: () => recorders.shift() } } as unknown as Phaser.Scene;
}

function relativeLuminance(color: number) {
  const [r, g, b] = [16, 8, 0].map((shift) => {
    const channel = ((color >> shift) & 0xff) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('both themes define ten distinct scrap colors with contrast against their arena', () => {
  for (const theme of Object.values(themes)) {
    assert.equal(theme.scrap.length, 10);
    assert.equal(new Set(theme.scrap).size, 10);
    const background = relativeLuminance(theme.arena.background);
    for (const value of theme.scrap) {
      assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffff);
      const color = relativeLuminance(value);
      const contrast = (Math.max(color, background) + 0.05) / (Math.min(color, background) + 0.05);
      assert.ok(contrast >= 3, `Low contrast for #${value.toString(16)}`);
    }
  }
});

test('theme preference defaults to light and persists both valid selections', () => {
  let stored: string | null = null;
  const storage = {
    getItem: () => stored,
    setItem: (_name: string, value: string) => { stored = value; },
  };
  const choice = new ThemePreference(storage);
  assert.equal(choice.current, 'light');
  assert.equal(choice.palette, themes.light);
  choice.toggle();
  assert.equal(choice.current, 'dark');
  assert.equal(choice.palette, themes.dark);
  const reloaded = new ThemePreference(storage);
  assert.equal(reloaded.current, 'dark');
  reloaded.toggle();
  assert.equal(stored, 'light');
  assert.equal(new ThemePreference(storage).current, 'light');
});

test('invalid or blocked storage falls back to light and still allows session changes', () => {
  const blocked = () => { throw new Error('Storage unavailable'); };
  assert.equal(new ThemePreference({ getItem: () => 'auto', setItem: blocked }).current, 'light');
  for (const choice of [new ThemePreference({ getItem: blocked, setItem: blocked }), new ThemePreference()]) {
    assert.equal(choice.current, 'light');
    choice.toggle();
    assert.equal(choice.current, 'dark');
    choice.toggle();
    assert.equal(choice.current, 'light');
  }
});

test('theme button consumes steering events while preserving native activation', () => {
  const button = new EventTarget() as HTMLButtonElement;
  const preference = new ThemePreference();
  const unbind = bindThemeToggle(button, () => preference.toggle());
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    assert.equal(event.cancelBubble, true);
    assert.equal(event.defaultPrevented, false);
    assert.equal(preference.current, 'light');
  }
  button.dispatchEvent(new Event('click'));
  assert.equal(preference.current, 'dark');
  unbind();
  button.dispatchEvent(new Event('click'));
  assert.equal(preference.current, 'dark');
});

test('a second finger can toggle once on release inside the button', () => {
  const button = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 54, bottom: 54 }),
  }) as unknown as HTMLButtonElement;
  const preference = new ThemePreference();
  const unbind = bindThemeToggle(button, () => preference.toggle());
  const touch = (type: string, pointerId = 5, clientX = 30, isPrimary = false) => {
    button.dispatchEvent(Object.assign(new Event(type), {
      pointerType: 'touch', isPrimary, pointerId, clientX, clientY: 30,
    }));
  };
  touch('pointerdown');
  touch('pointerup', 6);
  assert.equal(preference.current, 'light');
  touch('pointerup', 5, 70);
  assert.equal(preference.current, 'light');
  touch('pointerdown');
  touch('pointercancel');
  touch('pointerup');
  assert.equal(preference.current, 'light');
  touch('pointerdown');
  touch('pointerup');
  assert.equal(preference.current, 'dark');
  touch('click');
  assert.equal(preference.current, 'dark');
  touch('pointerdown', 7, 30, true);
  touch('pointerup', 7, 30, true);
  // Chromium's click synthesized from a primary tap can report isPrimary false.
  touch('click', 7);
  assert.equal(preference.current, 'light');
  unbind();
});

test('repeated theme changes recolor pieces and live pickup glints without touching their model', () => {
  const player = createPlayer();
  const pool = new ParticlePool(7, player, 2);
  Object.assign(pool.slots[0], player.position, { colorIndex: 9 });
  const collections = advanceAttraction(pool, player, 0);
  const objects = [...pool.slots];
  const state = structuredClone({ player, slots: pool.slots, collections });
  const pieces = new GraphicsRecorder();
  const glints = new GraphicsRecorder();
  const view = new ParticleView(sceneWithGraphics(pieces, glints));
  const preference = new ThemePreference();

  for (let i = 0; i < 4; i++) {
    const palette = preference.palette;
    view.render(pool.slots, { left: 0, top: 0, right: arena.width, bottom: arena.height },
      i === 0 ? collections : [], 0.01, palette);
    assert.deepEqual(pieces.fills, [palette.scrap[pool.slots[1].colorIndex], palette.scrapHighlight]);
    assert.equal(glints.circles[0].color, palette.scrap[9]);
    preference.toggle();
  }
  assert.deepEqual({ player, slots: pool.slots, collections }, state);
  pool.slots.forEach((slot, id) => assert.equal(slot, objects[id]));
});

test('halo eases toward the current world-space reach without changing contact geometry', () => {
  const player = createPlayer();
  const feedback = new GrowthFeedback(player);
  assert.equal(feedback.haloRadius, 118);
  for (const mass of [200, 2500]) {
    const previousRadius = feedback.haloRadius;
    addMass(player, mass - player.mass);
    const state = structuredClone(player);
    const reach = attractionReach(player.physicalScale);
    feedback.update(player, 1 / 60, false);
    assert.ok(feedback.haloRadius > previousRadius && feedback.haloRadius < reach);
    feedback.update(player, 4, false);
    assert.equal(feedback.haloRadius, reach);
    assert.deepEqual(player, state);
  }
  assert.equal(feedback.haloRadius, 230);

  const pool = new ParticlePool(7, player, 1);
  Object.assign(pool.slots[0], { x: player.position.x + player.radius + 6, y: player.position.y });
  assert.equal(advanceAttraction(pool, player, 0).length, 0);
  assert.equal(advanceAttraction(pool, player, 1).length, 1);
});

test('milestones pulse once as mass crosses 50, 100, 200 and 400', () => {
  const player = createPlayer();
  const feedback = new GrowthFeedback(player);
  for (const threshold of [50, 100, 200, 400]) {
    addMass(player, threshold - 1 - player.mass);
    assert.equal(feedback.update(player, 0.016, false), undefined);
    addMass(player, 1);
    assert.equal(feedback.update(player, 0.016, false), threshold);
    assert.equal(feedback.pulseProgress, 0);
    assert.equal(feedback.update(player, 0.1, false), undefined);
    assert.ok(feedback.pulseProgress! > 0);
    assert.equal(feedback.update(player, growthFeedback.pulseSeconds, false), undefined);
    assert.equal(feedback.pulseProgress, undefined);
  }
});

test('a batch uses one pulse for the highest crossing and reduced motion clears it', () => {
  const player = createPlayer();
  const feedback = new GrowthFeedback(player);
  addMass(player, 380);
  assert.equal(feedback.update(player, 0, false), 400);
  assert.equal(feedback.pulseProgress, 0);
  feedback.update(player, 0.01, true);
  assert.equal(feedback.pulseProgress, undefined);
  assert.equal(feedback.update(player, 0.01, false), undefined);
  assert.equal(feedback.pulseProgress, undefined);

  const art = new GraphicsRecorder();
  const fresh = createPlayer();
  const view = new GrowthFeedbackView(sceneWithGraphics(art), fresh);
  addMass(fresh, 380);
  for (let i = 0; i < 3; i++) {
    view.render(fresh, 0.05, themes.dark, false);
    assert.equal(art.circles.length, 2);
    assert.equal(art.circles[0].color, themes.dark.field.edge);
    assert.equal(art.circles[1].color, themes.dark.field.pulse);
    assert.deepEqual(art.position, fresh.position);
  }
  view.render(fresh, 0.05, themes.light, true);
  assert.equal(art.circles.length, 1);
  assert.equal(art.circles[0].color, themes.light.field.edge);
});

test('floor references reuse the same world geometry and only shrink with camera zoom', () => {
  const art = new GraphicsRecorder();
  const graphics = art as unknown as Phaser.GameObjects.Graphics;
  drawArena(graphics, themes.light);
  const geometry = [...art.paths];
  const points = geometry.slice(0, 12);
  const left = Math.min(...points.map(({ x }) => x));
  const right = Math.max(...points.map(({ x }) => x));
  assert.equal(right - left, arenaArt.referenceSize);
  const y = points[0].y;
  const camera = new ArenaCamera({ x: left, y });
  camera.resize(1280, 720);
  const initial = camera.toScreen({ x: right, y }).x - camera.toScreen({ x: left, y }).x;
  camera.follow({ x: left, y }, 10, 400);
  drawArena(graphics, themes.dark);
  assert.deepEqual(art.paths, geometry);
  const grown = camera.toScreen({ x: right, y }).x - camera.toScreen({ x: left, y }).x;
  assert.ok(grown < initial);
  assert.ok(Math.abs(grown / camera.zoom - arenaArt.referenceSize) < 1e-7);
});
