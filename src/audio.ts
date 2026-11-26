import { brand } from './brand';
import type { HazardKind } from './hazards';

type Cue = keyof typeof brand.sound.cues;
const ambient: Record<HazardKind, { cue: Cue; pace: number }> = {
  heat: { cue: 'ambient-heat', pace: 1.72 },
  water: { cue: 'ambient-water', pace: 1.35 },
  acid: { cue: 'ambient-acid', pace: 1.25 },
  cold: { cue: 'ambient-cold', pace: 2.05 },
  flux: { cue: 'ambient-flux', pace: 1.5 },
};
const textures: Partial<Record<Cue, [number, number, number]>> = {
  scrap: [3420, 0.13, 0.05], gold: [3030, 0.10, 0.10], energy: [1780, 0.22, 0.11],
  arm: [1240, 0.22, 0.11], pulse: [1520, 0.37, 0.15], miss: [1110, 0.22, 0.13],
  guarded: [3680, 0.18, 0.09], core: [2860, 0.21, 0.13],
  hit: [2210, 0.26, 0.11], impact: [1210, 0.45, 0.19], fracture: [860, 0.53, 0.31],
  landing: [1200, 0.10, 0.075], splash: [1640, 0.22, 0.11],
  overheat: [540, 0.16, 0.23], corrosion: [1800, 0.22, 0.12], flux: [1850, 0.22, 0.16],
  'ambient-heat': [260, 0.18, 0.29], 'ambient-water': [1250, 0.17, 0.13],
  'ambient-acid': [645, 0.10, 0.12], 'ambient-cold': [355, 0.14, 0.27], 'ambient-flux': [1890, 0.14, 0.10],
};
const falling = new Set<Cue>(['pulse', 'hit', 'impact', 'fracture', 'miss', 'core', 'landing', 'splash']);
const rising = new Set<Cue>(['energy', 'arm', 'ready']);
const scrapPitch = [0, 3, 0, 5, -2, 2];

export class GameAudio {
  private context?: AudioContext;
  private bus?: GainNode;
  private noise?: AudioBuffer;
  private effectsLevel = 0.45;
  private masterLevel = 0.8;
  private musicLevel = 0.28;
  private track?: HTMLAudioElement;
  private playing = false;
  private unlocked = false;
  private active = 0;
  private click = 0;
  private nextAmbient = 0;

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
        const context = this.context = new AudioContext();
        this.bus = context.createGain();
        this.bus.connect(context.destination);
        const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.34), context.sampleRate);
        const data = buffer.getChannelData(0);
        let seed = 15121;
        for (let i = 0; i < data.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          data[i] = seed / 2 ** 31 - 1;
        }
        this.noise = buffer;
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    }
    this.sync();
  }

  visibilityChanged(): void { this.sync(); }

  environment(kind: HazardKind, distance: number): void {
    const context = this.context;
    if (!context || !this.playing || context.currentTime < this.nextAmbient || distance >= 330) return;
    const sound = ambient[kind];
    if (this.play(sound.cue, 0.25 * (1 - distance / 330) ** 1.5)) this.nextAmbient = context.currentTime + sound.pace;
  }

  play(cue: Cue, strength = 1): boolean {
    const ctx = this.context;
    const bus = this.bus;
    if (!ctx || !bus || ctx.state !== 'running' || bus.gain.value === 0 || document.hidden || this.active >= 10) return false;
    const [root, milliseconds, timbre, pair] = brand.sound.cues[cue] as [number, number, OscillatorType, number];
    const duration = milliseconds / 1000;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const offset = cue === 'scrap' ? scrapPitch[this.click++ % scrapPitch.length] : 0;
    const hz = 440 * 2 ** ((root + offset - 69) / 12);
    const level = brand.sound.level * strength * (cue === 'scrap' ? 0.65 : cue === 'fracture' ? 1.22 : 1);
    oscillator.type = timbre;
    oscillator.frequency.setValueAtTime(hz, now);
    if (rising.has(cue)) oscillator.frequency.exponentialRampToValueAtTime(hz * 1.65, now + duration * 0.73);
    else if (falling.has(cue)) oscillator.frequency.exponentialRampToValueAtTime(hz * 0.53, now + duration * 0.87);
    else if (pair) oscillator.frequency.setValueAtTime(hz * 2 ** (brand.sound.interval / 12), now + duration * 0.44);
    this.envelope(envelope, now, duration, level, cue === 'arm' ? 0.52 : 0.035);
    oscillator.connect(envelope).connect(bus);
    oscillator.start(now);
    oscillator.stop(now + duration);
    this.active++;
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.active--;
    }, { once: true });

    const texture = textures[cue];
    if (texture && this.noise) {
      const [cut, volume, life] = texture;
      const noise = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      noise.buffer = this.noise;
      filter.type = cut < 900 ? 'lowpass' : 'bandpass';
      filter.frequency.setValueAtTime(cut, now);
      filter.Q.value = 1.25;
      if (falling.has(cue)) filter.frequency.exponentialRampToValueAtTime(cut * 0.38, now + life);
      this.envelope(gain, now, life, volume * level, cue === 'arm' ? 0.47 : 0.041);
      noise.connect(filter).connect(gain).connect(bus);
      noise.start(now);
      noise.stop(now + life);
      noise.addEventListener('ended', () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); }, { once: true });
    }
    if (cue === 'gold' || cue === 'ready' || cue === 'fracture') {
      const metal = ctx.createOscillator();
      const ring = ctx.createGain();
      const start = now + duration * (cue === 'fracture' ? 0.16 : 0.25);
      const time = duration * 0.74;
      metal.type = cue === 'fracture' ? 'triangle' : 'sine';
      metal.frequency.value = hz * (cue === 'fracture' ? 4.35 : 3.01);
      this.envelope(ring, start, time, level * 0.32, 0.055);
      metal.connect(ring).connect(bus);
      metal.start(start);
      metal.stop(start + time);
      metal.addEventListener('ended', () => { metal.disconnect(); ring.disconnect(); }, { once: true });
    }
    return true;
  }

  private envelope(node: GainNode, now: number, duration: number, level: number, attack: number): void {
    node.gain.setValueAtTime(0.0001, now);
    node.gain.linearRampToValueAtTime(Math.max(0.0002, level), now + duration * attack);
    node.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  }
}
