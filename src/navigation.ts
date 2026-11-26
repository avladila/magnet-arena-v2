import { brand } from './brand';
import type { ArenaModel } from './arena-model';
import { arena } from './config';
import { districtAt, districts } from './districts';
import type { WorldBounds } from './particles';

export class Navigation {
  private readonly canvas = document.querySelector<HTMLCanvasElement>('#minimap')!;
  private readonly toggle = document.querySelector<HTMLButtonElement>('#map-toggle')!;
  private readonly district = document.querySelector<HTMLElement>('#district')!;

  constructor() {
    this.toggle.addEventListener('click', () => {
      this.canvas.hidden = !this.canvas.hidden;
      this.toggle.setAttribute('aria-expanded', String(!this.canvas.hidden));
      document.querySelector<HTMLElement>('#arena')?.focus({ preventScroll: true });
    });
  }

  render(model: ArenaModel, bounds: WorldBounds): void {
    const { position } = model.player;
    const name = districtAt(position.x, position.y).name;
    if (this.district.textContent !== name) this.district.textContent = name;
    if (this.canvas.hidden) return;
    const context = this.canvas.getContext('2d');
    if (!context) return;
    const { width, height } = this.canvas;
    context.clearRect(0, 0, width, height);
    const place = (worldX: number, worldY: number, radius: number, color: string) => {
      const x = 7 + (width - 14) * worldX / arena.width;
      const y = 7 + (height - 14) * worldY / arena.height;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    };
    for (const district of districts) place(district.x, district.y, 6, '#' + district.accent.toString(16).padStart(6, '0'));
    for (const bot of model.bots) {
      const { x, y } = bot.position;
      if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
        place(x, y, 2.8, '#' + bot.accent.toString(16).padStart(6, '0'));
      }
    }
    if (model.signal) place(model.signal.x, model.signal.y, 5, brand.legacy.navigation.color2);
    place(position.x, position.y, 4, brand.legacy.navigation.color3);
  }
}
