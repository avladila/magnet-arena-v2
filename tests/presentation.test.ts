import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Phaser from 'phaser';
import { ArenaFloor, drawArena, drawMagnet } from '../src/art';
import { advanceAttraction } from '../src/attraction';
import { BotView } from '../src/bot-view';
import { createBots } from '../src/bots';
import { arena, growthFeedback, scrapConfig } from '../src/config';
import { addMass, attractionReach } from '../src/growth';
import { GrowthFeedback, GrowthFeedbackView } from '../src/growth-feedback';
import { createPlayer, type Point } from '../src/movement';
import { ParticleView } from '../src/particle-view';
import { ParticlePool, type WorldBounds } from '../src/particles';
import { themes } from '../src/theme';
import { bindThemeToggle, ThemePreference } from '../src/theme-control';

class GraphicsRecorder {
  readonly paths: Point[] = [];
  readonly fills: number[] = [];
  readonly rectangles: { x: number; y: number; width: number; height: number }[] = [];
  readonly circles: { x: number; y: number; radius: number; color: number }[] = [];
  clears = 0;
  rectangularStrokes = 0;
  canvasScale = 1;
  furthestFill = 0;
  position: Point = { x: 0, y: 0 };
  private lineColor = 0;

  clear() {
    this.clears++;
    this.paths.length = 0;
    this.fills.length = 0;
    this.rectangles.length = 0;
    this.circles.length = 0;
    return this;
  }

  fillStyle(color: number) { this.fills.push(color); return this; }
  fillRect(x: number, y: number, width: number, height: number) {
    this.rectangles.push({ x, y, width, height });
    return this;
  }
  scaleCanvas(x: number, y: number) {
    assert.equal(x, y);
    this.canvasScale = x;
    return this;
  }
  fillCircle(x: number, y: number, radius: number) {
    this.furthestFill = Math.max(this.furthestFill, (Math.hypot(x, y) + radius) * this.canvasScale);
    return this;
  }
  fillRoundedRect(x: number, y: number, width: number, height: number, radius: number | {
    tl: number; tr: number; bl: number; br: number;
  }) {
    const { tl, tr, bl, br } = typeof radius === 'number' ? { tl: radius, tr: radius, bl: radius, br: radius } : radius;
    this.fillCircle(x + tl, y + tl, tl);
    this.fillCircle(x + width - tr, y + tr, tr);
    this.fillCircle(x + bl, y + height - bl, bl);
    this.fillCircle(x + width - br, y + height - br, br);
    return this;
  }
  lineStyle(_width: number, color: number) { this.lineColor = color; return this; }
  strokeRect() { this.rectangularStrokes++; return this; }
  beginPath() { return this; }
  moveTo(x: number, y: number) { this.paths.push({ x, y }); return this; }
  lineTo(x: number, y: number) { return this.moveTo(x, y); }
  strokePath() { return this; }
  strokeCircle(x: number, y: number, radius: number) {
    this.circles.push({ x, y, radius, color: this.lineColor });
    return this;
  }

  setDepth() { return this; }
  setScale() { return this; }
  setRotation() { return this; }
  setVisible() { return this; }
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
  const pool = new ParticlePool(7, [player], 2);
  Object.assign(pool.slots[0], player.position, { colorIndex: 9 });
  const collections = advanceAttraction(pool, [player], 0).collections;
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
  for (const mass of [200, 4352]) {
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
  assert.equal(feedback.haloRadius, attractionReach(12));

  const pool = new ParticlePool(7, [player], 1);
  Object.assign(pool.slots[0], { x: player.position.x + player.radius + 6, y: player.position.y });
  assert.equal(advanceAttraction(pool, [player], 0).collections.length, 0);
  assert.equal(advanceAttraction(pool, [player], 1).collections.length, 1);
});

test('a growth jump keeps the halo and existing pulse outside the giant body', () => {
  const player = createPlayer();
  const recorder = new GraphicsRecorder();
  const view = new GrowthFeedbackView(sceneWithGraphics(recorder), player);
  addMass(player, 4332);
  view.render(player, 1 / 120, themes.light, false);
  assert.equal(recorder.circles.length, 2);
  assert.ok(recorder.circles.every(({ radius }) => radius >= player.radius + scrapConfig.radius));
  assert.ok(recorder.circles[0].radius < attractionReach(12));
  view.render(player, 0.1, themes.dark, true);
  assert.equal(recorder.circles.length, 1);
  assert.ok(recorder.circles[0].radius > player.radius);
});

