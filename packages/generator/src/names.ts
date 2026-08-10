import { SeededRng } from './rng.js';
import { cyc } from './fiction.js';

const FIRST = ['Avery', 'Riley', 'Jordan', 'Morgan', 'Casey', 'Dana', 'Reese', 'Quinn', 'Skyler', 'Tatum', 'Rowan', 'Emerson', 'Marley', 'Finley', 'Harper', 'Kendall'];
const LAST = ['Okafor', 'Vance', 'Iyer', 'Lindqvist', 'Moreau', 'Castillo', 'Novak', 'Berg', 'Tanaka', 'Reyes', 'Kowalski', 'Haddad', 'Nilsen', 'Oyelaran', 'Petrov', 'Silva'];
const OUTLETS = ['Daily Ledger', 'The Meridian Post', 'Harbor City Gazette', 'Northline Bulletin', 'The Vantage', 'Signal Courier', 'Aster Review', 'Continental Wire'];
const ORGS = ['Bureau of Records', 'Standards Authority', 'Meridian Labs', 'Civic Data Office', 'Northline Institute', 'Atlas Registry'];

export function authorName(index: number): string {
  const f = cyc(FIRST, index);
  const l = cyc(LAST, Math.floor(index / FIRST.length));
  return `${f} ${l}`;
}

export function outletName(index: number): string {
  return cyc(OUTLETS, index);
}

export function orgName(index: number): string {
  return cyc(ORGS, index);
}

export function handleFromAuthor(name: string, rng: SeededRng): string {
  return '@' + name.toLowerCase().replace(/\s+/g, '_') + rng.int(10, 99);
}
