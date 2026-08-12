import { SeededRng } from './rng.js';

export interface SiteIdentity {
  name: string;
  domain: string;
}

const FIRST = ['Avery', 'Riley', 'Jordan', 'Morgan', 'Casey', 'Dana', 'Reese', 'Quinn', 'Skyler', 'Tatum', 'Rowan', 'Emerson', 'Marley', 'Finley', 'Harper', 'Kendall'];
const LAST = ['Okafor', 'Vance', 'Iyer', 'Lindqvist', 'Moreau', 'Castillo', 'Novak', 'Berg', 'Tanaka', 'Reyes', 'Kowalski', 'Haddad', 'Nilsen', 'Oyelaran', 'Petrov', 'Silva'];

export const FORUM_SITE: SiteIdentity = { name: 'Threadhouse', domain: 'threadhouse.net' };

export const OUTLETS_BY_TYPE: Record<'wire' | 'broadsheet' | 'tabloid' | 'aggregator' | 'content_farm', SiteIdentity[]> = {
  wire: [{ name: 'Continental Wire Service', domain: 'continentalwire.com' }],
  broadsheet: [
    { name: 'Daily Ledger', domain: 'dailyledger.com' },
    { name: 'The Meridian Post', domain: 'meridianpost.com' },
    { name: 'Harbor City Gazette', domain: 'harborcitygazette.com' },
    { name: 'Northline Bulletin', domain: 'northlinebulletin.com' },
    { name: 'Aster Review', domain: 'asterreview.com' },
    { name: 'Signal Courier', domain: 'signalcourier.com' },
    { name: 'The Vantage', domain: 'thevantage.com' },
  ],
  tabloid: [
    { name: 'Daily Blast', domain: 'dailyblast.com' },
    { name: 'The Scoop Herald', domain: 'scoopherald.com' },
    { name: 'Rumor Mill Report', domain: 'rumormillreport.net' },
  ],
  aggregator: [
    { name: 'TopicPulse', domain: 'topicpulse.com' },
    { name: 'NewsRoundr', domain: 'newsroundr.com' },
  ],
  content_farm: [
    { name: 'QuickFacts Daily', domain: 'quickfactsdaily.net' },
    { name: 'InfoSnack', domain: 'infosnack.net' },
  ],
};

export const ORGS: SiteIdentity[] = [
  { name: 'Bureau of Records', domain: 'bureauofrecords.gov' },
  { name: 'Standards Authority', domain: 'standardsauthority.org' },
  { name: 'Meridian Labs', domain: 'meridianlabs.org' },
  { name: 'Civic Data Office', domain: 'civicdataoffice.gov' },
  { name: 'Northline Institute', domain: 'northlineinstitute.com' },
  { name: 'Atlas Registry', domain: 'atlasregistry.com' },
];

export function outletForType(type: keyof typeof OUTLETS_BY_TYPE, rng: SeededRng): SiteIdentity {
  const pool = OUTLETS_BY_TYPE[type];
  return pool[rng.int(0, pool.length)] as SiteIdentity;
}

export function orgForIndex(index: number): SiteIdentity {
  return ORGS[index % ORGS.length] as SiteIdentity;
}

export function authorName(index: number): string {
  const f = FIRST[index % FIRST.length] as string;
  const l = LAST[Math.floor(index / FIRST.length) % LAST.length] as string;
  return `${f} ${l}`;
}

export function handleFromAuthor(name: string, rng: SeededRng): string {
  return '@' + name.toLowerCase().replace(/\s+/g, '_') + rng.int(10, 99);
}
