import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena, playerConfig } from '../src/config';
import { SteeringInput } from '../src/gestures';
import { advance, createPlayer, type Point } from '../src/movement';
import { ArenaCamera, Heading, shortestAngle } from '../src/view';

const origin = { x: 0, y: 0 };
const identity = (point: Point) => point;
const near = (actual: number, expected: number) => assert.ok(
  Math.abs(actual - expected) < 1e-7, `Expected ${actual} to be near ${expected}`,
);

test('target movement is speed limited, independent of time slicing, and stops at the target', () => {
  const player = createPlayer();
  const sliced = createPlayer();
  const point = { x: player.position.x + 300, y: player.position.y + 400 };
  const steering = { kind: 'target', point } as const;
  advance(player, steering, 0.5);
  for (let i = 0; i < 50; i++) advance(sliced, steering, 0.01);
  near(player.velocity.x, playerConfig.speed * 0.6);
  near(player.velocity.y, playerConfig.speed * 0.8);
  near(player.position.x, sliced.position.x);
  near(player.position.y, sliced.position.y);
  advance(player, steering, 10);
  assert.deepEqual(player.position, point);
  advance(player, steering, 0.1);
  assert.deepEqual(player.velocity, origin);
});

test('joystick travel respects the physical radius and reports actual motion along a wall', () => {
  const player = createPlayer();
  assert.equal(player.mass, 20);
  assert.equal(player.radius, 30);
  player.position = { x: arena.width - player.radius, y: 100 };
  advance(player, { kind: 'joystick', point: { x: 0.5, y: -0.5 } }, 0.1);
  assert.equal(player.position.x, arena.width - 30);
  assert.equal(player.velocity.x, 0);
  near(player.velocity.y, -playerConfig.speed / 2);
  advance(player, { kind: 'target', point: { x: -1000, y: 9000 } }, 20);
  assert.deepEqual(player.position, { x: 30, y: arena.height - 30 });
});

test('a tap converts its release position once and mouse steering reprojects as the camera moves', () => {
  const input = new SteeringInput();
  let x = 100;
  const toWorld = (point: Point) => ({ x: point.x + x, y: point.y });
  input.press(1, origin);
  assert.deepEqual(input.steering(toWorld), { kind: 'idle' });
  input.release(1, { x: 10, y: 0 }, toWorld);
  x = 200;
  assert.deepEqual(input.steering(toWorld), { kind: 'target', point: { x: 110, y: 0 } });
  input.mouseMove({ x: 10, y: 0 });
  assert.deepEqual(input.steering(toWorld), { kind: 'target', point: { x: 210, y: 0 } });
  x = 300;
  assert.deepEqual(input.steering(toWorld), { kind: 'target', point: { x: 310, y: 0 } });
  input.mouseLeave();
  assert.deepEqual(input.steering(toWorld), { kind: 'idle' });
});

test('joystick strength scales outside the dead zone and neutral or release stops movement', () => {
  const input = new SteeringInput();
  input.press(1, origin);
  input.move(1, { x: 10, y: 0 });
  assert.equal(input.joystick, undefined);
  input.move(1, { x: 37, y: 0 });
  assert.deepEqual(input.steering(identity), { kind: 'joystick', point: { x: 0.5, y: 0 } });
  input.move(1, { x: 0, y: -100 });
  assert.deepEqual(input.steering(identity), { kind: 'joystick', point: { x: 0, y: -1 } });
  input.move(1, origin);
  assert.deepEqual(input.steering(identity), { kind: 'idle' });
  input.release(1, origin, identity);
  assert.deepEqual(input.steering(identity), { kind: 'idle' });
});

test('only the first touch can move, release, or cancel its gesture', () => {
  const input = new SteeringInput();
  assert.equal(input.press(1, origin), true);
  assert.equal(input.press(2, origin), false);
  input.move(2, { x: 100, y: 0 });
  input.release(2, origin, identity);
  input.cancel(2);
  assert.equal(input.joystick, undefined);
  input.move(1, { x: 64, y: 0 });
  assert.equal(input.steering(identity).kind, 'joystick');
  input.cancel(1);
  assert.deepEqual(input.steering(identity), { kind: 'idle' });
  input.release(1, origin, identity);
  assert.deepEqual(input.steering(identity), { kind: 'idle' });
  assert.equal(input.press(2, origin), true);
  input.cancel(2);
  assert.equal(input.press(3, origin), true);
});

test('angle wraps across ±π and heading ignores tiny or stationary displacement', () => {
  near(shortestAngle(Math.PI - 0.1, -Math.PI + 0.1), 0.2);
  near(shortestAngle(-Math.PI + 0.1, Math.PI - 0.1), -0.2);
  const heading = new Heading();
  heading.update({ x: 0, y: 100 }, 0.05);
  assert.ok(heading.angle > 0 && heading.angle < Math.PI / 2);
  heading.update({ x: 0, y: -1 }, 10);
  near(heading.angle, Math.PI / 2);
  heading.update(origin, 10);
  near(heading.angle, Math.PI / 2);
});

test('camera smoothly follows, projects CSS coordinates and keeps arena edges in frame', () => {
  const camera = new ArenaCamera({ x: 2400, y: 1600 });
  camera.resize(390, 844);
  const tap = { x: 295, y: 422 };
  const world = camera.toWorld(tap);
  near(world.x, 2400 + 100 / camera.zoom);
  near(world.y, 1600);
  camera.follow(world, 0.1);
  assert.ok(camera.midpoint.x > 2400 && camera.midpoint.x < world.x);
  camera.resize(844, 390);
  camera.follow(origin, 10);
  near(camera.toWorld(origin).x, 0);
  near(camera.toWorld(origin).y, 0);
});
