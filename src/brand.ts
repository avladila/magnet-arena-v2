import tokens from '../brand/tokens.json';

export const brand = tokens;
export const color = (hex: string): number => Number.parseInt(hex.slice(1), 16);

export function installBrand(root: HTMLElement): void {
  for (const [name, value] of Object.entries(brand.legacy.css)) {
    root.style.setProperty('--legacy-' + name, value);
  }
  for (const [name, value] of Object.entries(brand.roles)) {
    root.style.setProperty('--brand-' + name, value);
  }
}
