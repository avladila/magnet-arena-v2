import { brand, installBrand } from './brand';
import { GameAudio } from './audio';
import { CompetitionView } from './competition-view';
import { matchConfig, theftConfig } from './competition-config';
import { MatchClock, type Difficulty, type Mode } from './match';
import { bindPlayInput } from './play-input';
import { element, SessionUI } from './session-ui';
import Phaser from 'phaser';
import { ArenaModel } from './arena-model';
import { ArenaFloor } from './art';
import { createMagnetSprite, magnetAtlas, PoleCharge, renderMagnet } from './magnet-art';
import { bindInput } from './browser-input';
import { BotView } from './bot-view';
import { touch, viewConfig } from './config';
import { GrowthFeedbackView } from './growth-feedback';
import type { Point } from './movement';
import { ParticleView } from './particle-view';
import type { Collection, Scrap, WorldBounds } from './particles';
import { cssColor } from './theme';
import { applyThemeToPage, bindThemeToggle, localThemePreference } from './theme-control';
import { PickupFeedback } from './pickup-feedback';
import { WorkshopParticles } from './workshop-particles';
import { ArenaCamera, Heading, MagnetScale } from './view';
import './style.css';

const surface = document.querySelector<HTMLElement>('#arena')!;
const stick = document.querySelector<HTMLElement>('#joystick')!;
const knob = stick.firstElementChild as HTMLElement;
const mass = document.querySelector<HTMLElement>('#mass')!;
const themeButton = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
const theme = localThemePreference();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
installBrand(document.documentElement);
applyThemeToPage(themeButton, theme);
stick.style.setProperty('--joystick-size', touch.radius * 2 + 'px');

