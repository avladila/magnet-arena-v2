import { cssColor, themes, type ThemeMode } from './theme';

const storageKey = 'magnet-theme';
type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export class ThemePreference {
  private mode: ThemeMode = 'light';

  constructor(private readonly storage?: ThemeStorage) {
    try {
      if (storage?.getItem(storageKey) === 'dark') this.mode = 'dark';
    } catch {
      // The default remains usable in browsers that block storage.
    }
  }

  get current(): ThemeMode {
    return this.mode;
  }

  get palette() {
    return themes[this.mode];
  }

  toggle(): void {
    this.mode = this.mode === 'light' ? 'dark' : 'light';
    try {
      this.storage?.setItem(storageKey, this.mode);
    } catch {
      // Retain the choice in memory for the session.
    }
  }
}

export function localThemePreference(): ThemePreference {
  try {
    return new ThemePreference(window.localStorage);
  } catch {
    return new ThemePreference();
  }
}

export function applyThemeToPage(button: HTMLButtonElement, theme: ThemePreference): void {
  const root = document.documentElement;
  root.dataset.theme = theme.current;
  const background = cssColor(theme.palette.arena.background);
  root.style.setProperty('--arena-background', background);
  for (const [name, value] of Object.entries(theme.palette.ui)) {
    root.style.setProperty(name, value);
  }
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', background);
  button.setAttribute('aria-pressed', String(theme.current === 'dark'));
}

export function bindThemeToggle(button: HTMLButtonElement, onToggle: () => void): () => void {
  const subscriptions = new AbortController();
  const options = { signal: subscriptions.signal };
  // This button sits inside the arena. Keep its pointers out of arena steering
  // while retaining the native button activation and focus behavior.
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, (event) => event.stopPropagation(), options);
  }

  // A second finger can press the button while the first steers. Browsers
  // may omit the native click for this non-primary touch.
  let secondaryTouch: number | undefined;
  let handledTouch: number | undefined;
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerId === handledTouch) handledTouch = undefined;
    if (event.pointerType === 'touch' && !event.isPrimary) secondaryTouch ??= event.pointerId;
  }, options);
  button.addEventListener('pointerup', (event) => {
    if (secondaryTouch === undefined || secondaryTouch !== event.pointerId) return;
    secondaryTouch = undefined;
    handledTouch = event.pointerId;
    const { left, top, right, bottom } = button.getBoundingClientRect();
    if (event.clientX >= left && event.clientX < right && event.clientY >= top && event.clientY < bottom) {
      onToggle();
    }
  }, options);
  const clearPress = (event: PointerEvent) => {
    if (event.pointerId === secondaryTouch) secondaryTouch = undefined;
  };
  button.addEventListener('pointercancel', clearPress, options);
  button.addEventListener('lostpointercapture', clearPress, options);
  button.addEventListener('pointerleave', clearPress, options);
  button.addEventListener('click', (event) => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType === 'touch' && pointer.pointerId === handledTouch) {
      handledTouch = undefined;
      return;
    }
    onToggle();
  }, options);
  return () => subscriptions.abort();
}
