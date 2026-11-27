import tokens from '../brand/tokens.json';

export const brand = tokens;
export const color = (hex: string): number => Number.parseInt(hex.slice(1), 16);

export function installBrand(root: HTMLElement): void {
  root.style.setProperty('--brand-ink', brand.themes.light.ink);
  root.style.setProperty('--brand-menu-time', brand.motion.menu + 'ms');
  root.style.setProperty('--brand-snap', 'cubic-bezier(' + brand.motion.snap.join(',') + ')');
  for (const radius of brand.grid.radii) root.style.setProperty('--brand-radius-' + radius, radius + 'px');
  for (const [name, value] of Object.entries(brand.legacy.css)) {
    root.style.setProperty('--legacy-' + name, value);
  }
  for (const [name, value] of Object.entries(brand.roles)) {
    root.style.setProperty('--brand-' + name, value);
  }
  for (const [name, value] of Object.entries(brand.arcade)) {
    root.style.setProperty('--arcade-' + name, value);
  }
}
