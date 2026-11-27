import { hazardConfig } from './competition-config';
import type { Hazard, HazardKind } from './hazards';
import type { ArenaModel } from './arena-model';
import { addMass } from './growth';
import { clampToArena, type Point } from './movement';
import { resourceKind, type ResourceKind } from './particles';

export class Tutorial {
  private stage = 0;
  private baseline = 20;
  private origin: Point;
  private nextSlot = 0;
  private nextResource = 0;
  readonly dummy;
  completed = false;
  private station?: Hazard;
  private stop = 0;
  private stationLoss = 0;
  private readonly stations: readonly HazardKind[] = ['flux', 'heat', 'water', 'acid', 'cold'];

  constructor(private readonly model: ArenaModel) {
    this.origin = { ...model.player.position };
    this.dummy = model.bots[0];
    this.dummy.position = { x: this.origin.x + 530, y: this.origin.y - 190 };
    addMass(this.dummy, 155);
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
      this.stop === 0 ? 'Touch the Flux device. It strips mass from larger magnets.'
        : 'Enter the heat bay. Heat shrinks your pull field.',
      ['Stay in the water pool until it corrodes your shell.',
       'Stay in the acid pool until it strips shell mass.',
       'Stay inside the cryo vent until your shell becomes BRITTLE.'][this.stop - 2],
      'Training complete. Open Pause to return to the menu.',
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
      this.placeStation();
    } else if ((this.stage === 7 || this.stage === 8) && this.station) {
      const site = this.station;
      const inside = Math.hypot(player.position.x - site.x, player.position.y - site.y) <= player.radius + site.radius;
      const experienced = site.kind === 'flux' || (site.kind === 'heat' ? state.heat >= 0.14
        : site.kind === 'cold' ? state.brittle : state.corrosion === site.kind && state.lostToHazards > this.stationLoss);
      if (!inside || !experienced) return;
      this.stop++;
      if (this.stop >= this.stations.length) {
        this.stage = 9;
        this.completed = true;
      } else {
        this.stage = this.stop < 2 ? 7 : 8;
        this.placeStation();
      }
    }
  }

  private placeStation(): void {
    const kind = this.stations[this.stop];
    const { position } = this.model.player;
    const radius = hazardConfig[kind].radius;
    this.stationLoss = this.model.player.combat.lostToHazards;
    this.station = {
      kind, radius, ...clampToArena({ x: position.x + 280, y: position.y }, radius),
      readyAt: 0, contacts: new Set(), victims: new Map(),
    };
    this.model.hazards!.sites.push(this.station);
  }

  private place(kind: ResourceKind, x: number, y: number): void {
    while (resourceKind(this.nextResource) !== kind) this.nextResource++;
    const slot = this.model.particles.slots[this.nextSlot++];
    Object.assign(slot, { x, y, resourceId: this.nextResource++, state: 'active', colorIndex: this.nextSlot % 10 });
  }
}
