import { brand } from './brand';

type Cue = keyof typeof brand.sound.cues;

export class GameAudio {
  private context?: AudioContext;
  private bus?: GainNode;
  private effectsLevel = 0.45;
  private masterLevel = 0.8;
  private musicLevel = 0.28;
  private track?: HTMLAudioElement;
  private playing = false;
  private unlocked = false;

  get volume(): number { return this.effectsLevel; }
  set volume(volume: number) { this.effectsLevel = volume; this.sync(); }

  setMaster(volume: number): void { this.masterLevel = volume; this.sync(); }
  setMusic(volume: number): void { this.musicLevel = volume; this.sync(); }

  playMusic(playing: boolean): void {
    this.playing = playing;
    this.sync();
  }

  private sync(): void {
    const audible = !document.hidden && this.unlocked;
    if (this.bus) this.bus.gain.value = audible ? this.masterLevel * this.effectsLevel : 0;
    const musicGain = this.masterLevel * this.musicLevel;
    if (!this.playing || !audible || musicGain === 0) {
      this.track?.pause();
      return;
    }
    if (!this.track) {
      this.track = new Audio(import.meta.env.BASE_URL + 'soundtrack.ogg');
      this.track.loop = true;
    }
    this.track.volume = musicGain;
    if (this.track.paused) void this.track.play().catch(() => undefined);
  }

  unlock(): void {
    this.unlocked = true;
    if (typeof AudioContext !== 'undefined') {
      if (!this.context) {
        this.context = new AudioContext();
        this.bus = this.context.createGain();
        this.bus.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    }
    this.sync();
  }

  visibilityChanged(): void { this.sync(); }

  play(cue: Cue): void {
    const ctx = this.context;
    if (!ctx || !this.bus || ctx.state !== 'running' || this.bus.gain.value === 0 || document.hidden) return;
    const [root, milliseconds, timbre, pair] = brand.sound.cues[cue] as [number, number, OscillatorType, number];
    const duration = milliseconds / 1000;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const hz = 440 * 2 ** ((root - 69) / 12);
    oscillator.type = timbre;
    oscillator.frequency.setValueAtTime(hz, now);
    if (pair) oscillator.frequency.setValueAtTime(hz * 2 ** (brand.sound.interval / 12), now + duration * 0.44);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(brand.sound.level, now + duration * 0.12);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(envelope).connect(this.bus);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.addEventListener('ended', () => { oscillator.disconnect(); envelope.disconnect(); }, { once: true });
  }
}
