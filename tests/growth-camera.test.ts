import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena } from '../src/config';
import { SteeringInput } from '../src/gestures';
import { addMass, attractionReach } from '../src/growth';
import { advance, createPlayer, type Point } from '../src/movement';
import { ArenaCamera, massZoomMultiplier } from '../src/view';

const origin = { x: 0, y: 0 };
const center = { x: arena.width / 2, y: arena.height / 2 };
const near = (actual: number, expected: number) => assert.ok(
  Math.abs(actual - expected) < 1e-7, `Expected ${actual} to be near ${expected}`,
);

test('the two-phase mass zoom multiplier is continuous and bounded', () => {
  assert.equal(massZoomMultiplier(20), 1);
  const pivot = 6 ** -0.075;
  near(massZoomMultiplier(120), pivot);
  near(massZoomMultiplier(240), pivot * 2 ** -0.17);
  near(massZoomMultiplier(120 - 1e-6), massZoomMultiplier(120 + 1e-6));
  assert.equal(massZoomMultiplier(1), 1);
  assert.equal(massZoomMultiplier(1e6), 0.58);
});

for (const [width, height, baseline] of [[1280, 800, 1.1], [390, 844, 0.65], [844, 390, 0.65]]) {
  test(`growth preserves the viewport baseline and inverse projection at ${width}×${height}`, () => {
    const camera = new ArenaCamera(center);
    camera.resize(width, height);
    near(camera.zoom, baseline);
    const targetZoom = baseline * massZoomMultiplier(120);
    const cursor = { x: width * 0.78, y: height * 0.21 };
    const player = { x: center.x + 140, y: center.y - 80 };
    camera.follow(player, 1 / 60, 120);
    assert.ok(camera.zoom < baseline && camera.zoom > targetZoom);
    const target = camera.toWorld(cursor);
    near(camera.toScreen(target).x, cursor.x);
    near(camera.toScreen(target).y, cursor.y);
    near(camera.toWorld(camera.toScreen(player)).x, player.x);
    near(camera.toWorld(camera.toScreen(player)).y, player.y);
    camera.follow(player, 10);
    near(camera.zoom, targetZoom);
    near(camera.midpoint.x, player.x);
    near(camera.midpoint.y, player.y);
    assert.ok(1.46 * camera.zoom > baseline);
  });
}

for (const [width, height, baseline] of [[1280, 800, 1.1], [320, 680, 0.65], [844, 390, 0.65]]) {
  test(`apparent size grows while the field stays framed at ${width}×${height}`, () => {
    const player = createPlayer();
    const camera = new ArenaCamera(player.position);
    camera.resize(width, height);
    let previousRadius = 0;
    const shortSide = Math.min(width, height);
    for (const mass of [20, 100, 400, 800, 2000, 4000, 4352]) {
      addMass(player, mass - player.mass);
      const fieldDiameter = 2 * attractionReach(player.physicalScale);
      const targetZoom = Math.min(baseline * massZoomMultiplier(mass), 0.7 * shortSide / fieldDiameter);
      const previousZoom = camera.zoom;
      camera.follow(player.position, 1 / 60, player.mass);
      assert.ok(camera.zoom >= targetZoom - 1e-7 && camera.zoom <= previousZoom + 1e-7);
      if (previousZoom > targetZoom + 1e-7) assert.ok(camera.zoom > targetZoom && camera.zoom < previousZoom);
      camera.follow(player.position, 10);
      near(camera.zoom, targetZoom);
      const screenRadius = player.radius * camera.zoom;
      assert.ok(screenRadius > previousRadius);
      previousRadius = screenRadius;
      const tap = { x: width * 0.18, y: height * 0.74 };
      const roundTrip = camera.toScreen(camera.toWorld(tap));
      near(roundTrip.x, tap.x);
      near(roundTrip.y, tap.y);
    }
    near(2 * attractionReach(player.physicalScale) * camera.zoom / shortSide, 0.7);
    assert.ok(previousRadius > 3 * 30 * baseline && 2 * previousRadius < 0.5 * shortSide);
  });
}

