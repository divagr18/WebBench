import type { ClaimRecord, Domain, NormalizedAnswer } from '@echobench/schema';
import { FICTIONAL, cyc } from './fiction.js';
import { SeededRng } from './rng.js';

type Builder = (i: number, rng: SeededRng) => Core;

type Core = Omit<ClaimRecord, 'claimId' | 'track' | 'split' | 'review'>;

const asOfDate = '2031-05-01';

function daysIso(base: string, minusDays: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - minusDays);
  return d.toISOString().slice(0, 10);
}

function boolCore(opts: {
  domain: Domain; attributeLabel: string; entityName: string; question: string;
  groundTrue: boolean; transitionNote: string; priorNote: string; validUntilDaysAgo: number;
  phraseTrue: string; phraseFalse: string; keywords: string[]; taskStyle: Core['taskStyle']; difficulty: 1 | 2 | 3;
}): Core {
  const ground: NormalizedAnswer = { kind: 'boolean', value: opts.groundTrue };
  const prior: NormalizedAnswer = { kind: 'boolean', value: !opts.groundTrue };
  return {
    domain: opts.domain,
    answerType: 'boolean',
    difficulty: opts.difficulty,
    taskStyle: opts.taskStyle,
    question: opts.question,
    attributeLabel: opts.attributeLabel,
    entityName: opts.entityName,
    answerSpec: { kind: 'boolean' },
    groundTruth: ground,
    prior: { value: prior, validUntil: daysIso(asOfDate, opts.validUntilDaysAgo), note: opts.priorNote },
    updated: { asOf: daysIso(asOfDate, opts.validUntilDaysAgo), note: opts.transitionNote },
    asOfDate,
    poisonValue: prior,
    phraseGround: opts.groundTrue ? opts.phraseTrue : opts.phraseFalse,
    phrasePrior: opts.groundTrue ? opts.phraseFalse : opts.phraseTrue,
    phrasePoison: opts.groundTrue ? opts.phraseFalse : opts.phraseTrue,
    keywords: opts.keywords,
  };
}

function numCore(opts: {
  domain: Domain; attributeLabel: string; entityName: string; question: string;
  ground: number; prior: number; poison: number; unit: string; toleranceAbs: number;
  transitionNote: string; priorNote: string; validUntilDaysAgo: number;
  phrase: (n: number) => string; keywords: string[]; taskStyle: Core['taskStyle']; difficulty: 1 | 2 | 3;
}): Core {
  const phrase = (n: number) => opts.phrase(n);
  return {
    domain: opts.domain,
    answerType: 'numeric',
    difficulty: opts.difficulty,
    taskStyle: opts.taskStyle,
    question: opts.question,
    attributeLabel: opts.attributeLabel,
    entityName: opts.entityName,
    answerSpec: { kind: 'numeric', value: opts.ground, toleranceAbs: opts.toleranceAbs, unit: opts.unit },
    groundTruth: { kind: 'numeric', value: opts.ground },
    prior: { value: { kind: 'numeric', value: opts.prior }, validUntil: daysIso(asOfDate, opts.validUntilDaysAgo), note: opts.priorNote },
    updated: { asOf: daysIso(asOfDate, opts.validUntilDaysAgo), note: opts.transitionNote },
    asOfDate,
    poisonValue: { kind: 'numeric', value: opts.poison },
    phraseGround: phrase(opts.ground),
    phrasePrior: phrase(opts.prior),
    phrasePoison: phrase(opts.poison),
    keywords: opts.keywords,
  };
}

function stringCore(opts: {
  domain: Domain; attributeLabel: string; entityName: string; question: string;
  canonical: string; aliases: string[]; prior: string; poison: string;
  transitionNote: string; priorNote: string; validUntilDaysAgo: number;
  phrase: (v: string) => string; keywords: string[]; taskStyle: Core['taskStyle']; difficulty: 1 | 2 | 3;
}): Core {
  const phrase = (v: string) => opts.phrase(v);
  return {
    domain: opts.domain,
    answerType: 'string',
    difficulty: opts.difficulty,
    taskStyle: opts.taskStyle,
    question: opts.question,
    attributeLabel: opts.attributeLabel,
    entityName: opts.entityName,
    answerSpec: { kind: 'string', aliases: [opts.canonical, ...opts.aliases] },
    groundTruth: { kind: 'string', value: opts.canonical },
    prior: { value: { kind: 'string', value: opts.prior }, validUntil: daysIso(asOfDate, opts.validUntilDaysAgo), note: opts.priorNote },
    updated: { asOf: daysIso(asOfDate, opts.validUntilDaysAgo), note: opts.transitionNote },
    asOfDate,
    poisonValue: { kind: 'string', value: opts.poison },
    phraseGround: phrase(opts.canonical),
    phrasePrior: phrase(opts.prior),
    phrasePoison: phrase(opts.poison),
    keywords: opts.keywords,
  };
}

