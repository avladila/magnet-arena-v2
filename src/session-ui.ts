import type { ArenaModel } from './arena-model';
import { matchConfig } from './competition-config';
import type { GameAudio } from './audio';
import { rankings, type Difficulty, type MatchClock, type Mode } from './match';
import type { WorldBounds } from './particles';
import { Navigation } from './navigation';
import { clearProgress, loadProgress, saveProgress, type Quality } from './progress';

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const names: Record<string, string> = { player: 'You', 'bot-1': 'Copper', 'bot-2': 'Spark', 'bot-3': 'Drift', 'bot-4': 'Orbit' };
const formatTime = (seconds: number) => {
  const remaining = Math.max(0, Math.ceil(seconds));
  return Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0');
};
const pages = ['home', 'help', 'settings', 'reset', 'pause', 'leave', 'results'] as const;
type Page = typeof pages[number];

export class SessionUI {
  private readonly dialog = element<HTMLDialogElement>('menu');
  private readonly difficulty = element<HTMLSelectElement>('difficulty');
  private readonly title = element('menu-title');
  private progress = loadProgress();
  private page: Page = 'home';
  private mode: Mode = 'arena';
  private duringSession = false;
  private rankingText = '';
  private lastHud = 0;
  private feedback?: { label: string; until: number };
  private readonly navigation = new Navigation();
  private changeDifficulty = false;

  constructor(private readonly audio: GameAudio, actions: {
    start: (mode: Mode, difficulty: Difficulty) => void;
    resetInput: () => void;
    end: () => void;
    toggleTheme: () => void;
  }) {
    this.syncSettings();
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
        this.lastHud = -Infinity;
        actions.start(this.mode, this.progress.difficulty);
        this.resume();
      } else if (action === 'resume') this.resume();
      else if (action === 'help' || action === 'settings' || action === 'reset' || action === 'leave') this.show(action);
      else if (action === 'back') this.back();
      else if (action === 'home' || action === 'change') {
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
      element('records').textContent = 'Best mass   Arena ' + this.progress.arenaMass + '   ·   Endless ' + this.progress.endlessMass;
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
      element('minimap').hidden = true;
      element('map-toggle').setAttribute('aria-expanded', 'false');
    }
  }

  private pause(reset: () => void) {
    reset();
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

  hud(model: ArenaModel, clock: MatchClock, now: number, bounds: WorldBounds) {
    const { combat, mass, position } = model.player;
    element('mass').textContent = String(mass);
    element('clock').textContent = clock.mode === 'arena' ? formatTime(matchConfig.duration - clock.elapsed) : clock.mode === 'tutorial' ? 'Training' : 'Endless';
    const countdown = element('countdown');
    const remaining = matchConfig.duration - clock.elapsed;
    const message = clock.countdown > 0 ? String(Math.ceil(clock.countdown)) :
      clock.mode === 'arena' && clock.elapsed < 0.85 ? 'GO' :
      clock.mode === 'arena' && remaining > 59 && remaining <= 60 ? 'FINAL MINUTE' :
      clock.mode === 'arena' && remaining <= 10 && remaining > 0 ? String(Math.ceil(remaining)) : '';
    if (countdown.textContent !== message) {
      if (message === 'GO') this.audio.play('start');
      else if (Number(message) > 0) this.audio.play(clock.countdown > 0 ? 'countdown' : 'final');
      countdown.textContent = message;
    }
    countdown.hidden = !message;
    element<HTMLProgressElement>('energy').value = combat.energy;
    element('energy-readout').textContent = combat.energy + '%';
    const attack = element('attack');
    attack.dataset.ready = String(combat.energy === 100 && combat.attack.phase !== 'cooldown');
    attack.textContent = combat.attack.phase === 'armed' ? 'Release' :
      combat.attack.phase === 'warning' ? 'Firing' : combat.attack.phase === 'cooldown' ? 'Cooling' : 'Attack';
    const tutorial = model.tutorial;
    element('tutorial-task').textContent = tutorial?.instruction ?? '';
    element('ranking').hidden = Boolean(tutorial);
    if (tutorial?.completed && !this.progress.tutorialDone) {
      this.progress.tutorialDone = true;
      saveProgress(this.progress);
    }
    const signal = model.signal;
    let tip = '';
    if (signal) {
      const angle = Math.atan2(signal.y - position.y, signal.x - position.x);
      const arrow = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][(Math.round(angle / (Math.PI / 4)) + 8) % 8];
      tip = 'Salvage signal ' + arrow + ' ' + Math.round(Math.hypot(signal.x - position.x, signal.y - position.y)) + ' m';
    }
    element('status').textContent = [
      this.feedback && this.feedback.until > now ? this.feedback.label : '',
      combat.heat >= 1 ? 'Overheated' : combat.heat > 0 ? 'Heat ' + Math.round(combat.heat * 100) + '%' : '',
      combat.brittle ? 'Brittle' : '', combat.corrosion === 'acid' ? 'Acid corrosion' : combat.corrosion ? 'Water corrosion' : '', tip,
    ].filter(Boolean).join(' · ');
    if (now - this.lastHud > 180) {
      this.lastHud = now;
      this.navigation.render(model, bounds);
      const rows = this.rows(model);
      const ranking = rows.join('\n');
      if (ranking !== this.rankingText) {
        this.rankingText = ranking;
        this.list('ranking', rows);
      }
    }
  }

  private rows(model: ArenaModel) {
    return rankings(model.participants).map(({ place, participant }) =>
      place + '  ' + names[participant.id].padEnd(7) + String(participant.mass).padStart(5));
  }

  private list(id: string, rows: string[]) {
    element(id).replaceChildren(...rows.map((text) => {
      const row = document.createElement('li');
      row.textContent = text;
      return row;
    }));
  }

  results(model: ArenaModel, clock: MatchClock) {
    const { player } = model;
    const place = rankings(model.participants).find(({ participant }) => participant === player)!.place;
    const record = clock.mode === 'arena' ? 'arenaMass' : 'endlessMass';
    const best = player.combat.highest > this.progress[record];
    this.progress[record] = Math.max(this.progress[record], player.combat.highest);
    if (clock.mode === 'arena') {
      this.progress.placement = Math.min(place, this.progress.placement || Infinity);
      this.progress.completed++;
      if (place === 1) this.progress.victories++;
    }
    this.progress.collected += player.combat.resourceMass + player.combat.salvage;
    saveProgress(this.progress);
    this.duringSession = false;
    this.setGameVisible(false);
    this.show('results');
    const summary = clock.mode === 'endless' ? 'Endless session' :
      place === 1 ? 'Victory' : place === 2 ? 'Second place' : place === 3 ? 'Third place' : 'Place ' + place;
    element('result-summary').textContent = summary + ' · ' + player.mass + ' mass' + (best ? ' · Personal best' : '');
    this.list('result-ranking', this.rows(model));
    const stats = element('result-stats');
    stats.replaceChildren();
    void import('./result-stats').then(({ renderResultStats }) => renderResultStats(stats, player));
    if (best) this.audio.play('best');
    else this.audio.play(clock.mode === 'arena' ? (place === 1 ? 'victory' : 'defeat') : 'results');
  }
}
