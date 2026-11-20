import Phaser from 'phaser';
import { ArenaModel } from './arena-model';
import { drawArena, drawMagnet } from './art';
import { bindInput } from './browser-input';
import { BotView } from './bot-view';
import { touch, viewConfig } from './config';
import { GrowthFeedbackView } from './growth-feedback';
import type { Point } from './movement';
import { ParticleView } from './particle-view';
import type { WorldBounds } from './particles';
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
  private model = new ArenaModel(Math.floor(Math.random() * 0x100000000));
  private heading = new Heading();
  private magnetScale = new MagnetScale();
  private framing = new ArenaCamera(this.model.player.position);
  private particleView!: ParticleView;
  private botViews!: BotView[];
  private readonly botNames: WorldBounds[] = [];
  private field!: GrowthFeedbackView;
  private magnet!: Phaser.GameObjects.Graphics;
  private controls!: ReturnType<typeof bindInput>;
  private pixelRatio = 1;
  private width = 0;
  private height = 0;

  create(): void {
    const arenaArt = this.add.graphics();
    drawArena(arenaArt, theme.palette);
    const player = this.model.player;
    this.field = new GrowthFeedbackView(this, player);
    this.particleView = new ParticleView(this);
    this.botViews = this.model.bots.map((bot) => new BotView(this, bot));
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
    mass.textContent = String(player.mass);
    const bounds = this.framing.bounds;
    this.field.render(player, 0, theme.palette, reducedMotion.matches);
    this.particleView.render(this.model.particles.slots, bounds, [], 0, theme.palette);
    this.renderBots(0, bounds);
  }

  update(_time: number, delta: number): void {
    this.resize();
    const seconds = delta / 1000;
    const player = this.model.player;
    const previousMass = player.mass;
    const result = this.model.step(this.controls.input.steering((point) => this.screenToWorld(point)), seconds);
    if (!result) return;
    this.heading.update(player.heading, seconds);
    this.magnetScale.update(player.physicalScale, seconds);
    this.framing.follow(player.position, seconds, player.mass);
    const bounds = this.framing.bounds;
    this.model.replenish(bounds);
    this.field.render(player, seconds, theme.palette, reducedMotion.matches);
    this.particleView.render(this.model.particles.slots, bounds, result.collections, seconds, theme.palette);
    this.renderBots(seconds, bounds);
    if (player.mass !== previousMass) mass.textContent = String(player.mass);
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
    const { x, y } = this.model.player.position;
    this.magnet.setPosition(x, y);
    this.magnet.setRotation(this.heading.angle);
    this.magnet.setScale(this.magnetScale.scale);
  }

  private renderBots(seconds: number, bounds: WorldBounds): void {
    this.botNames.length = 0;
    for (const view of this.botViews) {
      view.render(seconds, this.framing.zoom, bounds, theme.palette, this.model.participants, this.botNames);
    }
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