test('the player backing and all bot accents fit inside their physical circles', () => {
  for (const accent of [undefined, ...createBots(11).map((bot) => bot.accent)]) {
    const recorder = new GraphicsRecorder();
    drawMagnet(sceneWithGraphics(recorder), accent);
    assert.ok(Math.abs(recorder.furthestFill - 30) < 1e-12);
    if (accent !== undefined) assert.ok(recorder.fills.includes(accent));
  }
});

test('a giant bot label stays at CSS size and chooses room clear of the player and other labels', () => {
  const [bot] = createBots(11);
  const player = createPlayer();
  addMass(bot, 4332);
  addMass(player, 4332);
  bot.position = { x: 2000, y: 2000 };
  player.position = { x: 860, y: 2000 };
  const label = {
    width: 48, height: 14, top: 0, scale: 0, visible: false,
    setOrigin() { return this; }, setDepth() { return this; }, setColor() { return this; }, setStroke() { return this; },
    setPosition(_x: number, y: number) { this.top = y; return this; },
    setScale(scale: number) { this.scale = scale; return this; },
    setVisible(visible: boolean) { this.visible = visible; return this; },
  };
  const sprite = Object.assign(new GraphicsRecorder(), {
    frame: { name: 'bot-1-0' },
    setFrame(name: string) { this.frame.name = name; return this; },
  });
  const scene = { add: { sprite: () => sprite, text: () => label } } as unknown as Phaser.Scene;
  const view = new BotView(scene, bot);
  const bounds = { left: 500, top: 1250, right: 3500, bottom: 2750 };
  const names: WorldBounds[] = [];
  view.render(5, 0.25, bounds, themes.light, [player, bot], names);
  assert.ok(label.visible && label.top + label.height / 0.25 < bot.position.y - bot.radius);
  assert.equal(label.scale * 0.25, 1);
  assert.equal(sprite.frame.name, 'bot-1-5');
  const [above] = names;
  view.render(5, 0.25, bounds, themes.dark, [player, bot], names);
  assert.ok(label.visible && label.top > bot.position.y + bot.radius);
  assert.equal(names.length, 2);
  view.render(5, 0.25, bounds, themes.dark, [player, bot], []);
  assert.ok(label.visible && label.top > bot.position.y + bot.radius, 'the readable label stays on its current side');

  player.position = { x: bot.position.x, y: 2500 };
  const occupied = [above];
  view.render(5, 0.25, bounds, themes.dark, [player, bot], occupied);
  assert.equal(label.visible, false);
  assert.equal(occupied.length, 1);
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

test('painted plates and the perimeter use the same world geometry in both palettes', () => {
  const art = new GraphicsRecorder();
  const graphics = art as unknown as Phaser.GameObjects.Graphics;
  const bounds = { left: 0, top: 0, right: 1200, bottom: 720 };
  drawArena(graphics, themes.light, bounds);
  const geometry = [...art.paths];
  const plates = [...art.rectangles];
  assert.ok(geometry.length > 0 && plates.length < 100);
  drawArena(graphics, themes.dark, bounds);
  assert.deepEqual(art.paths, geometry);
  assert.deepEqual(art.rectangles, plates);
});

test('the buffered floor keeps stable plate locations and paints the true world perimeter', () => {
  const art = new GraphicsRecorder();
  const floor = new ArenaFloor(art as unknown as Phaser.GameObjects.Graphics);
  const bounds = { left: 1000, top: 800, right: 2040, bottom: 1540 };
  floor.render(bounds, themes.light);
  const geometry = [...art.rectangles];
  assert.ok(geometry.length < 200);
  floor.render({ ...bounds, left: 1050, right: 2090 }, themes.light);
  assert.equal(art.clears, 1);
  floor.render({ ...bounds, left: 1450, right: 2490 }, themes.light);
  assert.equal(art.clears, 2);
  const insideOverlap = ({ x, width }: { x: number; width: number }) => x >= 1450 && x + width <= 2240;
  assert.ok(geometry.filter(insideOverlap).length > 0);
  assert.deepEqual(art.rectangles.filter(insideOverlap), geometry.filter(insideOverlap));

  const corner = { left: arena.width - 1040, top: arena.height - 740, right: arena.width, bottom: arena.height };
  floor.render(corner, themes.light);
  const [background, ...details] = art.rectangles;
  assert.equal(background.x + background.width, arena.width);
  assert.equal(background.y + background.height, arena.height);
  assert.ok(details.some(({ x, width }) => width === 24 && x + width === arena.width));
  assert.ok(details.some(({ y, height }) => height === 24 && y + height === arena.height));
  assert.ok(art.paths.some(({ x }) => x === arena.width));
  assert.ok(art.paths.some(({ y }) => y === arena.height));
  floor.render(corner, themes.dark);
  assert.equal(art.clears, 4);
  assert.equal(art.fills[0], themes.dark.arena.background);
});
