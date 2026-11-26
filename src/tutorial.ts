import type { ArenaModel } from './arena-model';
import { addMass } from './growth';
import type { Point } from './movement';
import { resourceKind, type ResourceKind } from './particles';

export class Tutorial {
  private stage = 0;
  private baseline = 20;
  private origin: Point;
  private nextSlot = 0;
  private nextResource = 0;
  readonly dummy;
  completed = false;

  constructor(private readonly model: ArenaModel) {
    this.origin = { ...model.player.position };
    this.dummy = model.bots[0];
    this.dummy.position = { x: this.origin.x + 530, y: this.origin.y - 190 };
    addMass(this.dummy, 155);
    for (let i = 1; i < model.bots.length; i++) {
      model.bots[i].position = { x: 600, y: 600 + 500 * i };
    }
    for (const slot of model.particles.slots) slot.state = 'inactive';
    const sites = model.hazards!.sites;
    for (let i = sites.length - 1; i >= 0; i--) {
      if (Math.hypot(sites[i].x - this.origin.x, sites[i].y - this.origin.y) < 1500) sites.splice(i, 1);
    }
  }

  get instruction(): string {
    return [
      'Move your magnet with the mouse, WASD, or touch.',
      'Collect the scrap ahead. Your mass and field will grow.',
      'Collect the gold piece for 10 mass.',
      'Collect the red energy cells until your energy is full.',
      'Hold Space or Attack and aim at the training magnet.',
      'Release to fire at the training magnet.',
      'Collect one of the neutral salvage chunks after it lands.',
      'Flux strips large shells. Heat weakens pull. Water and acid corrode. Cryogenic vents make you brittle. Pause to return to the menu.',
    ][this.stage];
  }

  step(): void {
    const { player } = this.model;
    const state = player.combat;
    const direction = state.attack;
    if (this.stage === 0 && Math.hypot(player.position.x - this.origin.x, player.position.y - this.origin.y) > 45) {
      this.place('ordinary', player.position.x + 160, player.position.y);
      this.stage++;
    } else if (this.stage === 1 && player.mass > this.baseline) {
      this.place('gold', player.position.x + 150, player.position.y);
      this.stage++;
    } else if (this.stage === 2 && state.gold > 0) {
      for (let i = 0; i < 12; i++) this.place('energy', player.position.x + 155 + 20 * (i % 4), player.position.y + (Math.floor(i / 4) - 1) * 25);
      this.stage++;
    } else if (this.stage === 3 && state.energy === 100) {
      this.dummy.position = { x: player.position.x + 230, y: player.position.y };
      this.stage++;
    } else if (this.stage === 4 && direction.phase === 'armed') {
      this.stage++;
    } else if (this.stage === 5 && state.detached > 0) {
      this.stage++;
    } else if (this.stage === 5 && direction.phase === 'cooldown' && state.energy < 100) {
      state.energy = 100;
      this.stage = 4;
    } else if (this.stage === 6 && state.salvage > 0) {
      this.stage++;
      this.completed = true;
    }
  }

  private place(kind: ResourceKind, x: number, y: number): void {
    while (resourceKind(this.nextResource) !== kind) this.nextResource++;
    const slot = this.model.particles.slots[this.nextSlot++];
    Object.assign(slot, { x, y, resourceId: this.nextResource++, state: 'active', colorIndex: this.nextSlot % 10 });
  }
}
