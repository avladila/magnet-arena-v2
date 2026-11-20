import Phaser from 'phaser';
import { drawArena, drawMagnet } from './art';
import { bindInput } from './browser-input';
import { touch, viewConfig } from './config';
import { advance, createPlayer, type Point } from './movement';
import { ArenaCamera, Heading } from './view';
import './style.css';

const surface = document.querySelector<HTMLElement>('#arena')!;
const stick = document.querySelector<HTMLElement>('#joystick')!;
const knob = stick.firstElementChild as HTMLElement;
stick.style.setProperty('--joystick-size', touch.radius * 2 + 'px');

class ArenaScene extends Phaser.Scene {
  private player = createPlayer();
  private heading = new Heading();
  private framing = new ArenaCamera(this.player.position);
  private magnet!: Phaser.GameObjects.Graphics;
  private controls!: ReturnType<typeof bindInput>;
  private pixelRatio = 1;
  private width = 0;
  private height = 0;

  create(): void {
    drawArena(this);
    this.magnet = drawMagnet(this);
    this.controls = bindInput(surface, (point) => this.screenToWorld(point));
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(surface);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      observer.disconnect();
      this.controls.destroy();
    });
    this.resize();
    this.renderPlayer();
  }

  update(_time: number, delta: number): void {
    this.resize();
    const seconds = delta / 1000;
    advance(this.player, this.controls.input.steering((point) => this.screenToWorld(point)), seconds);
    this.heading.update(this.player.velocity, seconds);
    this.framing.follow(this.player.position, seconds);
    this.renderPlayer();
    this.positionCamera();
    this.renderJoystick();
  }

  private screenToWorld(point: Point): Point {
    const rect = surface.getBoundingClientRect();
    return this.framing.toWorld({ x: point.x - rect.left, y: point.y - rect.top });
  }

  private resize(): void {
    const width = surface.clientWidth;
    const height = surface.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, viewConfig.maxPixelRatio);
    if (!width || !height) return;
    if (width === this.width && height === this.height && ratio === this.pixelRatio) return;
    this.controls.reset();
    this.width = width;
    this.height = height;
    this.pixelRatio = ratio;
    const backingWidth = Math.round(width * ratio);
    const backingHeight = Math.round(height * ratio);
    this.scale.resize(backingWidth, backingHeight);
    this.game.canvas.style.width = width + 'px';
    this.game.canvas.style.height = height + 'px';
    this.framing.resize(width, height);
    this.cameras.main.setZoom(
      this.framing.zoom * backingWidth / width,
      this.framing.zoom * backingHeight / height,
    );
    this.positionCamera();
  }

  private positionCamera(): void {
    const center = this.framing.midpoint;
    this.cameras.main.centerOn(center.x, center.y);
  }

  private renderPlayer(): void {
    this.magnet.setPosition(this.player.position.x, this.player.position.y);
    this.magnet.setRotation(this.heading.angle);
  }

  private renderJoystick(): void {
    const joystick = this.controls.input.joystick;
    stick.hidden = !joystick;
    if (!joystick) return;
    const rect = surface.getBoundingClientRect();
    stick.style.left = joystick.anchor.x - rect.left + 'px';
    stick.style.top = joystick.anchor.y - rect.top + 'px';
    knob.style.transform = 'translate(' + joystick.offset.x + 'px, ' + joystick.offset.y + 'px)';
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: surface,
  backgroundColor: '#def5ee',
  scale: { mode: Phaser.Scale.NONE, width: 1, height: 1 },
  input: { mouse: false, touch: false, keyboard: false, gamepad: false },
  scene: ArenaScene,
});