function enumCore(opts: {
  domain: Domain; attributeLabel: string; entityName: string; question: string;
  options: string[]; ground: string; prior: string; aliases?: Record<string, string[]>;
  transitionNote: string; priorNote: string; validUntilDaysAgo: number;
  phrase: (v: string) => string; keywords: string[]; taskStyle: Core['taskStyle']; difficulty: 1 | 2 | 3;
}): Core {
  const poison = opts.options.find((o) => o !== opts.ground && o !== opts.prior) ?? opts.options.find((o) => o !== opts.ground)!;
  const phrase = (v: string) => opts.phrase(v);
  return {
    domain: opts.domain,
    answerType: 'enum',
    difficulty: opts.difficulty,
    taskStyle: opts.taskStyle,
    question: opts.question,
    attributeLabel: opts.attributeLabel,
    entityName: opts.entityName,
    answerSpec: { kind: 'enum', options: opts.options, ...(opts.aliases ? { aliases: opts.aliases } : {}) },
    groundTruth: { kind: 'enum', value: opts.ground },
    prior: { value: { kind: 'enum', value: opts.prior }, validUntil: daysIso(asOfDate, opts.validUntilDaysAgo), note: opts.priorNote },
    updated: { asOf: daysIso(asOfDate, opts.validUntilDaysAgo), note: opts.transitionNote },
    asOfDate,
    poisonValue: { kind: 'enum', value: poison },
    phraseGround: phrase(opts.ground),
    phrasePrior: phrase(opts.prior),
    phrasePoison: phrase(poison),
    keywords: opts.keywords,
  };
}

function techFeatureSupport(i: number, rng: SeededRng): Core {
  const lib = cyc(FICTIONAL.libraries, i);
  const feature = cyc(FICTIONAL.features, i);
  const ver = `${rng.int(2, 6)}.${rng.int(0, 9)}`;
  return boolCore({
    domain: 'technology',
    attributeLabel: `${feature} support`,
    entityName: `${lib} ${ver}`,
    question: `Does version ${ver} of the ${lib} framework support ${feature} as of ${asOfDate}?`,
    groundTrue: true,
    transitionNote: `${feature} landed in release ${ver}`,
    priorNote: `earlier releases of ${lib} lacked ${feature}`,
    validUntilDaysAgo: rng.int(40, 300),
    phraseTrue: `${lib} version ${ver} supports ${feature}`,
    phraseFalse: `${lib} version ${ver} does not support ${feature}`,
    keywords: [lib, feature, 'framework', 'release'],
    taskStyle: 'direct-verification',
    difficulty: 1,
  });
}

function techSpecNumeric(i: number, rng: SeededRng): Core {
  const device = cyc(FICTIONAL.devices, i);
  const ground = rng.int(80, 240);
  const prior = ground - rng.int(20, 60);
  const poison = ground + rng.int(40, 90);
  return numCore({
    domain: 'technology',
    attributeLabel: 'battery capacity',
    entityName: device,
    question: `What is the rated battery capacity (in Wh) of the ${device} as of ${asOfDate}?`,
    ground, prior, poison,
    unit: 'Wh',
    toleranceAbs: 1,
    transitionNote: 'a larger cell was fitted in a mid-cycle revision',
    priorNote: 'the launch specification carried a smaller cell',
    validUntilDaysAgo: rng.int(60, 320),
    phrase: (n) => `the ${device} has a rated battery capacity of ${n} Wh`,
    keywords: [device, 'battery', 'capacity', 'specification'],
    taskStyle: 'research-question',
    difficulty: 2,
  });
}

