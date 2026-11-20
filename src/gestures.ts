import { touch } from './config';
import type { Point, Steering } from './movement';

type Gesture = { id: number; anchor: Point; current: Point; startedAt: number; dragging: boolean };

export class SteeringInput {
  private mouse?: Point;
  private destination?: Point;
  private gesture?: Gesture;

  mouseMove(point: Point): void {
    if (this.gesture) return;
    this.destination = undefined;
    this.mouse = point;
  }

  mouseLeave(): void {
    this.mouse = undefined;
  }

  press(id: number, point: Point, time: number): boolean {
    if (this.gesture) return false;
    this.clear();
    this.gesture = { id, anchor: point, current: point, startedAt: time, dragging: false };
    return true;
  }

  move(id: number, point: Point): void {
    const gesture = this.gesture;
    if (!gesture || gesture.id !== id) return;
    gesture.current = point;
    const distance = Math.hypot(point.x - gesture.anchor.x, point.y - gesture.anchor.y);
    gesture.dragging ||= distance > touch.dragThreshold;
  }

  release(id: number, point: Point, time: number, toWorld: (point: Point) => Point): void {
    if (this.gesture?.id !== id) return;
    this.move(id, point);
    if (!this.gesture.dragging && time - this.gesture.startedAt <= touch.tapMaxMs) {
      this.destination = toWorld(point);
    }
    this.gesture = undefined;
  }

  cancel(id: number): void {
    if (this.gesture?.id === id) this.clear();
  }

  clear(): void {
    this.gesture = undefined;
    this.destination = undefined;
    this.mouse = undefined;
  }

  get joystick(): { anchor: Point; offset: Point } | undefined {
    const gesture = this.gesture;
    if (!gesture?.dragging) return;
    const x = gesture.current.x - gesture.anchor.x;
    const y = gesture.current.y - gesture.anchor.y;
    const distance = Math.hypot(x, y);
    const scale = distance > touch.radius ? touch.radius / distance : 1;
    return { anchor: gesture.anchor, offset: { x: x * scale, y: y * scale } };
  }

  steering(toWorld: (point: Point) => Point): Steering {
    const stick = this.joystick;
    if (stick) {
      const { x, y } = stick.offset;
      const distance = Math.hypot(x, y);
      if (distance <= touch.deadZone) return { kind: 'idle' };
      const strength = (distance - touch.deadZone) / (touch.radius - touch.deadZone);
      return { kind: 'joystick', point: { x: x / distance * strength, y: y / distance * strength } };
    }
    if (this.destination) return { kind: 'target', point: this.destination };
    if (this.mouse) return { kind: 'target', point: toWorld(this.mouse) };
    return { kind: 'idle' };
  }
}
