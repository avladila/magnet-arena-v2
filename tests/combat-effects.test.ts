import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Phaser from 'phaser';
import { FracturePlates, impactStyle } from '../src/combat-effects';
import type { TheftImpact } from '../src/combat-state';

test('impact artwork tiers follow the actual diameter-loss boundaries', () => {
  assert.equal(impactStyle(0.09999).grade, 'light');
  assert.equal(impactStyle(0.10).grade, 'medium');
  assert.equal(impactStyle(0.25).grade, 'heavy');
  assert.equal(impactStyle(0.40).grade, 'fracture');
  assert.equal(impactStyle(0.4999).plates, 14);
});

test('cosmetic fractures are bounded, leave the outcome intact and clear in reduced motion', () => {
  class Sprite {
    visible = false;
    setFrame() { return this; }
    setDepth() { return this; }
    setVisible(value: boolean) { this.visible = value; return this; }
    setPosition() { return this; }
    setDisplaySize() { return this; }
    setRotation() { return this; }
    setAlpha() { return this; }
  }
  const images: Sprite[] = [];
  const scene = { add: { image: () => {
    const sprite = new Sprite();
    images.push(sprite);
    return sprite;
  } } } as unknown as Phaser.Scene;
  const plates = new FracturePlates(scene);
  const impact: TheftImpact = { origin: { x: 20, y: 20 }, radius: 360, mass: 4352, bearing: 0,
    brittle: false, removed: 3301, reduction: 0.4999 };
  const before = structuredClone(impact);
  for (let index = 0; index < 20; index++) plates.emit(impact, 'high');
  assert.deepEqual(impact, before);
  assert.equal(images.length, 72);
  plates.render({ left: -1000, right: 1000, top: -1000, bottom: 1000 }, 0.1, 0.22, false);
  assert.ok(images.every((image) => image.visible));
  plates.render({ left: -1000, right: 1000, top: -1000, bottom: 1000 }, 0.1, 0.22, true);
  assert.ok(images.every((image) => !image.visible));
});
