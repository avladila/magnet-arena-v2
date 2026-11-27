import { brand } from './brand';
import type { ArenaModel } from './arena-model';
import { criticalMassConfig, matchConfig, overloadLabels, overloadStage } from './competition-config';
import type { GameAudio } from './audio';
import { RankFeedback, rankings, type Difficulty, type MatchClock, type Mode } from './match';
import type { DetonationOutcome, MatchResult } from './match-result';
import type { WorldBounds } from './particles';
import { Navigation } from './navigation';
import { clearProgress, loadProgress, recordMatch, saveProgress, type Quality } from './progress';

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const formatTime = (seconds: number) => {
  const remaining = Math.max(0, Math.ceil(seconds));
  return Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0');
};
const pages = ['home', 'help', 'settings', 'reset', 'pause', 'leave', 'results'] as const;
type Page = typeof pages[number];
const attackLabel = { unavailable: 'Attack', charging: 'Charging', ready: 'Ready', armed: 'Release',
  release: 'Firing', firing: 'Firing', cooling: 'Cooling', locked: 'Locked' } as const;
const comma = new Intl.NumberFormat('en-US');
const endTitles: Record<DetonationOutcome, string> = {
  detonator: 'CRITICAL MASS VICTORY', survivor: 'YOU SURVIVED', destroyed: 'DESTROYED BY THE SHOCKWAVE',
};

export class SessionUI {
  private readonly dialog = element<HTMLDialogElement>('menu');
  private readonly difficulty = element<HTMLSelectElement>('difficulty');
  private readonly title = element('menu-title');
  private progress = loadProgress();
  private page: Page = 'home';
  private mode: Mode = 'arena';
  private duringSession = false;
  private rankingText = '';
  private ranksExpanded = false;
  private readonly compactRanks = matchMedia('(max-width: 600px), (pointer: coarse)');
  private ranks = new RankFeedback();
  private rankNoticeUntil = 0;
  private resultDetails?: Promise<typeof import('./result-stats') | undefined>;
  private lastHud = 0;
  private feedback?: { label: string; until: number };
  private salvageNotice?: { value: number; own: number; latest: number };
  private readonly navigation = new Navigation();
  private changeDifficulty = false;
  private dangerSerial?: number;
  private progressMass = -1;