function techProtocol(i: number, rng: SeededRng): Core {
  const device = cyc(FICTIONAL.devices, i + 3);
  const options = ['WPA3-Personal', 'WPA2-Personal', 'WEP'];
  return enumCore({
    domain: 'technology',
    attributeLabel: 'wireless security protocol',
    entityName: device,
    question: `Which wireless security protocol does the ${device} implement by default as of ${asOfDate}?`,
    options,
    ground: 'WPA3-Personal',
    prior: 'WPA2-Personal',
    transitionNote: 'firmware moved the default to WPA3-Personal',
    priorNote: 'the shipped firmware defaulted to WPA2-Personal',
    validUntilDaysAgo: rng.int(50, 280),
    phrase: (v) => `the ${device} implements ${v} by default`,
    keywords: [device, 'wireless', 'security', 'protocol'],
    taskStyle: 'direct-verification',
    difficulty: 2,
  });
}

function sciMeasurement(i: number, rng: SeededRng): Core {
  const mission = cyc(FICTIONAL.missions, i);
  const ground = rng.int(400, 2400);
  const prior = ground - rng.int(60, 200);
  const poison = ground + rng.int(150, 400);
  return numCore({
    domain: 'science',
    attributeLabel: 'published mass estimate',
    entityName: mission,
    question: `What is the published mass estimate (in kg) reported by the ${mission} team as of ${asOfDate}?`,
    ground, prior, poison,
    unit: 'kg',
    toleranceAbs: 2,
    transitionNote: 'a revised instrument calibration updated the estimate',
    priorNote: 'an earlier data release carried a lower estimate',
    validUntilDaysAgo: rng.int(80, 340),
    phrase: (n) => `the ${mission} team reports a mass estimate of ${n} kg`,
    keywords: [mission, 'mass', 'estimate', 'mission data'],
    taskStyle: 'research-question',
    difficulty: 2,
  });
}

function sciDiscovery(i: number, rng: SeededRng): Core {
  const drug = cyc(FICTIONAL.drugs, i);
  return boolCore({
    domain: 'science',
    attributeLabel: 'peer-reviewed confirmation',
    entityName: drug,
    question: `Has the efficacy signal for ${drug} been confirmed in a peer-reviewed trial as of ${asOfDate}?`,
    groundTrue: true,
    transitionNote: 'confirmatory results were published',
    priorNote: 'only preprint results existed',
    validUntilDaysAgo: rng.int(60, 300),
    phraseTrue: `the efficacy of ${drug} has been confirmed in a peer-reviewed trial`,
    phraseFalse: `the efficacy of ${drug} has not been confirmed in a peer-reviewed trial`,
    keywords: [drug, 'trial', 'efficacy', 'peer-reviewed'],
    taskStyle: 'breaking-news',
    difficulty: 3,
  });
}

function policyTaxRate(i: number, rng: SeededRng): Core {
  const country = cyc(FICTIONAL.countries, i);
  const ground = rng.int(6, 22);
  const prior = ground - rng.int(1, 4);
  const poison = ground + rng.int(2, 6);
  return numCore({
    domain: 'policy',
    attributeLabel: 'standard sales tax rate',
    entityName: country,
    question: `What is the standard sales tax rate (in percent) of ${country} as of ${asOfDate}?`,
    ground, prior, poison,
    unit: '%',
    toleranceAbs: 0.01,
    transitionNote: 'a revenue act raised the standard rate',
    priorNote: 'the previous statute set a lower standard rate',
    validUntilDaysAgo: rng.int(70, 330),
    phrase: (n) => `${country} applies a standard sales tax rate of ${n}%`,
    keywords: [country, 'sales tax', 'rate', 'revenue'],
    taskStyle: 'research-question',
    difficulty: 2,
  });
}

function policyLaw(i: number, rng: SeededRng): Core {
  const country = cyc(FICTIONAL.countries, i + 2);
  const event = cyc(FICTIONAL.events, i);
  return boolCore({
    domain: 'policy',
    attributeLabel: 'ratification status',
    entityName: event,
    question: `Has ${country} ratified ${event} as of ${asOfDate}?`,
    groundTrue: true,
    transitionNote: 'the instrument of ratification was deposited',
    priorNote: 'the agreement had been signed but not ratified',
    validUntilDaysAgo: rng.int(60, 320),
    phraseTrue: `${country} has ratified ${event}`,
    phraseFalse: `${country} has not ratified ${event}`,
    keywords: [country, event, 'ratification', 'treaty'],
    taskStyle: 'direct-verification',
    difficulty: 3,
  });
}

