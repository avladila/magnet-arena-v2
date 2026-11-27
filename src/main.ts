import { brand, installBrand } from './brand';
import { GameAudio } from './audio';
import { CompetitionView, sceneryAtlas } from './competition-view';
import { criticalMassConfig, matchConfig, overloadStage, theftConfig } from './competition-config';
import { CriticalView } from './critical-view';
import { MatchClock, type Difficulty, type Mode } from './match';
import { bindPlayInput } from './play-input';
import { element, SessionUI } from './session-ui';
import Phaser from 'phaser';
import { ArenaModel } from './arena-model';
import { ArenaFloor } from './art';
import { faceAtlas, magnetAtlas, MagnetCharacter } from './magnet-art';
import { bindInput } from './browser-input';
import { BotView } from './bot-view';
import { AttentionWorld } from './character-attention';
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
  private criticalView!: CriticalView;
  private criticalCueIndex = 0;
  private alarmBeat = 0;
  private heading = new Heading();
  private magnetScale = new MagnetScale();
  private framing = new ArenaCamera(this.model.player.position);
  private floor!: ArenaFloor;
  private particleView!: ParticleView;
  private effects!: WorkshopParticles;
  private pickupFeedback!: PickupFeedback;
  private lastLanding = 0;
  private nextEnvironment = 0;
  private botViews!: BotView[];
  private readonly botNames: WorldBounds[] = [];
  private field!: GrowthFeedbackView;
  private magnet!: MagnetCharacter;
  private readonly attentionWorld = new AttentionWorld();
  private readonly kindOf = (scrap: Scrap) => this.model.particles.kind(scrap);
  private controls!: ReturnType<typeof bindInput>;
  private pixelRatio = 1;
  private width = 0;
  private height = 0;

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.atlas(magnetAtlas, base + 'magnets.webp', base + 'magnets.json');
    this.load.atlas(faceAtlas, base + 'faces.webp', base + 'faces.json');
    this.load.atlas('workshop', base + 'workshop.webp', base + 'workshop.json');
    this.load.atlas(sceneryAtlas, base + 'scenery.webp', base + 'scenery.json');
  }

  create(): void {
    this.floor = new ArenaFloor(this.add.graphics());
    this.competition = new CompetitionView(this, this.model.participants.length);
    this.criticalView = new CriticalView(this);
    const player = this.model.player;
    this.field = new GrowthFeedbackView(this, player, true);
    this.particleView = new ParticleView(this, true);
    this.effects = new WorkshopParticles(this);
    this.pickupFeedback = new PickupFeedback(surface);
    this.botViews = this.model.bots.map((bot) => new BotView(this, bot, true));
    this.magnet = new MagnetCharacter(this, player.id, 2);
    const toggleTheme = () => {
      theme.toggle();
      applyThemeToPage(themeButton, theme);
      this.floor.render(this.framing.bounds, theme.palette);
      this.cameras.main.setBackgroundColor(theme.palette.arena.background);
    };
    const unbindTheme = bindThemeToggle(themeButton, toggleTheme);
    this.controls = bindInput(surface, (point) => this.screenToWorld(point));
    this.playInput = bindPlayInput(surface, element('attack'), () => this.model.participants,
      () => this.menu.running && this.clock.countdown <= 0 && !this.clock.ended && !this.model.player.combat.attackBlocked,
      (point) => this.screenToWorld(point), () => this.controls.input.mouseLeave(),
      () => this.audio.play('pulse'), () => this.audio.play('arm'));
    this.menu = new SessionUI(this.audio, {
      start: (mode, difficulty) => this.start(mode, difficulty),
      resetInput: () => this.resetInput(),
      end: () => this.finish(),
      toggleTheme,
      leave: () => { this.criticalView.reset(); this.audio.stopCriticalAlarm(); },
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
    this.model = new ArenaModel(mode === 'tutorial' ? 4815 : crypto.getRandomValues(new Uint32Array(1))[0], difficulty,
      mode === 'tutorial', { mode });
    this.clock = new MatchClock(mode);
    this.accumulated = 0;
    this.heading = new Heading();
    this.magnetScale = new MagnetScale();
    this.framing = new ArenaCamera(this.model.player.position);
    this.framing.resize(this.width, this.height);
    for (let i = 0; i < this.botViews.length; i++) this.botViews[i].setBot(this.model.bots[i]);
    this.field.reset(this.model.player);
    this.competition.reset();
    this.criticalView.reset();
    this.criticalCueIndex = 0;
    this.alarmBeat = 0;
    this.audio.stopCriticalAlarm();
    this.effects.reset();
    this.pickupFeedback.reset();
    this.particleView.reset();
    this.magnet.reset();
    this.attentionWorld.reset();
    this.lastLanding = 0;
    this.nextEnvironment = 0;
    this.positionCamera();
    this.menu.hud(this.model, this.clock, performance.now(), this.framing.bounds);
  }

  private resetInput(): void {
    this.controls.reset();
    this.playInput.reset();
    stick.hidden = true;
  }

  private finish(): void {
    const result = this.model.finish(this.clock.mode, this.clock.elapsed);
    if (!result) return;
    this.resetInput();
    this.clock.ended = true;
    this.audio.stopCriticalAlarm();
    for (const participant of this.model.participants) participant.combat.attack = { phase: 'idle' };
    this.menu.results(result);
  }

  update(time: number, delta: number): void {
    this.resize();
    if (!this.menu.running) return;
    const player = this.model.player;
    const critical = this.model.critical;
    const wasBlocked = player.combat.attackBlocked;
    const previousMass = player.mass;
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
    const previousGuarded = player.combat.guarded;
    const previousProtected = player.combat.protectedHits;
    const previousBrittleHits = player.combat.brittleHits;
    const previousMassiveHits = player.combat.massiveHits;
    const previousGiantsCracked = player.combat.giantsCracked;
    const previousDetached = player.combat.detached;
    const previousSalvage = player.combat.salvage;
    const previousOwnSalvage = player.combat.ownSalvage;
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
      }, critical);
    }
    if (!wasBlocked && player.combat.attackBlocked) this.playInput.reset();
    this.criticalCues(previousMass);
    this.heading.update(player.heading, advanced);
    this.magnetScale.update(player.physicalScale, advanced, player.combat.lostToTheft);
    this.framing.follow(player.position, advanced, player.mass);
    const bounds = this.framing.bounds;
    if (advanced > 0) this.model.replenish(bounds);
    this.floor.render(bounds, theme.palette);
    const lessMotion = reducedMotion.matches || this.menu.motionReduced;
    this.effects.configure(this.menu.quality, lessMotion);
    if (!critical?.removed(player)) this.effects.travel(player, bounds, advanced, player.combat.energy === theftConfig.energy);
    for (const bot of this.model.bots) if (!critical?.removed(bot)) this.effects.travel(bot, bounds, advanced, Boolean(this.model.botIntent(bot)));
    this.field.setVisible(!critical?.committed);
    if (!critical?.committed && this.field.render(player, advanced, theme.palette, lessMotion, player.pickupsCollected > previousPickups,
        this.heading.angle, this.menu.quality !== 'low', this.framing.zoom)) {
      this.audio.play('milestone');
      this.effects.burst(player.position, 'teal', 24, brand.motion.milestone);
    }
    this.renderPickups(bounds, collections, advanced, lessMotion);
    let ownGold: Collection | undefined;
    let ownEnergy: Collection | undefined;
    let ordinarySparks = this.menu.quality === 'high' ? 10 : 5;
    const ultimate = critical?.rules.ultimate ?? (this.model.mode === 'endless' ? criticalMassConfig.ultimate : Infinity);
    for (const item of collections) {
      if (item.ownerId === player.id) {
        if (item.kind === 'gold') ownGold = item;
        else if (item.kind === 'energy') ownEnergy = item;
      }
      if (item.x < bounds.left || item.x > bounds.right || item.y < bounds.top || item.y > bounds.bottom) continue;
      const collector = this.model.participants.find(({ id }) => id === item.ownerId);
      if (!collector) continue;
      if (item.kind === 'gold' || item.kind === 'energy' || ordinarySparks-- > 0) {
        this.effects.collect(item, collector, collector.mass >= ultimate);
      }
    }
    if (lessMotion) this.pickupFeedback.reset();
    else {
      if (ownGold) this.pickupFeedback.show('gold', this.framing.toScreen(ownGold));
      if (ownEnergy) this.pickupFeedback.show('energy', this.framing.toScreen(ownEnergy), player.combat.energy - previousEnergy);
      if (player.combat.energy === 100 && previousEnergy < 100) this.pickupFeedback.ready();
    }
    let landingBursts = this.menu.quality === 'high' ? 14 : 7;
    for (const shard of this.model.salvage.chunks) {
      if (shard.age >= theftConfig.flight && shard.age - advanced < theftConfig.flight) {
        if (landingBursts > 0 && shard.x >= bounds.left && shard.x <= bounds.right &&
            shard.y >= bounds.top && shard.y <= bounds.bottom) {
          this.effects.burst(shard, 'steel', shard.value >= 70 ? 6 : 2, brand.vfx.debrisFlash);
          landingBursts--;
        }
        if (time - this.lastLanding > 220 && Math.hypot(shard.x - player.position.x, shard.y - player.position.y) < 280) {
          this.audio.play('landing');
          this.lastLanding = time;
        }
      }
    }
    const aim = this.playInput.aim();
    this.attentionWorld.update(this.model, bounds, advanced, aim, this.particleView.resourcesInView);
    this.renderBots(advanced, bounds, lessMotion);
    const impact = this.competition.render(this.model, bounds, aim, this.playInput.tracked(),
      this.menu.quality, advanced, this.framing.zoom, lessMotion);
    this.criticalView.render(critical, bounds, this.framing.zoom, this.menu.quality, advanced, lessMotion);
    if (releaseFrame && advanced > 0 && player.combat.attack.phase === 'warning') {
      this.effects.burst(player.position, 'energy', 6, brand.motion.pickup, player.combat.attack.bearing, Math.PI / 2);
    }
    const detached = player.combat.detached - previousDetached;
    if (player.combat.hits > previousHits) {
      const hit = player.combat.giantsCracked > previousGiantsCracked ? 'GIANT CRACKED'
        : player.combat.massiveHits > previousMassiveHits ? 'MASSIVE HIT' : '';
      this.menu.attackFeedback([hit, detached + ' MASS DETACHED',
        player.combat.brittleHits > previousBrittleHits ? 'BRITTLE HIT' : ''].filter(Boolean).join(' · '), time);
    } else if (player.combat.guarded > previousGuarded) {
      this.audio.play('guarded');
      this.menu.attackFeedback('ATTACK GUARDED', time);
    } else if (player.combat.protectedHits > previousProtected) {
      this.audio.play('core');
      this.menu.attackFeedback('CORE PROTECTED', time);
    } else if (player.combat.misses > previousMisses) {
      this.audio.play('miss');
      this.menu.attackFeedback('MISS', time);
    }
    if (player.combat.salvage > previousSalvage) {
      const gained = player.combat.salvage - previousSalvage;
      this.menu.salvageFeedback(gained, player.combat.ownSalvage - previousOwnSalvage, this.clock.elapsed);
      this.effects.absorb(player, gained);
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
    if (!previousCorrosion && player.combat.corrosion) {
      this.audio.play(player.combat.corrosion === 'water' ? 'splash' : 'corrosion');
      this.effects.burst(player.position, player.combat.corrosion, 5, 160, player.heading - Math.PI, Math.PI * 0.7);
    }
    if (player.combat.lostToHazards > previousHazardLoss) {
      if (!player.combat.corrosion) this.audio.play('flux');
      this.effects.burst(player.position, player.combat.corrosion ?? 'flux', 6, brand.motion.gold);
    }
    if (player.combat.lostToTheft + player.combat.lostToHazards > previousLoss) {
      this.effects.burst(player.position, 'steel', 6, brand.vfx.debrisFlash);
    }
    this.effects.render(bounds, advanced, player.position, this.framing.zoom);
    const incoming = player.combat.lostToTheft + player.combat.lostToHazards - previousLoss;
    const significantHit = player.combat.hits > previousHits || incoming > 0;
    if (significantHit) this.audio.play(impact === 'fracture' ? 'fracture' : impact === 'heavy' ? 'impact' : 'hit');
    if (!critical?.committed && this.clock.elapsed >= this.nextEnvironment) {
      this.nextEnvironment = this.clock.elapsed + 0.25;
      let nearest = 330;
      let local;
      for (const site of this.model.hazards?.sites ?? []) {
        const gap = Math.max(0, Math.hypot(site.x - player.position.x, site.y - player.position.y) - site.radius);
        if (gap >= nearest) continue;
        nearest = gap;
        local = site.kind;
      }
      if (local) this.audio.environment(local, nearest);
    }
    const hazardActivated = (!previousBrittle && player.combat.brittle) ||
      (previousHeat < 1 && player.combat.heat === 1) ||
      (!previousCorrosion && Boolean(player.combat.corrosion)) ||
      (player.combat.lostToHazards > previousHazardLoss && !player.combat.corrosion);
    if (player.combat.hits > previousHits || incoming >= Math.max(5, player.mass * 0.03) || hazardActivated) {
      this.menu.vibrate(impact === 'fracture' ? 58 : impact === 'heavy' ? 40 : 25);
    }
    if (player.combat.energy === 100 && previousEnergy < 100) {
      this.audio.play('ready');
      this.menu.vibrate(20);
    } else if (player.combat.gold > previousGold) {
      this.audio.play('gold');
      this.menu.vibrate(13);
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

  private criticalCues(previousMass: number): void {
    const { critical, player } = this.model;
    if (!critical && this.model.mode === 'endless' && previousMass < criticalMassConfig.ultimate && player.mass >= criticalMassConfig.ultimate) {
      this.audio.play('ultimate');
    }
    if (!critical) return;
    const stage = overloadStage(player.mass, critical.rules);
    if (player.mass > previousMass && stage !== overloadStage(previousMass, critical.rules) && stage !== 'critical') {
      this.audio.play(stage === 'ultimate' ? 'ultimate' : stage === 'unstable' ? 'instability' : 'severe-instability');
      this.effects.burst(player.position, 'gold', 12, 230);
    }
    let destroyed = false;
    let humanDestroyed = false;
    for (; this.criticalCueIndex < critical.events.length; this.criticalCueIndex++) {
      const event = critical.events[this.criticalCueIndex];
      if (event.type === 'claim') {
        this.audio.play('critical-start');
        this.alarmBeat = Math.ceil(event.claim.remaining);
      } else if (event.type === 'interrupted') {
        this.audio.stopCriticalAlarm();
        this.audio.play('critical-interrupted');
        this.alarmBeat = 0;
      } else if (event.type === 'detonation') {
        this.audio.stopCriticalAlarm();
        this.audio.play('critical-explosion');
      } else {
        destroyed = true;
        humanDestroyed ||= event.id === player.id;
      }
    }
    if (destroyed) this.audio.play('critical-destroyed', humanDestroyed ? .96 : .64);
    const claim = critical.claim;
    if (!claim) return;
    const beat = Math.ceil(claim.remaining);
    if (beat < this.alarmBeat) {
      this.alarmBeat = beat;
      this.audio.play(beat <= 1 ? 'critical-last' : 'critical-tick');
    }
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
    this.particleView.render(this.model.critical?.committed ? [] : this.model.particles.slots, bounds, collections, seconds, theme.palette, this.kindOf, {
      mode: theme.current, zoom: this.framing.zoom, quality: this.menu.quality, reducedMotion, effects: this.effects,
    });
  }

  private renderPlayer(seconds = 0, lessMotion = false): void {
    const player = this.model.player;
    this.magnet.render(player, this.heading.angle, this.magnetScale.scale, seconds, !this.model.critical?.removed(player), lessMotion,
      this.attentionWorld, undefined, this.menu.quality !== 'low', this.model.critical, this.model.mode === 'endless');
  }

  private renderBots(seconds: number, bounds: WorldBounds, lessMotion = false): void {
    this.botNames.length = 0;
    for (let i = 0; i < this.botViews.length; i++) {
      const bot = this.model.bots[i];
      this.botViews[i].render(seconds, this.framing.zoom, bounds, theme.palette, this.model.participants, this.botNames, lessMotion,
        this.attentionWorld, bot && this.model.botIntent(bot), this.menu.quality !== 'low', this.model.critical, this.model.mode === 'endless');
    }
  }

  private renderJoystick(): void {
    const joystick = this.controls.input.joystick;
    const locked = this.model.critical?.claim?.actor === this.model.player || this.model.critical?.removed(this.model.player);
    stick.hidden = !joystick || Boolean(locked);
    if (!joystick || locked) return;
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
