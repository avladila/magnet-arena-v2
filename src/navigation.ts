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
    const critical = model.critical;
    const warning = critical?.warning;
    const claimant = critical?.claim?.actor ?? critical?.blast?.winner;
    if (this.canvas.dataset.claimant !== claimant?.id) {
      if (claimant) this.canvas.dataset.claimant = claimant.id;
      else delete this.canvas.dataset.claimant;
      this.canvas.setAttribute('aria-label', claimant ? `Arena map with blast center and danger area for ${claimant.name}` :
        'Arena map with your position, nearby opponents and public salvage signal');
    }
    if (this.canvas.hidden) return;
    const context = this.canvas.getContext('2d');
    if (!context) return;
    const { width, height } = this.canvas;
    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    context.strokeStyle = brand.arcade.steel;
    context.globalAlpha = 0.42;
    context.strokeRect(7, 7, width - 14, height - 14);
    context.globalAlpha = 1;
    const screenX = (x: number) => 7 + (width - 14) * x / arena.width;
    const screenY = (y: number) => 7 + (height - 14) * y / arena.height;
    const place = (worldX: number, worldY: number, radius: number, color: string) => {
      context.beginPath();
      context.arc(screenX(worldX), screenY(worldY), radius, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    };
    context.globalAlpha = 0.52;
    for (const district of districts) {
      context.fillStyle = '#' + district.accent.toString(16).padStart(6, '0');
      context.fillRect(screenX(district.x) - 4, screenY(district.y) - 4, 8, 8);
    }
    context.globalAlpha = 1;
    for (const bot of model.bots) {
      const { x, y } = bot.position;
      if (bot !== claimant && !critical?.removed(bot) && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
        place(x, y, 2.8, '#' + bot.accent.toString(16).padStart(6, '0'));
      }
    }
    if (warning && critical) {
      const x = screenX(warning.center.x);
      const y = screenY(warning.center.y);
      const radius = critical.rules.radius;
      context.save();
      context.beginPath();
      context.rect(7, 7, width - 14, height - 14);
      context.clip();
      context.beginPath();
      context.ellipse(x, y, radius * ((width - 14) / arena.width), radius * ((height - 14) / arena.height), 0, 0, Math.PI * 2);
      context.fillStyle = brand.arcade.red;
      context.globalAlpha = .28;
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = brand.arcade.orange;
      context.lineWidth = 2;
      context.stroke();
      place(warning.center.x, warning.center.y, 4, brand.arcade.yellow);
      context.restore();
    } else if (model.signal) {
      const x = screenX(model.signal.x);
      const y = screenY(model.signal.y);
      context.strokeStyle = brand.arcade.yellow;
      context.beginPath();
      context.moveTo(x, y - 7);
      context.lineTo(x + 7, y);
      context.lineTo(x, y + 7);
      context.lineTo(x - 7, y);
      context.closePath();
      context.stroke();
    }
    if (critical?.removed(model.player)) return;
    context.save();
    context.translate(screenX(position.x), screenY(position.y));
    context.rotate(model.player.heading);
    context.fillStyle = brand.arcade.white;
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-4, -4.5);
    context.lineTo(-2, 0);
    context.lineTo(-4, 4.5);
    context.closePath();
    context.fill();
    context.restore();
  }
}
