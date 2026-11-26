import type { Difficulty } from './match';

const key = 'magnet.progress.v1';
export type Quality = 'low' | 'balanced' | 'high';
const defaults = {
  arenaMass: 0, endlessMass: 0, placement: 0, completed: 0, victories: 0, collected: 0,
  difficulty: 'normal' as Difficulty, quality: 'balanced' as Quality, volume: 45, music: 28, master: 80, reducedMotion: false, haptics: true, tutorialDone: false,
};

export function loadProgress() {
  const progress = { ...defaults };
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? '{}');
    for (const field of ['arenaMass', 'endlessMass', 'placement', 'completed', 'victories', 'collected'] as const) {
      if (Number.isSafeInteger(data[field]) && data[field] >= 0) progress[field] = data[field];
    }
    if (['low', 'balanced', 'high'].includes(data.quality)) progress.quality = data.quality;
    if (['easy', 'normal', 'hard'].includes(data.difficulty)) progress.difficulty = data.difficulty;
    for (const field of ['volume', 'music', 'master'] as const) {
      if (typeof data[field] === 'number' && data[field] >= 0 && data[field] <= 100) progress[field] = data[field];
    }
    for (const field of ['reducedMotion', 'haptics', 'tutorialDone'] as const) {
      if (typeof data[field] === 'boolean') progress[field] = data[field];
    }
  } catch {
    // Storage may be unavailable or contain malformed data.
  }
  return progress;
}

export function saveProgress(progress: ReturnType<typeof loadProgress>): void {
  try {
    localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    // Keep the session playable without persistence.
  }
}

export function clearProgress() {
  const progress = { ...defaults };
  saveProgress(progress);
  return progress;
}
