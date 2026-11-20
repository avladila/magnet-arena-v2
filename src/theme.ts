import type { scrapConfig } from './config';

export type ThemeMode = 'light' | 'dark';

export type ThemePalette = {
  arena: { background: number; grid: number; markings: number };
  field: { edge: number; pulse: number };
  scrap: readonly number[] & { length: typeof scrapConfig.colorCount };
  scrapHighlight: number;
  ui: Readonly<Record<`--${string}`, string>>;
};

export const themes = {
  light: {
    arena: { background: 0xdef5ee, grid: 0xb7e0d5, markings: 0x79b4a8 },
    field: { edge: 0x247e77, pulse: 0x258a7e },
    scrap: [
      0x278982, 0x8055b2, 0x4574b4, 0x54824b, 0xa64286,
      0x137b92, 0xbc4770, 0x42429e, 0x0c5b3b, 0x6f416d,
    ],
    scrapHighlight: 0xf5fffa,
    ui: {
      '--hud-text': '#173f3d',
      '--hud-surface': '#f6fffa',
      '--hud-border': '#b7e0d5',
      '--hud-focus': '#237466',
      '--title-accent': '#d84a55',
      '--joystick-outline': '#23746680',
      '--joystick-surface': '#f5fffa66',
      '--joystick-knob': '#237466',
      '--joystick-rim': '#f5fffa',
    },
  },
  dark: {
    arena: { background: 0x142735, grid: 0x244454, markings: 0x47778b },
    field: { edge: 0x65d5cf, pulse: 0x75dccd },
    scrap: [
      0x38cdb4, 0xb18df3, 0x68abf6, 0x91d978, 0xe67bc5,
      0x52d5e9, 0xf08eae, 0x6879e6, 0x49bb80, 0xd0a9e8,
    ],
    scrapHighlight: 0xeaf4f7,
    ui: {
      '--hud-text': '#eaf4f7',
      '--hud-surface': '#203b49',
      '--hud-border': '#4f7988',
      '--hud-focus': '#8ae4d8',
      '--title-accent': '#f68092',
      '--joystick-outline': '#69cfc18c',
      '--joystick-surface': '#24445499',
      '--joystick-knob': '#74c9bc',
      '--joystick-rim': '#173745',
    },
  },
} as const satisfies Record<ThemeMode, ThemePalette>;

export function cssColor(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}