test('a giant stays entirely in the camera at each corner in portrait and landscape', () => {
  const player = createPlayer();
  addMass(player, 4332);
  const camera = new ArenaCamera(player.position);
  for (const [width, height] of [[390, 844], [844, 390]]) {
    camera.resize(width, height);
    for (const x of [0, arena.width]) {
      for (const y of [0, arena.height]) {
        advance(player, { kind: 'target', point: { x, y } }, 50);
        camera.follow(player.position, 10, player.mass);
        const { left, right, top, bottom } = camera.bounds;
        const radius = player.radius;
        assert.ok(left >= -1e-7 && right <= arena.width + 1e-7);
        assert.ok(top >= -1e-7 && bottom <= arena.height + 1e-7);
        assert.ok(player.position.x - radius >= left - 1e-7 && player.position.x + radius <= right + 1e-7);
        assert.ok(player.position.y - radius >= top - 1e-7 && player.position.y + radius <= bottom + 1e-7);
      }
    }
  }
});

test('zoom-out and orientation changes keep world coverage and corner framing legal', () => {
  const camera = new ArenaCamera(center);
  camera.resize(12000, 680);
  const bottomRight = { x: arena.width, y: arena.height };
  for (let step = 0; step < 120; step++) {
    camera.follow(bottomRight, 1 / 60, 1e6);
    const bounds = camera.bounds;
    assert.ok(bounds.left >= -1e-7 && bounds.top >= -1e-7);
    assert.ok(bounds.right <= arena.width + 1e-7 && bounds.bottom <= arena.height + 1e-7);
  }
  camera.follow(bottomRight, 10);
  near(camera.zoom, 12000 / arena.width);
  near(camera.bounds.right, arena.width);
  near(camera.bounds.bottom, arena.height);
  camera.resize(680, 7500);
  camera.follow(origin, 1);
  near(camera.zoom, 7500 / arena.height);
  near(camera.bounds.top, 0);
  near(camera.bounds.bottom, arena.height);
  near(camera.bounds.left, 0);
});

test('mouse steering reprojects during zoom while a released tap keeps its world destination', () => {
  const camera = new ArenaCamera(center);
  const player = createPlayer();
  const input = new SteeringInput();
  const project = (point: Point) => camera.toWorld(point);
  const cursor = { x: 330, y: 460 };
  camera.resize(390, 844);

  input.mouseMove(cursor);
  const mouseTarget = input.steering(project);
  input.press(1, cursor, 0);
  input.release(1, cursor, 100, project);
  const tap = input.steering(project);
  assert.deepEqual(mouseTarget, tap);
  assert.equal(tap.kind, 'target');
  camera.follow({ x: center.x + 70, y: center.y + 20 }, 0.5, 120);
  assert.deepEqual(input.steering(project), tap);
  advance(player, input.steering(project), 10);
  assert.deepEqual(player.position, tap.point);

  input.mouseMove(cursor);
  assert.deepEqual(input.steering(project), { kind: 'target', point: camera.toWorld(cursor) });
  assert.notDeepEqual(input.steering(project), mouseTarget);
});

test('joystick strength stays in CSS pixels during zoom and canceled gestures leave no target', () => {
  const camera = new ArenaCamera(center);
  camera.resize(390, 844);
  const input = new SteeringInput();
  const project = (point: Point) => camera.toWorld(point);
  const start = { x: 110, y: 520 };
  input.press(1, start, 0);
  input.move(1, { x: start.x + 37, y: start.y });
  assert.deepEqual(input.steering(project), { kind: 'joystick', point: { x: 0.5, y: 0 } });
  camera.follow(center, 0.5, 600);
  assert.deepEqual(input.steering(project), { kind: 'joystick', point: { x: 0.5, y: 0 } });
  input.cancel(1);
  input.release(1, start, 300, project);
  assert.deepEqual(input.steering(project), { kind: 'idle' });

  input.press(2, start, 400);
  input.release(2, start, 450, project);
  assert.equal(input.steering(project).kind, 'target');
  camera.resize(844, 390);
  input.clear();
  assert.deepEqual(input.steering(project), { kind: 'idle' });
});
