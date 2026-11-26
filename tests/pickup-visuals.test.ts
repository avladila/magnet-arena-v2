import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Phaser from 'phaser';
import { brand } from '../src/brand';
import { ParticleView, pickupFrameSize } from '../src/particle-view';
import type { ResourceKind, Scrap } from '../src/particles';
import { themes } from '../src/theme';
import type { WorkshopParticles } from '../src/workshop-particles';

function atlasScene() {
  const images: FakeImage[] = [];
  class FakeImage {
    frame: { name: string };
    x = 0;
    y = 0;
    rotation = 0;
    alpha = 1;
    displayWidth = 96;
    visible = false;

    constructor(name: string) { this.frame = { name }; }
    setFrame(name: string) { this.frame.name = name; return this; }
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    setRotation(rotation: number) { this.rotation = rotation; return this; }
    setDisplaySize(width: number) { this.displayWidth = width; return this; }
    setAlpha(alpha: number) { this.alpha = alpha; return this; }
    setVisible(visible: boolean) { this.visible = visible; return this; }
    setDepth() { return this; }
  }
  const scene = { add: { image: (_x: number, _y: number, _atlas: string, name: string) => {
    const image = new FakeImage(name);
    images.push(image);
    return image;
  } } } as unknown as Phaser.Scene;
  return { scene, images };
}

const bounds = { left: 0, right: 1000, top: 0, bottom: 600 };
const scrap: Scrap = { id: 0, x: 200, y: 300, radius: 5, generation: 1, state: 'active', colorIndex: 0, resourceId: 3714 };

test('screen sizing accounts for the opaque core at normal and giant mobile zoom', () => {
  for (const zoom of [0.202, 0.218, 0.39, 0.65, 1, 1.1]) {
    for (const kind of ['ordinary', 'gold', 'energy'] as const) {
      const sizing = brand.pickups.sizes[kind];
      const frame = pickupFrameSize(kind, zoom);
      assert.ok(frame * zoom * sizing.coreFraction >= sizing.minCoreCss - 1e-8, kind + ' core');
      assert.ok(frame * zoom <= sizing.maxFrameCss + 1e-8, kind + ' glow');
      assert.ok(frame * sizing.coreFraction <= sizing.maxCoreWorld + 1e-8);
    }
  }
});

test('Balanced trails follow world displacement and reject camera shifts, unloaded slots and recycled generations', () => {
  const { scene } = atlasScene();
  const view = new ParticleView(scene, true);
  const calls: unknown[][] = [];
  const effects = { trail: (...args: unknown[]) => calls.push(args), glint() {} } as unknown as WorkshopParticles;
  const slot = { ...scrap };
  const display = { mode: 'dark', zoom: 1, quality: 'balanced', reducedMotion: false, effects } as const;
  function render(seconds: number, camera = bounds, zoom = 1) {
    view.render([slot], camera, [], seconds, themes.dark, () => 'ordinary', { ...display, zoom });
  }

  render(1 / 60);
  render(1 / 60, { ...bounds, left: 5, right: 995 }, 0.42);
  assert.equal(calls.length, 0, 'camera movement is not scrap movement');
  slot.x += 4;
  render(1 / 60);
  assert.deepEqual(calls, [[slot.x, slot.y, 0, slot.colorIndex]]);
  render(1 / 60, { ...bounds, left: 900, right: 1700 });
  slot.x += 4;
  render(1 / 60);
  assert.equal(calls.length, 1, 're-entry has no previous visible sample');
  slot.generation++;
  slot.x += 3;
  render(1 / 60);
  assert.equal(calls.length, 1, 'the first sample of a recycled slot has no trail');
  slot.x += 75;
  render(1 / 60);
  assert.equal(calls.length, 1, 'a teleport exceeds physical pull speed');
  slot.x += 3;
  render(1 / 60);
  assert.equal(calls.length, 2);
  view.reset();
  slot.x += 3;
  render(1 / 60);
  assert.equal(calls.length, 2, 'a fresh session has no movement history');
});

test('energy keeps its brighter static orbit in Low and reduced motion, and animates when permitted', () => {
  const { scene, images } = atlasScene();
  const view = new ParticleView(scene, true);
  const effects = { trail() {}, glint() {} } as unknown as WorkshopParticles;
  const slot = { ...scrap, x: -22 };
  const render = (quality: 'low' | 'balanced', reducedMotion: boolean, seconds: number) => {
    view.render([slot], bounds, [], seconds, themes.light, (): ResourceKind => 'energy',
      { mode: 'light', zoom: 0.22, quality, reducedMotion, effects });
  };
  render('low', true, 0);
  const core = images.find((image) => image.frame.name === 'energy' && image.visible)!;
  const orbit = images.find((image) => image.frame.name === 'energy-orbit' && image.visible)!;
  assert.equal(core.x, slot.x, 'the screen-size glow enters view before the physical radius');
  assert.equal(orbit.rotation, 0);
  assert.equal(orbit.x, slot.x);
  assert.equal(core.displayWidth, orbit.displayWidth);
  assert.ok(orbit.alpha >= 0.9);
  render('balanced', false, 1 / 60);
  const angle = orbit.rotation;
  render('balanced', false, 0.1);
  assert.ok(orbit.rotation > angle);
  assert.equal(core.rotation, 0, 'the lightning mark does not rotate');
  assert.equal(core.x, slot.x);
  render('balanced', true, 0.1);
  assert.equal(orbit.rotation, 0);
  assert.ok(orbit.visible && core.visible);
});
