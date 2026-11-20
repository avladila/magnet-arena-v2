import { SteeringInput } from './gestures';
import type { Point } from './movement';

export function bindInput(surface: HTMLElement, toWorld: (point: Point) => Point) {
  const input = new SteeringInput();
  const subscriptions = new AbortController();
  const options = { signal: subscriptions.signal };
  let owner: number | undefined;
  const point = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });

  function reset() {
    const captured = owner;
    owner = undefined;
    input.clear();
    if (captured !== undefined && surface.hasPointerCapture(captured)) {
      surface.releasePointerCapture(captured);
    }
  }

  surface.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') {
      input.mouseMove(point(event));
      return;
    }
    if (!input.press(event.pointerId, point(event), event.timeStamp)) return;
    owner = event.pointerId;
    surface.setPointerCapture(event.pointerId);
  }, options);
  surface.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') input.mouseMove(point(event));
    else input.move(event.pointerId, point(event));
  }, options);
  surface.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') input.mouseLeave();
  }, options);
  surface.addEventListener('pointerup', (event) => {
    if (owner !== event.pointerId) return;
    owner = undefined;
    input.release(event.pointerId, point(event), event.timeStamp, toWorld);
  }, options);
  const cancel = (event: PointerEvent) => {
    if (owner !== event.pointerId) return;
    owner = undefined;
    input.cancel(event.pointerId);
  };
  surface.addEventListener('pointercancel', cancel, options);
  surface.addEventListener('lostpointercapture', cancel, options);
  window.addEventListener('blur', reset, options);
  window.addEventListener('resize', reset, options);
  window.screen.orientation?.addEventListener('change', reset, options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
  }, options);

  return { input, reset, destroy: () => { reset(); subscriptions.abort(); } };
}