class ArenaScene extends Phaser.Scene {
  private model = new ArenaModel(1, 'normal');
  private clock = new MatchClock('arena');
  private readonly audio = new GameAudio();
  private menu!: SessionUI;
  private readonly stepSize = matchConfig.step;
  private accumulated = 0;
  private lastPickupSound = 0;
  private playInput!: ReturnType<typeof bindPlayInput>;
  private competition!: CompetitionView;
  private heading = new Heading();
  private magnetScale = new MagnetScale();
  private framing = new ArenaCamera(this.model.player.position);
  private floor!: ArenaFloor;
  private particleView!: ParticleView;
  private effects!: WorkshopParticles;
  private pickupFeedback!: PickupFeedback;
  private lastLanding = 0;
  private botViews!: BotView[];
  private readonly botNames: WorldBounds[] = [];
  private field!: GrowthFeedbackView;
  private magnet!: Phaser.GameObjects.Sprite;
  private poleCharge!: PoleCharge;
  private readonly kindOf = (scrap: Scrap) => this.model.particles.kind(scrap);
  private controls!: ReturnType<typeof bindInput>;
  private pixelRatio = 1;
  private width = 0;
  private height = 0;

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.atlas(magnetAtlas, base + 'magnets.webp', base + 'magnets.json');
    this.load.atlas('workshop', base + 'workshop.webp', base + 'workshop.json');
  }

  create(): void {
    this.floor = new ArenaFloor(this.add.graphics());
    this.competition = new CompetitionView(this);
    const player = this.model.player;
    this.field = new GrowthFeedbackView(this, player, true);
    this.particleView = new ParticleView(this, true);
    this.effects = new WorkshopParticles(this);
    this.pickupFeedback = new PickupFeedback(surface);
    this.botViews = this.model.bots.map((bot) => new BotView(this, bot, true));
    this.magnet = createMagnetSprite(this, player.id).setDepth(2);
    this.poleCharge = new PoleCharge(this);
    const toggleTheme = () => {
      theme.toggle();
      applyThemeToPage(themeButton, theme);
      this.floor.render(this.framing.bounds, theme.palette);
      this.cameras.main.setBackgroundColor(theme.palette.arena.background);
    };
    const unbindTheme = bindThemeToggle(themeButton, toggleTheme);
    this.controls = bindInput(surface, (point) => this.screenToWorld(point));
    this.playInput = bindPlayInput(surface, element('attack'), () => this.model.participants,
      () => this.menu.running && this.clock.countdown <= 0 && !this.clock.ended,
      (point) => this.screenToWorld(point), () => this.controls.input.mouseLeave(),
      () => this.audio.play('pulse'), () => this.audio.play('arm'));
    this.menu = new SessionUI(this.audio, {
      start: (mode, difficulty) => this.start(mode, difficulty),
      resetInput: () => this.resetInput(),
      end: () => this.finish(),
      toggleTheme,
    });
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(surface);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      observer.disconnect();
      this.controls.destroy();
      this.playInput.destroy();
      unbindTheme();
    });
    element('loading').hidden = true;
    this.resize();
    this.renderPlayer();
    mass.textContent = String(player.mass);
    const bounds = this.framing.bounds;
    this.floor.render(bounds, theme.palette);
    this.field.render(player, 0, theme.palette, reducedMotion.matches);
    this.renderPickups(bounds, [], 0, reducedMotion.matches || this.menu.motionReduced);
    this.renderBots(0, bounds);
  }

  private start(mode: Mode, difficulty: Difficulty): void {
    this.resetInput();
    this.model = new ArenaModel(mode === 'tutorial' ? 4815 : crypto.getRandomValues(new Uint32Array(1))[0], difficulty, mode === 'tutorial');
    this.clock = new MatchClock(mode);
    this.accumulated = 0;
    this.heading = new Heading();
    this.magnetScale = new MagnetScale();
    this.framing = new ArenaCamera(this.model.player.position);
    this.framing.resize(this.width, this.height);
    for (let i = 0; i < this.botViews.length; i++) this.botViews[i].setBot(this.model.bots[i]);
    this.field.reset(this.model.player);
    this.competition.reset();
    this.effects.reset();
    this.pickupFeedback.reset();
    this.particleView.reset();
    this.poleCharge.reset();
    this.lastLanding = 0;
    this.positionCamera();
    this.menu.hud(this.model, this.clock, performance.now(), this.framing.bounds);
  }

  private resetInput(): void {
    this.controls.reset();
    this.playInput.reset();
    stick.hidden = true;
  }

  private finish(): void {
    this.resetInput();
    this.clock.ended = true;
    for (const participant of this.model.participants) participant.combat.attack = { phase: 'idle' };
    this.menu.results(this.model, this.clock);
  }

  update(time: number, delta: number): void {
    this.resize();
    if (!this.menu.running) return;
    const player = this.model.player;
    const releaseFrame = player.combat.attack.phase === 'warning' && player.combat.attack.remaining === theftConfig.warning;
    const previousEnergy = player.combat.energy;
    const previousHeat = player.combat.heat;
    const previousBrittle = player.combat.brittle;
    const previousCorrosion = player.combat.corrosion;
    const previousHazardLoss = player.combat.lostToHazards;
    const previousGold = player.combat.gold;
    const previousPickups = player.pickupsCollected;
    const previousHits = player.combat.hits;
    const previousMisses = player.combat.misses;
    const previousDetached = player.combat.detached;
    const previousLoss = player.combat.lostToTheft + player.combat.lostToHazards;
    const collections: Collection[] = [];
    const steering = this.playInput.steering(this.controls.input.steering((point) => this.screenToWorld(point)));
    this.accumulated += Math.min(delta / 1000, 0.15);
    let advanced = 0;
    while (this.accumulated >= this.stepSize && !this.clock.ended) {
      this.accumulated -= this.stepSize;
      this.clock.advance(this.stepSize, (step) => {
        const result = this.model.step(steering, step);
        if (result) collections.push(...result.collections);
        advanced += step;
      });
    }
    this.heading.update(player.heading, advanced);
    this.magnetScale.update(player.physicalScale, advanced);
    this.framing.follow(player.position, advanced, player.mass);
    const bounds = this.framing.bounds;
    if (advanced > 0) this.model.replenish(bounds);
    this.floor.render(bounds, theme.palette);
    const lessMotion = reducedMotion.matches || this.menu.motionReduced;
    this.effects.configure(this.menu.quality, lessMotion);
    if (this.field.render(player, advanced, theme.palette, lessMotion, player.pickupsCollected > previousPickups)) {
      this.audio.play('milestone');
      this.effects.burst(player.position, 'teal', 24, brand.motion.milestone);
    }
    this.renderPickups(bounds, collections, advanced, lessMotion);
    let ownGold: Collection | undefined;
    let ownEnergy: Collection | undefined;
    let ordinarySparks = this.menu.quality === 'high' ? 10 : 5;
    for (const item of collections) {
      if (item.ownerId === player.id) {
        if (item.kind === 'gold') ownGold = item;
        else if (item.kind === 'energy') ownEnergy = item;
      }
      if (item.x < bounds.left || item.x > bounds.right || item.y < bounds.top || item.y > bounds.bottom) continue;
      const collector = this.model.participants.find(({ id }) => id === item.ownerId);
      if (!collector) continue;
      if (item.kind === 'gold' || item.kind === 'energy' || ordinarySparks-- > 0) this.effects.collect(item, collector);
    }
    if (lessMotion) this.pickupFeedback.reset();
    else {
      if (ownGold) this.pickupFeedback.show('gold', this.framing.toScreen(ownGold));
      if (ownEnergy) this.pickupFeedback.show('energy', this.framing.toScreen(ownEnergy), player.combat.energy - previousEnergy);
      if (player.combat.energy === 100 && previousEnergy < 100) this.pickupFeedback.ready();
    }
    for (const shard of this.model.salvage.chunks) {
      if (shard.age >= theftConfig.flight && shard.age - advanced < theftConfig.flight) {
        this.effects.burst(shard, 'steel', 6, brand.vfx.debrisFlash);
        if (time - this.lastLanding > 220 && Math.hypot(shard.x - player.position.x, shard.y - player.position.y) < 280) {
          this.audio.play('landing');
          this.lastLanding = time;
        }
      }
    }
    this.renderBots(advanced, bounds, lessMotion);
    this.competition.render(this.model, bounds, this.playInput.aim(), this.playInput.tracked(),
      this.menu.quality, advanced, this.framing.zoom, reducedMotion.matches || this.menu.motionReduced);
    if (releaseFrame && advanced > 0 && player.combat.attack.phase === 'warning') {
      this.effects.burst(player.position, 'energy', 6, brand.motion.pickup, player.combat.attack.bearing, Math.PI / 2);
    }
    if (player.combat.hits > previousHits) {
      const detached = player.combat.detached - previousDetached;
      this.menu.attackFeedback(detached > 0 ? detached + ' MASS DETACHED' : 'CORE PROTECTED', time);
      if (!detached) {
        this.audio.play('core');
        this.effects.burst(player.position, 'teal', 6, brand.motion.gold);
      }
    } else if (player.combat.misses > previousMisses) {
      this.audio.play('miss');
      this.menu.attackFeedback('MISS', time);
    }
    if (!previousBrittle && player.combat.brittle) {
      this.audio.play('freeze');
      this.effects.burst(player.position, 'cold', 6, brand.motion.gold);
    }
    else if (previousBrittle && !player.combat.brittle) {
      this.audio.play('recovery');
      this.effects.burst(player.position, 'water', 6, brand.motion.gold);
    }
    if (previousHeat < 1 && player.combat.heat === 1) {
      this.audio.play('overheat');
      this.effects.burst(player.position, 'heat', 6, brand.motion.gold);
    }
    if (!previousCorrosion && player.combat.corrosion) this.audio.play('corrosion');
    if (player.combat.lostToHazards > previousHazardLoss) {
      if (!player.combat.corrosion) this.audio.play('flux');
      this.effects.burst(player.position, player.combat.corrosion ?? 'flux', 6, brand.motion.gold);
    }
    if (player.combat.lostToTheft + player.combat.lostToHazards > previousLoss) {
      this.effects.burst(player.position, 'steel', 6, brand.vfx.debrisFlash);
    }
    this.effects.render(bounds, advanced, player.position, this.framing.zoom);
    const incoming = player.combat.lostToTheft + player.combat.lostToHazards - previousLoss;
    if (player.combat.hits > previousHits || incoming > 0) this.audio.play('hit');
    const hazardActivated = (!previousBrittle && player.combat.brittle) ||
      (previousHeat < 1 && player.combat.heat === 1) ||
      (!previousCorrosion && Boolean(player.combat.corrosion)) ||
      (player.combat.lostToHazards > previousHazardLoss && !player.combat.corrosion);
    if (player.combat.hits > previousHits || incoming >= Math.max(5, player.mass * 0.03) || hazardActivated) {
      this.menu.vibrate(35);
    }
    if (player.combat.energy === 100 && previousEnergy < 100) {
      this.audio.play('ready');
      this.menu.vibrate(22);
    } else if (player.combat.gold > previousGold) {
      this.audio.play('gold');
      this.menu.vibrate(15);
    }
    else if (ownEnergy) this.audio.play('energy');
    else if (player.pickupsCollected > previousPickups && time - this.lastPickupSound > 110) {
      this.audio.play('scrap');
      this.lastPickupSound = time;
    }
    this.menu.hud(this.model, this.clock, time, bounds);
    this.renderPlayer(advanced, lessMotion);
    this.positionCamera();
    this.renderJoystick();
    if (this.clock.ended) this.finish();
  }

  private screenToWorld(point: Point): Point {
    const rect = surface.getBoundingClientRect();
    return this.framing.toWorld({ x: point.x - rect.left, y: point.y - rect.top });
  }

  private resize(): void {
    const width = surface.clientWidth;
    const height = surface.clientHeight;
    const cap = this.menu?.quality === 'low' ? 1 : this.menu?.quality === 'high' ? viewConfig.maxPixelRatio : 2;
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    if (!width || !height) return;
    if (width === this.width && height === this.height && ratio === this.pixelRatio) return;
    this.resetInput();
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

  private renderPickups(bounds: WorldBounds, collections: readonly Collection[], seconds: number, reducedMotion: boolean): void {
    this.particleView.render(this.model.particles.slots, bounds, collections, seconds, theme.palette, this.kindOf, {
      mode: theme.current, zoom: this.framing.zoom, quality: this.menu.quality, reducedMotion, effects: this.effects,
    });
  }

  private renderPlayer(seconds = 0, lessMotion = false): void {
    renderMagnet(this.magnet, this.model.player, this.heading.angle, this.magnetScale.scale);
    this.poleCharge.render(this.model.player, this.heading.angle, this.magnetScale.scale, seconds, true, lessMotion);
  }

  private renderBots(seconds: number, bounds: WorldBounds, lessMotion = false): void {
    this.botNames.length = 0;
    for (const view of this.botViews) {
      view.render(seconds, this.framing.zoom, bounds, theme.palette, this.model.participants, this.botNames, lessMotion);
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
  type: Phaser.CANVAS,
  parent: surface,
  backgroundColor: cssColor(theme.palette.arena.background),
  scale: { mode: Phaser.Scale.NONE, width: 1, height: 1 },
  input: { mouse: false, touch: false, keyboard: false, gamepad: false },
  scene: ArenaScene,
});