  constructor(private readonly audio: GameAudio, actions: {
    start: (mode: Mode, difficulty: Difficulty) => void;
    resetInput: () => void;
    end: () => void;
    toggleTheme: () => void;
    leave: () => void;
  }) {
    this.syncSettings();
    element('critical-help').textContent = `Physical growth tops out at 12×. Keep collecting to reach Ultimate Form at ${comma.format(criticalMassConfig.ultimate)} mass. ` +
      `In Arena, ${comma.format(criticalMassConfig.threshold)} current mass locks the leader in place for a ${criticalMassConfig.countdown}-second detonation countdown. ` +
      `The blast reaches ${comma.format(criticalMassConfig.radius)} world units from its center. Endless keeps Ultimate Form and lets you keep collecting.`;
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (this.page === 'pause') this.resume();
      else if (this.page === 'leave' || this.page === 'settings' || this.page === 'help') this.back();
    });
    this.dialog.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')?.dataset.action;
      if (action) {
        this.audio.unlock();
        this.audio.play(this.page === 'home' && ['arena', 'endless', 'tutorial'].includes(action) ? 'title' : 'activate');
      }
      if (action === 'arena'  || action === 'endless' || action === 'tutorial' || action === 'replay') {
        this.mode = action === 'replay' ? this.mode : action;
        this.progress.difficulty = this.difficulty.value as Difficulty;
        saveProgress(this.progress);
        this.audio.unlock();
        this.duringSession = true;
        this.changeDifficulty = false;
        this.feedback = undefined;
        this.salvageNotice = undefined;
        this.expandRanks(false);
        this.lastHud = -Infinity;
        this.ranks = new RankFeedback();
        this.rankNoticeUntil = 0;
        this.dangerSerial = undefined;
        this.progressMass = -1;
        element('rank-event').textContent = '';
        element('rank-record').textContent = '';
        this.resultDetails ??= import('./result-stats').catch(() => undefined);
        actions.start(this.mode, this.progress.difficulty);
        this.resume();
      } else if (action === 'resume') this.resume();
      else if (action === 'help' || action === 'settings' || action === 'reset' || action === 'leave') this.show(action);
      else if (action === 'back') this.back();
      else if (action === 'home' || action === 'change') {
        actions.leave();
        this.duringSession = false;
        this.changeDifficulty = action === 'change';
        this.setGameVisible(false);
        this.show('home');
        if (this.changeDifficulty) this.difficulty.focus();
      } else if (action === 'end') actions.end();
      else if (action === 'confirm-reset') {
        this.progress = clearProgress();
        if (document.documentElement.dataset.theme === 'dark') actions.toggleTheme();
        this.syncSettings();
        this.show('settings');
      }
    });
    element<HTMLInputElement>('master').addEventListener('input', ({ target }) => {
      this.progress.master = (target as HTMLInputElement).valueAsNumber;
      this.audio.setMaster(this.progress.master / 100);
      saveProgress(this.progress);
    });
    this.dialog.addEventListener('pointerover', (event) => {
      if ((event.target as HTMLElement).closest('button')) this.audio.play('hover');
    });
    element<HTMLInputElement>('volume').addEventListener('input', ({ target }) => {
      this.progress.volume = (target as HTMLInputElement).valueAsNumber;
      this.audio.volume = this.progress.volume / 100;
      this.audio.unlock();
      saveProgress(this.progress);
    });
    element<HTMLInputElement>('music').addEventListener('input', ({ target }) => {
      this.progress.music = (target as HTMLInputElement).valueAsNumber;
      this.audio.setMusic(this.progress.music / 100);
      saveProgress(this.progress);
    });
    element<HTMLInputElement>('haptics').addEventListener('change', ({ target }) => {
      this.progress.haptics = (target as HTMLInputElement).checked;
      saveProgress(this.progress);
    });
    element<HTMLSelectElement>('quality').addEventListener('change', ({ target }) => {
      this.progress.quality = (target as HTMLSelectElement).value as Quality;
      saveProgress(this.progress);
    });
    element<HTMLInputElement>('motion').addEventListener('change', ({ target }) => {
      this.progress.reducedMotion = (target as HTMLInputElement).checked;
      document.documentElement.dataset.reducedMotion = String(this.progress.reducedMotion);
      saveProgress(this.progress);
    });
    element('dark').addEventListener('change', actions.toggleTheme);
    element('pause').addEventListener('click', () => this.pause(actions.resetInput));
    const rankingsPanel = element('rankings-panel');
    for (const type of ['pointerdown', 'pointerup', 'pointermove']) {
      rankingsPanel.addEventListener(type, (event) => event.stopPropagation());
    }
    element('rankings-toggle').addEventListener('click', (event) => {
      this.expandRanks(!this.ranksExpanded);
      if (event.detail) element('arena').focus({ preventScroll: true });
      this.lastHud = -Infinity;
    });
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.running && !event.repeat) {
        event.preventDefault();
        this.pause(actions.resetInput);
      }
    });
    document.addEventListener('visibilitychange', () => {
      this.audio.visibilityChanged();
      if (document.hidden && this.running) this.pause(actions.resetInput);
    });
    this.show('home');
  }

  get running() { return !this.dialog.open && this.duringSession; }
  get quality() { return this.progress.quality; }
  get motionReduced() { return this.progress.reducedMotion; }

  vibrate(duration: number): void {
    if (this.progress.haptics && typeof navigator.vibrate === 'function' && matchMedia('(pointer: coarse)').matches) {
      navigator.vibrate(duration);
    }
  }

  private syncSettings() {
    this.difficulty.value = this.progress.difficulty;
    element<HTMLInputElement>('master').value = String(this.progress.master);
    this.audio.setMaster(this.progress.master / 100);
    element<HTMLInputElement>('volume').value = String(this.progress.volume);
    element<HTMLSelectElement>('quality').value = this.progress.quality;
    element<HTMLInputElement>('music').value = String(this.progress.music);
    element<HTMLInputElement>('haptics').checked = this.progress.haptics;
    this.audio.setMusic(this.progress.music / 100);
    element<HTMLInputElement>('motion').checked = this.progress.reducedMotion;
    document.documentElement.dataset.reducedMotion = String(this.progress.reducedMotion);
    this.audio.volume = this.progress.volume / 100;
  }

  private show(page: Page) {
    this.page = page;
    this.audio.playMusic(false);
    for (const item of pages) element('menu-' + item).hidden = item !== page;
    this.dialog.dataset.page = page;
    const titles: Record<Page, string> = {
      home: 'MAGNET', help: 'How to Play', settings: 'Settings', reset: 'Reset progress',
      pause: 'Paused', leave: 'Leave session', results: 'Results',
    };
    this.title.textContent = titles[page];
    if (page === 'home') {
      const mark = document.createElement('img');
      mark.className = 'pole-mark';
      mark.src = import.meta.env.BASE_URL + 'app-icon.png';
      mark.alt = '';
      this.title.prepend(mark);
      const punctuation = document.createElement('span');
      punctuation.textContent = '.';
      this.title.append(punctuation);
      element('tutorial-start').textContent = this.progress.tutorialDone ? 'Tutorial' : 'Learn to Play';
      element('records').textContent = 'Best mass   Arena ' + this.progress.arenaMass + '   ·   Endless ' + this.progress.endlessMass +
        (this.progress.criticalVictories || this.progress.survivedDetonations
          ? '   ·   Detonations ' + this.progress.criticalVictories + '   ·   Survived ' + this.progress.survivedDetonations : '');
    }
    if (page === 'settings') element<HTMLInputElement>('dark').checked = document.documentElement.dataset.theme === 'dark';
    element('skip-tutorial').hidden = this.mode !== 'tutorial';
    element('end-session').hidden = this.mode !== 'endless';
    if (!this.dialog.open) this.dialog.showModal();
    else element('menu-' + page).querySelector<HTMLElement>('button, input, select')?.focus();
  }

  private back() { this.show(this.duringSession ? 'pause' : 'home'); }

  private setGameVisible(visible: boolean) {
    document.querySelector<HTMLElement>('.game-guide')!.hidden = !visible;
    element('attack').hidden = !visible;
    element('countdown').hidden = true;
    element('map-toggle').hidden = !visible;
    if (!visible) {
      element('critical-warning').hidden = true;
      element('minimap').hidden = true;
      element('map-toggle').setAttribute('aria-expanded', 'false');
    }
  }

  private pause(reset: () => void) {
    reset();
    this.audio.stopCriticalAlarm();
    this.show('pause');
  }

  private resume() {
    this.dialog.close();
    this.audio.playMusic(true);
    this.setGameVisible(true);
    const arena = element('arena');
    arena.tabIndex = -1;
    arena.focus({ preventScroll: true });
  }

  attackFeedback(label: string, now: number): void {
    this.feedback = { label, until: now + 1400 };
  }

  salvageFeedback(value: number, own: number, elapsed: number): void {
    const previous = this.salvageNotice;
    const group = previous && elapsed - previous.latest <= 0.6 ? previous : { value: 0, own: 0, latest: elapsed };
    group.value += value;
    group.own += own;
    group.latest = elapsed;
    this.salvageNotice = group;
  }

  private expandRanks(expanded: boolean): void {
    this.ranksExpanded = expanded;
    const toggle = element('rankings-toggle');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Close rankings' : 'Full rankings';
    element('ranking').tabIndex = expanded ? 0 : -1;
    element('rankings-panel').dataset.expanded = String(expanded);
  }

  hud(model: ArenaModel, clock: MatchClock, now: number, bounds: WorldBounds) {
    const { combat, mass, position } = model.player;
    this.writeText('mass', String(mass));
    const critical = model.critical;
    const warning = critical?.warning;
    const interruption = this.renderCritical(model, clock, bounds);
    this.writeText('clock', critical?.committed ? 'Shockwave' : clock.mode === 'arena' ?
      formatTime(matchConfig.duration - clock.elapsed) : clock.mode === 'tutorial' ? 'Training' : 'Endless');
    const countdown = element('countdown');
    const remaining = matchConfig.duration - clock.elapsed;
    const message = warning ? '' : clock.countdown > 0 ? String(Math.ceil(clock.countdown)) :
      clock.mode === 'arena' && clock.elapsed < 0.85 ? 'GO' :
      clock.mode === 'arena' && remaining > 59 && remaining <= 60 ? 'FINAL MINUTE' :
      clock.mode === 'arena' && remaining <= 10 && remaining > 0 ? String(Math.ceil(remaining)) : '';
    if (countdown.textContent !== message) {
      if (message === 'GO') this.audio.play('start');
      else if (Number(message) > 0) this.audio.play(clock.countdown > 0 ? 'countdown' : 'final');
      countdown.textContent = message;
    }
    countdown.hidden = !message;
    const meter = element<HTMLProgressElement>('energy');
    if (meter.value !== combat.energy) {
      if (meter.value < combat.energy && !this.motionReduced && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        meter.animate([{ filter: 'brightness(1.42)' }, { filter: 'brightness(1)' }], { duration: 135 });
      }
      meter.value = combat.energy;
    }
    this.writeText('energy-readout', combat.energy + '%');
    const attack = element<HTMLButtonElement>('attack');
    const ready = !combat.attackBlocked && combat.energy === 100 && combat.attack.phase === 'idle';
    const attackState = combat.attackBlocked ? 'locked' : clock.countdown > 0 ? 'unavailable' : combat.attack.phase === 'armed' ? 'armed'
      : combat.attack.phase === 'warning' ? (combat.attack.remaining > 0.125 ? 'release' : 'firing')
        : combat.attack.phase === 'cooldown' ? 'cooling' : ready ? 'ready' : 'charging';
    if (attack.dataset.state !== attackState) {
      attack.disabled = attackState === 'locked';
      attack.dataset.ready = String(ready || combat.attack.phase === 'armed' || combat.attack.phase === 'warning');
      attack.dataset.state = attackState;
      this.writeText('attack', attackLabel[attackState]);
    }
    const full = String(combat.energy === 100);
    if (meter.dataset.full !== full) meter.dataset.full = full;
    element('energy-ready').hidden = !ready;
    const tutorial = model.tutorial;
    this.writeText('tutorial-task', tutorial?.instruction ?? '');
    element('rankings-panel').hidden = Boolean(tutorial);
    if (tutorial?.completed && !this.progress.tutorialDone) {
      this.progress.tutorialDone = true;
      saveProgress(this.progress);
    }
    const signal = warning ? undefined : model.signal;
    const signalHud = element('salvage-signal');
    const offscreen = signal && (signal.x < bounds.left || signal.x > bounds.right || signal.y < bounds.top || signal.y > bounds.bottom);
    let tip = '';
    if (signal) {
      tip = 'Salvage Signal';
      if (offscreen) {
        const angle = Math.atan2(signal.y - position.y, signal.x - position.x);
        signalHud.style.setProperty('--signal-bearing', 45 * Math.round(angle / (Math.PI / 4)) + 'deg');
        tip += ' ' + Math.round(Math.hypot(signal.x - position.x, signal.y - position.y)) + ' m';
      }
    }
    signalHud.toggleAttribute('data-offscreen', Boolean(offscreen));
    this.writeText('salvage-signal', tip);
    const reward = this.salvageNotice;
    this.writeText('salvage-reward', reward && clock.elapsed - reward.latest < 1.25
      ? 'SALVAGE SECURED +' + reward.value + (reward.own > 0 && reward.own < reward.value ? ' · ' + reward.own + ' yours' : '') : '');
    this.writeText('status', [
      warning && interruption ? `DETONATION INTERRUPTED${interruption.detail ? ' · ' + interruption.detail : ''}` : '',
      this.feedback && this.feedback.until > now ? this.feedback.label : '',
      combat.guardFor > 0 ? 'THEFT GUARD' : '',
      combat.heat >= 1 ? 'OVERHEATED' : combat.heat > 0 ? 'Heat ' + Math.round(combat.heat * 100) + '%' : '',
      combat.brittle ? 'BRITTLE' : '', combat.corrosion === 'acid' ? 'Acid corrosion' : combat.corrosion ? 'Water corrosion' : '',
    ].filter(Boolean).join(' · '));
    if (warning?.serial !== this.dangerSerial) {
      this.dangerSerial = warning?.serial;
      this.lastHud = -Infinity;
    }
    if (now - this.lastHud > 180) {
      this.lastHud = now;
      this.navigation.render(model, bounds);
      if (tutorial) return;
      const all = rankings(model.participants);
      const mine = all.find(({ participant }) => participant.kind === 'player')!;
      const place = mine.place;
      const rows = this.ranksExpanded ? all : all.slice(0, this.compactRanks.matches ? 1 : 5);
      if (!this.ranksExpanded && !rows.includes(mine)) rows.push(mine);
      const ranking = rows.map(({ place, participant }) => place + '/' + participant.id + '/' + participant.mass).join(',');
      if (ranking !== this.rankingText) {
        this.rankingText = ranking;
        this.list('ranking', rows);
      }
      if (model.bestPlace !== undefined) {
        this.writeText('rank-record', 'Best #' + model.bestPlace + ' · Peak ' + combat.highest);
      }
      const notice = this.ranks.update(place, all[1]?.place > 1 ? all[0].participant : undefined, clock.elapsed);
      if (notice) {
        this.rankNoticeUntil = clock.elapsed + 1.9;
        this.writeText('rank-event', notice.label);
      } else if (clock.elapsed >= this.rankNoticeUntil) this.writeText('rank-event', '');
      if (notice?.climbing && !this.motionReduced &&
          !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        element('rank-event').animate([
          { transform: 'translateX(-5px)', backgroundColor: brand.arcade.green, color: brand.arcade.ink },
          { transform: 'translateX(0)' },
        ], { duration: 240, easing: 'cubic-bezier(' + brand.motion.snap.join(',') + ')' });
      }
    }
  }

  private renderCritical(model: ArenaModel, clock: MatchClock, bounds: WorldBounds) {
    const { critical, player } = model;
    element('critical-progress').hidden = !critical;
    const banner = element('critical-warning');
    if (!critical) { banner.hidden = true; return; }
    const meter = element<HTMLProgressElement>('critical-meter');
    if (this.progressMass !== player.mass || meter.max !== critical.rules.threshold) {
      this.progressMass = player.mass;
      meter.max = critical.rules.threshold;
      meter.value = Math.min(player.mass, meter.max);
      this.writeText('critical-mass-amount', `${comma.format(player.mass)} / ${comma.format(meter.max)}`);
      const stage = overloadStage(player.mass, critical.rules);
      meter.dataset.stage = stage;
      this.writeText('overload-stage', stage === 'standard' ? '' : overloadLabels[stage].toUpperCase());
    }
    const { claim, blast, warning } = critical;
    const last = critical.interruptions.at(-1);
    const interrupted = last && clock.elapsed - last.at < 2.2 ? last : undefined;
    const attacker = interrupted?.attackerId && model.participants.find(p => p.id === interrupted.attackerId);
    const detail = attacker ? `Stopped by ${attacker.name}` : interrupted?.cause === 'hazard' ? 'Hazard damage' : '';
    banner.hidden = !warning && !interrupted;
    if (banner.hidden) return;
    banner.dataset.phase = claim ? 'countdown' : blast ? 'shockwave' : 'interrupted';
    const actor = claim?.actor ?? blast?.winner;
    const inBlast = warning && Math.hypot(player.position.x - warning.center.x, player.position.y - warning.center.y) -
      player.radius <= critical.rules.radius;
    this.writeText('critical-title', claim ? 'CRITICAL MASS REACHED' : blast ? (critical.destroyed(player)
      ? 'DESTROYED BY THE SHOCKWAVE' : 'SHOCKWAVE') : 'DETONATION INTERRUPTED');
    this.writeText('critical-count', claim ? (Math.ceil(claim.remaining * 10 - 1e-8) / 10).toFixed(1) + ' s' : '');
    this.writeText('critical-threat', actor ? (claim ? (actor === player ? 'YOU ARE ABOUT TO DETONATE' : `${actor.name} IS ABOUT TO DETONATE`)
      : `${actor.name} DETONATED`) +
      (actor !== player && inBlast && !critical.destroyed(player) ? ' · ESCAPE THE BLAST' : '')
      : detail);
    const direction = element('critical-direction');
    const center = warning?.center;
    const offscreen = center && (center.x < bounds.left || center.x > bounds.right || center.y < bounds.top || center.y > bounds.bottom);
    direction.toggleAttribute('data-offscreen', Boolean(offscreen));
    if (offscreen && center) {
      const dx = center.x - player.position.x, dy = center.y - player.position.y;
      direction.style.setProperty('--critical-bearing', Math.atan2(dy, dx) * 180 / Math.PI + 'deg');
      this.writeText('critical-direction', `${comma.format(Math.round(Math.hypot(dx, dy)))} units to blast center`);
    } else this.writeText('critical-direction', '');
    return interrupted && { detail };
  }

  private writeText(id: string, text: string): void {
    const target = element(id);
    if (target.textContent !== text) target.textContent = text;
  }

  private list(id: string, rows: readonly { place: number; participant: { kind: string; name: string; mass: number; outcome?: DetonationOutcome } }[]) {
    element(id).replaceChildren(...rows.map(({ place, participant }) => {
      const row = document.createElement('li');
      const rank = document.createElement('span');
      const name = document.createElement('span');
      const mass = document.createElement('span');
      rank.textContent = String(place);
      name.textContent = participant.name;
      mass.textContent = String(participant.mass);
      if (participant.outcome) {
        const outcome = document.createElement('small');
        outcome.className = 'final-outcome';
        outcome.textContent = participant.outcome;
        row.dataset.outcome = participant.outcome;
        name.append(outcome);
      }
      if (participant.kind === 'player') row.className = 'is-player';
      row.append(rank, name, mass);
      return row;
    }));
  }

  results(result: MatchResult) {
    const player = result.standings.find(({ kind }) => kind === 'player')!;
    const { place, outcome } = player;
    const best = recordMatch(this.progress, result);
    if (best === undefined) return;
    this.duringSession = false;
    this.setGameVisible(false);
    this.show('results');
    this.dialog.dataset.outcome = outcome ?? (result.mode === 'endless' ? 'endless' : place === 1 ? 'victory' : 'defeat');
    const summary = outcome ? endTitles[outcome] : result.mode === 'endless' ? 'Endless session' :
      place === 1 ? 'Victory' : place === 2 ? 'Second place' : place === 3 ? 'Third place' : 'Place ' + place;
    element('result-summary').textContent = summary + ' · ' + player.mass + ' mass' + (best ? ' · Personal best' : '');
    const finale = element('result-finale');
    finale.hidden = result.cause !== 'detonation';
    const winner = result.standings.find(({ id }) => id === result.winnerId);
    finale.textContent = result.detonation ? `${winner?.name ?? ''} detonated · ${result.detonation.destroyed} destroyed · ${result.detonation.survived} survived` +
      (player.survivalPoints ? ` · +${comma.format(player.survivalPoints)} SURVIVAL POINTS` : '') : '';
    this.list('result-ranking', result.standings.map(participant => ({ place: participant.place, participant })));
    element('result-ranking').scrollTop = 0;
    const stats = element('result-stats');
    stats.replaceChildren();
    void this.resultDetails?.then((details) => {
      if (this.page !== 'results') return;
      if (details) details.renderResultStats(stats, player, result);
      else {
        const list = document.createElement('dl');
        const label = document.createElement('dt');
        const value = document.createElement('dd');
        label.textContent = 'Peak mass';
        value.textContent = String(player.combat.highest);
        list.append(label, value);
        stats.replaceChildren(list);
      }
    });
    if (outcome === 'detonator') this.audio.play('critical-victory');
    else if (outcome === 'survivor') this.audio.play('critical-survive');
    else if (best && !outcome) this.audio.play('best');
    else this.audio.play(result.mode === 'arena' ? (place === 1 ? 'victory' : 'defeat') : 'results');
  }
}
