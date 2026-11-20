import Phaser from 'phaser';
import { drawArena, drawMagnet } from './art';
import { advanceAttraction } from './attraction';
import { bindInput } from './browser-input';
import { touch, viewConfig } from './config';
import { GrowthFeedbackView } from './growth-feedback';
import { advance, createPlayer, type Point } from './movement';
import { ParticleView } from './particle-view';
import { ParticlePool } from './particles';
import { cssColor } from './theme';
import { applyThemeToPage, bindThemeToggle, localThemePreference } from './theme-control';
import { ArenaCamera, Heading, MagnetScale } from './view';
import './style.css';

const surface = document.querySelector<HTMLElement>('#arena')!;
const stick = document.querySelector<HTMLElement>('#joystick')!;
const knob = stick.firstElementChild as HTMLElement;
const mass = document.querySelector<HTMLElement>('#mass')!;
const themeButton = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
const theme = localThemePreference();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
applyThemeToPage(themeButton, theme);
stick.style.setProperty('--joystick-size', touch.radius * 2 + 'px');

class ArenaScene extends Phaser.Scene {
  private player = createPlayer();
  private heading = new Heading();
  private magnetScale = new MagnetScale();
  private framing = new ArenaCamera(this.player.position);
  private particles = new ParticlePool(Math.floor(Math.random() * 0x100000000), this.player);
  private particleView!: ParticleView;
  private field!: GrowthFeedbackView;
  private magnet!: Phaser.GameObjects.Graphics;
  private controls!: ReturnType<typeof bindInput>;
  private pixelRatio = 1;
  private width = 0;
  private height = 0;

  create(): void {
    const arenaArt = this.add.graphics();
    drawArena(arenaArt, theme.palette);
    this.field = new GrowthFeedbackView(this, this.player);
    this.particleView = new ParticleView(this);
    this.magnet = drawMagnet(this);
    const unbindTheme = bindThemeToggle(themeButton, () => {
      theme.toggle();
      applyThemeToPage(themeButton, theme);
      drawArena(arenaArt, theme.palette);
      this.cameras.main.setBackgroundColor(theme.palette.arena.background);
    });
    this.controls = bindInput(surface, (point) => this.screenToWorld(point));
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(surface);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      observer.disconnect();
      this.controls.destroy();
      unbindTheme();
    });
    this.resize();
    this.renderPlayer();
    mass.textContent = String(this.player.mass);
    this.field.render(this.player, 0, theme.palette, reducedMotion.matches);
    this.particleView.render(this.particles.slots, this.framing.bounds, [], 0, theme.palette);
  }

  update(_time: number, delta: number): void {
    this.resize();
    const seconds = delta / 1000;
    advance(this.player, this.controls.input.steering((point) => this.screenToWorld(point)), seconds);
    const collections = advanceAttraction(this.particles, this.player, seconds);
    this.heading.update(this.player.velocity, seconds);
    this.magnetScale.update(this.player.physicalScale, seconds);
    this.framing.follow(this.player.position, seconds, this.player.mass);
    const bounds = this.framing.bounds;
    this.particles.replenish(this.player, bounds);
    this.field.render(this.player, seconds, theme.palette, reducedMotion.matches);
    this.particleView.render(this.particles.slots, bounds, collections, seconds, theme.palette);
    if (collections.length) mass.textContent = String(this.player.mass);
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
    this.positionCamera();
  }

  private positionCamera(): void {
    if (!this.width || !this.height) return;
    const camera = this.cameras.main;
    const zoomX = this.framing.zoom * this.game.canvas.width / this.width;
    const zoomY = this.framing.zoom * this.game.canvas.height / this.height;
    if (camera.zoomX !== zoomX || camera.zoomY !== zoomY) camera.setZoom(zoomX, zoomY);
    const center = this.framing.midpoint;
    camera.centerOn(center.x, center.y);
  }

  private renderPlayer(): void {
    this.magnet.setPosition(this.player.position.x, this.player.position.y);
    this.magnet.setRotation(this.heading.angle);
    this.magnet.setScale(this.magnetScale.scale);
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
  backgroundColor: cssColor(theme.palette.arena.background),
  scale: { mode: Phaser.Scale.NONE, width: 1, height: 1 },
  input: { mouse: false, touch: false, keyboard: false, gamepad: false },
  scene: ArenaScene,
});