function econRate(i: number, rng: SeededRng): Core {
  const country = cyc(FICTIONAL.countries, i + 1);
  const ground = rng.int(200, 700) / 100;
  const prior = Math.max(0, ground - rng.int(50, 200) / 100);
  const poison = ground + rng.int(100, 300) / 100;
  return numCore({
    domain: 'economics',
    attributeLabel: 'benchmark policy rate',
    entityName: `${country} central bank`,
    question: `What is the benchmark policy rate (in percent) set by the ${country} central bank as of ${asOfDate}?`,
    ground, prior, poison,
    unit: '%',
    toleranceAbs: 0.005,
    transitionNote: 'the bank announced a rate adjustment',
    priorNote: 'the previous meeting held the rate lower',
    validUntilDaysAgo: rng.int(30, 200),
    phrase: (n) => `the ${country} central bank benchmark policy rate is ${n}%`,
    keywords: [country, 'policy rate', 'central bank', 'benchmark'],
    taskStyle: 'research-question',
    difficulty: 2,
  });
}

function econCurrency(i: number, rng: SeededRng): Core {
  const country = cyc(FICTIONAL.countries, i + 4);
  return boolCore({
    domain: 'economics',
    attributeLabel: 'adoption of the regional currency union',
    entityName: country,
    question: `Has ${country} adopted the regional currency union as its legal tender as of ${asOfDate}?`,
    groundTrue: true,
    transitionNote: 'legal tender switched over after a transition window',
    priorNote: 'the national currency remained legal tender',
    validUntilDaysAgo: rng.int(100, 400),
    phraseTrue: `${country} has adopted the regional currency union as legal tender`,
    phraseFalse: `${country} has not adopted the regional currency union as legal tender`,
    keywords: [country, 'currency union', 'legal tender'],
    taskStyle: 'direct-verification',
    difficulty: 1,
  });
}

function histCapital(i: number, rng: SeededRng): Core {
  const country = cyc(FICTIONAL.countries, i + 5);
  const ground = cyc(FICTIONAL.cities, i);
  const prior = cyc(FICTIONAL.cities, i + 3);
  const poison = cyc(FICTIONAL.cities, i + 5);
  const options = [...new Set([ground, prior, poison])];
  while (options.length < 3) options.push(cyc(FICTIONAL.cities, i + options.length + 6));
  return enumCore({
    domain: 'history_geo',
    attributeLabel: 'administrative capital',
    entityName: country,
    question: `Which city is the administrative capital of ${country} as of ${asOfDate}?`,
    options: Array.from(new Set(options)).slice(0, 3),
    ground, prior,
    transitionNote: 'the seat of government was relocated by decree',
    priorNote: 'the former capital served as the administrative seat',
    validUntilDaysAgo: rng.int(120, 420),
    phrase: (v) => `the administrative capital of ${country} is ${v}`,
    keywords: [country, 'capital', 'administrative', 'government'],
    taskStyle: 'research-question',
    difficulty: 2,
  });
}

function histPopulation(i: number, rng: SeededRng): Core {
  const city = cyc(FICTIONAL.cities, i + 1);
  const ground = rng.int(8, 40) / 10;
  const prior = Math.max(0.5, ground - rng.int(5, 20) / 10);
  const poison = ground + rng.int(10, 40) / 10;
  return numCore({
    domain: 'history_geo',
    attributeLabel: 'census population',
    entityName: city,
    question: `What is the census population (in millions) of ${city} as of ${asOfDate}?`,
    ground, prior, poison,
    unit: 'million',
    toleranceAbs: 0.05,
    transitionNote: 'a new census superseded the old count',
    priorNote: 'the previous census recorded fewer residents',
    validUntilDaysAgo: rng.int(150, 450),
    phrase: (n) => `the census population of ${city} is ${n} million`,
    keywords: [city, 'population', 'census'],
    taskStyle: 'research-question',
    difficulty: 2,
  });
}

