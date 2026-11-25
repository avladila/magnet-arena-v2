export class GameAudio {
  private context?: AudioContext;
  volume = 0.45;
  private track?: HTMLAudioElement;
  private musicLevel = 0.28;
  private playing = false;

  setMusic(volume: number): void {
    this.musicLevel = volume;
    if (this.track) this.track.volume = volume;
    this.playMusic(this.playing);
  }

  playMusic(playing: boolean): void {
    this.playing = playing;
    if (!playing || this.musicLevel === 0) {
      this.track?.pause();
      return;
    }
    if (!this.track) {
      this.track = new Audio(import.meta.env.BASE_URL + 'soundtrack.ogg');
      this.track.loop = true;
      this.track.volume = this.musicLevel;
    }
    void this.track.play().catch(() => undefined);
  }

  unlock(): void {
    if (this.volume === 0 || typeof AudioContext === 'undefined') return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  play(cue: 'scrap' | 'gold' | 'ready' | 'pulse' | 'hit' | 'results'): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.volume === 0) return;
    const cues = {
      scrap: [520, 680, 0.055], gold: [740, 1200, 0.18], ready: [420, 960, 0.3],
      pulse: [180, 65, 0.18], hit: [92, 42, 0.24], results: [480, 640, 0.45],
    };
    const [from, to, duration] = cues[cue];
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    oscillator.type = cue === 'pulse' || cue === 'hit' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(Math.max(0.001, 0.12 * this.volume), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
