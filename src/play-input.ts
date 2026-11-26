import { angleBetween, arm, bearingTo, cancelArm, gapBetween, release, shell } from './combat';
import { theftConfig } from './competition-config';
import type { Participant, Point, Steering } from './movement';

const directions = new Map([
  ['KeyW', [0, -1]], ['ArrowUp', [0, -1]], ['KeyS', [0, 1]], ['ArrowDown', [0, 1]],
  ['KeyA', [-1, 0]], ['ArrowLeft', [-1, 0]], ['KeyD', [1, 0]], ['ArrowRight', [1, 0]],
]);

export function bindPlayInput(
  surface: HTMLElement, button: HTMLButtonElement,
  participants: () => readonly Participant[], enabled: () => boolean,
  world: (point: Point) => Point, clearMouseSteering: () => void, fired: () => void, armed = () => {},
) {
  const subscriptions = new AbortController();
  const options = { signal: subscriptions.signal };
  const keys = new Set<string>();
  let mouse: Point | undefined;
  let lastAim: number | undefined;
  let owner: number | 'space' | undefined;
  let anchor: Point | undefined;
  let drag: Point | undefined;
  let tracked: Participant | undefined;
  const player = () => participants()[0];

  function reset() {
    keys.clear();
    mouse = undefined;
    lastAim = undefined;
    cancelArm(player());
    const captured = owner;
    owner = undefined;
    if (typeof captured === 'number' && button.hasPointerCapture(captured)) button.releasePointerCapture(captured);
    anchor = drag = tracked = undefined;
  }

  function aim(): number {
    const self = player();
    if (owner === 'space' && mouse) {
      const target = world(mouse);
      if (Math.hypot(target.x - self.position.x, target.y - self.position.y) > 8) {
        lastAim = bearingTo(self.position, target);
      }
    }
    if (typeof owner !== 'number') return lastAim ?? self.heading;
    if (drag && Math.hypot(drag.x, drag.y) >= 18) {
      tracked = undefined;
      return Math.atan2(drag.y, drag.x);
    }
    let best: Participant | undefined;
    let score = 0;
    for (const candidate of participants()) {
      if (candidate === self || gapBetween(self, candidate) > theftConfig.reach ||
          angleBetween(self.heading, bearingTo(self.position, candidate.position)) > Math.PI / 2) continue;
      const utility = (1 + shell(candidate)) * (candidate === tracked ? 1.2 : 1) / (1 + gapBetween(self, candidate));
      if (utility > score) {
        score = utility;
        best = candidate;
      }
    }
    tracked = best;
    return best ? bearingTo(self.position, best.position) : self.heading;
  }

  function finish() {
    if (enabled() && release(player(), aim())) fired();
    const captured = owner;
    owner = undefined;
    anchor = drag = tracked = undefined;
    if (typeof captured === 'number' && button.hasPointerCapture(captured)) button.releasePointerCapture(captured);
  }

  window.addEventListener('keydown', (event) => {
    if (!enabled() || (event.target instanceof HTMLElement && event.target.closest('button, select, input, textarea, [contenteditable]'))) return;
    if (directions.has(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
    if (event.code !== 'Space') return;
    event.preventDefault();
    if (!event.repeat && owner === undefined && arm(player())) { owner = 'space'; armed(); }
  }, options);
  window.addEventListener('keyup', (event) => {
    if (keys.delete(event.code) && keys.size === 0) clearMouseSteering();
    if (event.code !== 'Space' || owner !== 'space') return;
    event.preventDefault();
    finish();
  }, options);
  surface.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') mouse = { x: event.clientX, y: event.clientY };
  }, options);
  surface.addEventListener('pointerleave', () => { mouse = undefined; }, options);

  for (const name of ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'lostpointercapture'] as const) {
    button.addEventListener(name, (event) => {
      event.stopPropagation();
      if (name === 'pointerdown') {
        event.preventDefault();
        if (enabled() && owner === undefined && arm(player())) {
          owner = event.pointerId;
          armed();
          anchor = { x: event.clientX, y: event.clientY };
          button.setPointerCapture(event.pointerId);
        }
        return;
      }
      if (owner !== event.pointerId || !anchor) return;
      drag = { x: event.clientX - anchor.x, y: event.clientY - anchor.y };
      if (name === 'pointerup') finish();
      if (name === 'pointercancel' || name === 'lostpointercapture') reset();
    }, options);
  }
  window.addEventListener('blur', reset, options);
  window.screen.orientation?.addEventListener('change', reset, options);
  return {
    reset, aim, tracked: () => tracked,
    steering(fallback: Steering): Steering {
      let x = 0;
      let y = 0;
      for (const code of keys) {
        const [dx, dy] = directions.get(code)!;
        x += dx;
        y += dy;
      }
      const length = Math.hypot(x, y);
      return keys.size === 0 ? fallback : length > 0
        ? { kind: 'joystick', point: { x: x / length, y: y / length } } : { kind: 'idle' };
    },
    destroy() { reset(); subscriptions.abort(); },
  };
}
