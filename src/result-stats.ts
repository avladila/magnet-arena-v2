import { physicalScaleForMass } from './growth';
import { overloadLabels } from './competition-config';
import type { FinalStanding, MatchResult } from './match-result';

export function renderResultStats(container: HTMLElement, { mass, combat, highestStage, survivalPoints }: FinalStanding, result: MatchResult): void {
  const { bestPlace, detonation, interruptions } = result;
  const winner = result.standings.find(p => p.id === result.winnerId);
  const groups = {
    Growth: {
      'Best rank': bestPlace === undefined ? '—' : '#' + bestPlace,
      'Final mass': mass, 'Peak mass': combat.highest,
      'Maximum scale': physicalScaleForMass(combat.highest).toFixed(2) + '×',
      ...(result.mode !== 'tutorial' && { 'Highest overload stage': overloadLabels[highestStage] }),
    },
    ...(result.mode === 'arena' && { Finale: {
      'Winner': winner?.name ?? '—', 'Ending': detonation ? 'Critical Mass' : 'Time limit',
      'Detonations': detonation ? 1 : 0, 'Countdown interruptions': interruptions.length,
      ...(detonation && { 'Destroyed competitors': detonation.destroyed, 'Surviving competitors': detonation.survived,
        'Survival points': survivalPoints ?? 0 }),
    } }),
    Combat: {
      'Successful attacks': combat.hits, 'Missed attacks': combat.misses, 'Guarded attacks': combat.guarded,
      'Protected-core attacks': combat.protectedHits, 'Larger rivals damaged': combat.largerVictims,
      'Mass detached': combat.detached, 'Largest single theft': combat.largestTheft,
      'Largest diameter reduction': (combat.largestReduction * 100).toFixed(1) + '%',
    },
    Salvage: {
      'Salvage collected': combat.salvage, 'Salvage from your attacks': combat.ownSalvage,
      'Own salvage reclaimed': combat.reclaimedSalvage,
    },
    Recovery: {
      'Best recovery after theft': combat.bestRecovery, 'Lost to rivals': combat.lostToTheft, 'Lost to hazards': combat.lostToHazards,
    },
    Collection: { 'Ordinary scrap': combat.ordinary, 'Gold scrap': combat.gold, 'Energy cells': combat.cells },
  };
  const content = document.createDocumentFragment();
  for (const [title, fields] of Object.entries(groups)) {
    const group = document.createElement('section');
    const heading = document.createElement('h3');
    const list = document.createElement('dl');
    heading.className = 'section-heading';
    heading.textContent = title;
    for (const [label, value] of Object.entries(fields)) {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = String(value);
      list.append(term, description);
    }
    group.append(heading, list);
    content.append(group);
  }
  container.replaceChildren(content);
}
