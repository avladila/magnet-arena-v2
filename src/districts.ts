import { arena } from './config';

export const districts = [
  { name: 'Central Assembly Yard', x: 7680, y: 5000, accent: 0x326a61, mark: 'assembly' },
  { name: 'Northern Foundry', x: 7700, y: 1940, accent: 0xaa5738, mark: 'foundry' },
  { name: 'Eastern Recycling Depot', x: 12100, y: 5000, accent: 0x548458, mark: 'recycling' },
  { name: 'Southern Cooling Plant', x: 7750, y: 8030, accent: 0x3c819d, mark: 'cooling' },
  { name: 'Western Chemical Works', x: 3300, y: 5000, accent: 0x786141, mark: 'chemical' },
  { name: 'Outer Salvage Fields', x: 12900, y: 8280, accent: 0x777381, mark: 'salvage' },
] as const;

export function districtAt(x: number, y: number) {
  if (x < 1450 || x > arena.width - 1450 || y < 1050 || y > arena.height - 1050) return districts[5];
  return districts.reduce((closest, district) =>
    Math.hypot(x - district.x, y - district.y) < Math.hypot(x - closest.x, y - closest.y) ? district : closest);
}
