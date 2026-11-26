import { physicalScaleForMass } from './growth';
import type { Participant } from './movement';

export function renderResultStats(container: HTMLElement, { mass, combat }: Participant, bestPlace?: number): void {
  const fields = {
    'Best rank': bestPlace === undefined ? '—' : '#' + bestPlace,
    'Final mass': mass, 'Peak mass': combat.highest,
    'Largest single theft': combat.largestTheft, 'Largest diameter reduction': (combat.largestReduction * 100).toFixed(1) + '%',
    'Salvage from your attacks': combat.ownSalvage,
    'Larger rivals damaged': combat.largerVictims.size, 'Best recovery after theft': combat.bestRecovery,
    'Maximum scale': physicalScaleForMass(combat.highest).toFixed(2) + '×',
    'Ordinary scrap': combat.ordinary, 'Gold scrap': combat.gold, 'Energy cells': combat.cells,
    'Successful attacks': combat.hits, 'Missed attacks': combat.misses, 'Guarded attacks': combat.guarded,
    'Protected-core attacks': combat.protectedHits, 'Mass detached': combat.detached,
    'Salvage collected': combat.salvage, 'Own salvage reclaimed': combat.reclaimedSalvage,
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