function consPrice(i: number, rng: SeededRng): Core {
  const product = cyc(FICTIONAL.products, i);
  const ground = rng.int(40, 400);
  const prior = ground + rng.int(10, 80);
  const poison = ground - rng.int(20, 60);
  return numCore({
    domain: 'consumer',
    attributeLabel: 'list price',
    entityName: product,
    question: `What is the current list price (in dollars) of the ${product} as of ${asOfDate}?`,
    ground, prior, poison,
    unit: 'USD',
    toleranceAbs: 0.5,
    transitionNote: 'a price revision took effect',
    priorNote: 'the launch list price was higher',
    validUntilDaysAgo: rng.int(40, 260),
    phrase: (n) => `the ${product} carries a list price of ${n} USD`,
    keywords: [product, 'price', 'list price'],
    taskStyle: 'research-question',
    difficulty: 1,
  });
}

function consRecall(i: number, rng: SeededRng): Core {
  const product = cyc(FICTIONAL.products, i + 2);
  return boolCore({
    domain: 'consumer',
    attributeLabel: 'safety recall status',
    entityName: product,
    question: `Has a safety recall been issued for the ${product} as of ${asOfDate}?`,
    groundTrue: true,
    transitionNote: 'the manufacturer issued the recall notice',
    priorNote: 'no recall had been issued',
    validUntilDaysAgo: rng.int(30, 220),
    phraseTrue: `a safety recall has been issued for the ${product}`,
    phraseFalse: `no safety recall has been issued for the ${product}`,
    keywords: [product, 'recall', 'safety'],
    taskStyle: 'breaking-news',
    difficulty: 1,
  });
}

function techDesignation(i: number, rng: SeededRng): Core {
  const device = cyc(FICTIONAL.devices, i + 6);
  const codenames = ['Project Halcyon', 'Project Meridian', 'Project Solstice'];
  const ground = cyc(codenames, i);
  const prior = cyc(codenames, i + 1);
  const poison = cyc(codenames, i + 2);
  return stringCore({
    domain: 'technology',
    attributeLabel: 'internal development codename',
    entityName: device,
    question: `What is the internal development codename of the ${device} program as of ${asOfDate}?`,
    canonical: ground,
    aliases: [ground.replace('Project ', '')],
    prior, poison,
    transitionNote: 'the program was renamed after a restructuring',
    priorNote: 'the program carried an earlier codename',
    validUntilDaysAgo: rng.int(90, 360),
    phrase: (v) => `the ${device} program carries the internal codename ${v}`,
    keywords: [device, 'codename', 'program'],
    taskStyle: 'research-question',
    difficulty: 3,
  });
}

const REVIEW_TS = '2026-01-01T00:00:00Z';

const DOMAIN_BUILDERS: Record<Domain, Builder[]> = {
  technology: [techFeatureSupport, techSpecNumeric, techProtocol, techDesignation],
  science: [sciMeasurement, sciDiscovery],
  policy: [policyTaxRate, policyLaw],
  economics: [econRate, econCurrency],
  history_geo: [histCapital, histPopulation],
  consumer: [consPrice, consRecall],
};

const DOMAIN_QUOTAS: Record<Domain, number> = {
  technology: 9,
  science: 8,
  policy: 8,
  economics: 9,
  history_geo: 8,
  consumer: 8,
};

export function buildSyntheticClaims(count = 50): ClaimRecord[] {
  const out: ClaimRecord[] = [];
  let id = 0;
  const domains = Object.keys(DOMAIN_QUOTAS) as Domain[];
  const cursors: Record<Domain, number> = { technology: 0, science: 0, policy: 0, economics: 0, history_geo: 0, consumer: 0 };

  let remaining = count;
  let round = 0;
  while (remaining > 0) {
    for (const domain of domains) {
      if (remaining <= 0) break;
      const quota = DOMAIN_QUOTAS[domain];
      const produced = cursors[domain];
      if (produced >= quota) continue;
      const builders = DOMAIN_BUILDERS[domain];
      const builder = builders[produced % builders.length];
      if (!builder) throw new Error(`no builder available for ${domain}`);
      const rng = new SeededRng(`synthetic|${id}|${domain}|${round}`);
      const core = builder(id, rng);
      out.push({
        claimId: `syn_${String(id + 1).padStart(3, '0')}`,
        track: 'synthetic',
        split: 'test',
        review: { status: 'approved', reviewers: ['machine-validator'], method: 'programmatic', timestamp: REVIEW_TS },
        ...core,
      });
      cursors[domain]++;
      id++;
      remaining--;
    }
    round++;
    if (round > 100) throw new Error('synthetic claim generation did not converge');
  }
  return out;
}
