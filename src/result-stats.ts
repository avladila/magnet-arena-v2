import { physicalScaleForMass } from './growth';
import type { Participant } from './movement';

export function renderResultStats(container: HTMLElement, { mass, combat }: Participant): void {
  const fields = {
    'Final mass': mass, 'Peak mass': combat.highest,
    'Maximum scale': physicalScaleForMass(combat.highest).toFixed(2) + '×',
    'Ordinary scrap': combat.ordinary, 'Gold scrap': combat.gold, 'Energy cells': combat.cells,
    'Successful attacks': combat.hits, 'Missed attacks': combat.misses, 'Guarded attacks': combat.guarded,
    'Protected-core attacks': combat.protectedHits, 'Mass detached': combat.detached,
    'Largest single theft': combat.largestTheft, 'Largest diameter reduction': (combat.largestReduction * 100).toFixed(1) + '%',
    'Salvage collected': combat.salvage, 'Salvage from your attacks': combat.ownSalvage, 'Own salvage reclaimed': combat.reclaimedSalvage,
    'Lost to rivals': combat.lostToTheft, 'Lost to hazards': combat.lostToHazards,
  };
  const content = document.createDocumentFragment();
  for (const [label, value] of Object.entries(fields)) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = String(value);
    content.append(term, description);
  }
  container.replaceChildren(content);
}
