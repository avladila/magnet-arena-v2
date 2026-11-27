import assert from 'node:assert/strict';
import { test } from 'node:test';
import anchors from '../brand/face-anchors.json';
import { EyeTracking, pupilInEye, type EyeAperture } from '../src/eye-tracking';

const directions = Array.from({ length: 32 }, (_, index) => {
  const angle = index * Math.PI / 16;
  return { x: Math.cos(angle), y: Math.sin(angle) };
});

test('the full pupil fits inside all authored eye apertures in every direction', () => {
  const rotations = directions.filter((_, index) => index % 2 === 0);
  for (const data of Object.values(anchors.eyes)) {
    const sockets = data as unknown as readonly [EyeAperture, EyeAperture];
    for (const direction of directions) {
      const offsets = sockets.map((eye) => {
        const [x, y, rx, ry] = eye;
        const pupil = pupilInEye(eye, direction);
        const dx = pupil.x - x;
        const dy = pupil.y - y;
        for (const edge of rotations) {
          const u = (dx + (pupil.pupilX + .43) * edge.x) / rx;
          const v = (dy + (pupil.pupilY + .43) * edge.y) / ry;
          assert.ok(u * u + v * v <= 1 + 1e-10);
        }
        return { dx, dy };
      });
      assert.ok(Math.abs(offsets[0].dx * offsets[1].dy - offsets[0].dy * offsets[1].dx) < 1e-10);
    }
  }
});

test('pupils track independently of heading and velocity, with a smooth world-space transition', () => {
  const gaze = new EyeTracking();
  const origin = { x: 0, y: 0 };
  const movingLeft = { x: -460, y: 0 };
  assert.equal(gaze.update(origin, movingLeft, 0, undefined, .016).x, -.7);
  const aimed = gaze.update(origin, movingLeft, 0, { x: 250, y: 0 }, .015);
  assert.ok(aimed.x > -.7 && aimed.x < .3);
  const turned = gaze.update(origin, movingLeft, Math.PI / 2, { x: 250, y: 0 }, .19, .93, 1.1);
  assert.ok(Math.abs(turned.x) < 1e-10 && turned.y < -.85);
  const sx = 1.1, sy = .8, heading = -Math.PI / 3;
  const stretched = gaze.update(origin, movingLeft, heading, { x: 250, y: 100 }, .5, sx, sy);
  const wx = stretched.x * sx * Math.cos(heading) - stretched.y * sy * Math.sin(heading);
  const wy = stretched.x * sx * Math.sin(heading) + stretched.y * sy * Math.cos(heading);
  assert.ok(Math.abs(wy / wx - .4) < .001);
  gaze.reset();
  assert.deepEqual(gaze.update(origin, { x: 0, y: 0 }, 0, undefined, 0), { x: .28, y: 0 });
});
