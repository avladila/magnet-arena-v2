import { brand, color } from './brand';
import type { scrapConfig } from './config';

export type ThemeMode = 'light' | 'dark';

export type ThemePalette = {
  arena: { background: number; grid: number; markings: number };
  field: { edge: number; pulse: number };
  scrap: readonly number[] & { length: typeof scrapConfig.colorCount };
  scrapHighlight: number;
  ui: Readonly<Record<`--${string}`, string>>;
};

function palette(mode: ThemeMode): ThemePalette {
  const theme = brand.themes[mode];
  return {
    arena: { background: color(theme.background), grid: color(theme.floor), markings: color(theme.markings) },
    field: { edge: color(theme.focus), pulse: color(theme.focus) },
    scrap: theme.scrap.map(color) as number[] & { length: 10 },
    scrapHighlight: color(brand.steel[0]),
    ui: {
      '--hud-text': theme.ink, '--hud-surface': theme.surface, '--hud-border': theme.markings,
      '--hud-focus': theme.focus, '--title-accent': brand.roles.coral,
      '--joystick-outline': theme.focus + '80', '--joystick-surface': theme.surface + '66',
      '--joystick-knob': theme.focus, '--joystick-rim': theme.surface,
    },
  };
}

export const themes = { light: palette('light'), dark: palette('dark') };

export function cssColor(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}
