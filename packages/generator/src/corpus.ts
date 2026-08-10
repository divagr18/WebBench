import type { ClaimRecord, Domain, Split, Track } from '@echobench/schema';
import { claimRecordErrors, ClaimRecordSchema } from '@echobench/schema';
import { buildSyntheticClaims } from './syntheticClaims.js';
import { buildRealClaims } from './realClaims.js';

const DEV_PER_TRACK = 10;

export interface Corpus {
  claims: ClaimRecord[];
  dev: ClaimRecord[];
  test: ClaimRecord[];
}

function stratifiedDevSelection(trackClaims: ClaimRecord[]): Set<string> {
  const byDomain = new Map<Domain, ClaimRecord[]>();
  for (const c of trackClaims) {
    const list = byDomain.get(c.domain) ?? [];
    list.push(c);
    byDomain.set(c.domain, list);
  }

  const domains = [...byDomain.keys()].sort();
  const quota = new Map<Domain, number>();
  const fractions: Array<{ domain: Domain; frac: number }> = [];
  let floorSum = 0;
  for (const d of domains) {
    const raw = (byDomain.get(d)!.length * DEV_PER_TRACK) / trackClaims.length;
    const floor = Math.floor(raw);
    quota.set(d, floor);
    fractions.push({ domain: d, frac: raw - floor });
    floorSum += floor;
  }
  let deficit = DEV_PER_TRACK - floorSum;
  fractions.sort((a, b) => b.frac - a.frac || a.domain.localeCompare(b.domain));
  for (const f of fractions) {
    if (deficit <= 0) break;
    quota.set(f.domain, quota.get(f.domain)! + 1);
    deficit--;
  }

  const picked = new Set<string>();
  for (const d of domains) {
    const n = quota.get(d)!;
    if (n <= 0) continue;
    const byType = new Map<string, ClaimRecord[]>();
    for (const c of byDomain.get(d)!) {
      const list = byType.get(c.answerType) ?? [];
      list.push(c);
      byType.set(c.answerType, list);
    }
    const typeKeys = [...byType.keys()].sort();
    const cursor = new Map(typeKeys.map((k) => [k, 0]));
    let taken = 0;
    let t = 0;
    while (taken < n && t < 1000) {
      for (const k of typeKeys) {
        if (taken >= n) break;
        const list = byType.get(k)!;
        const idx = cursor.get(k)!;
        const item = list[idx];
        if (item && idx < list.length) {
          picked.add(item.claimId);
          cursor.set(k, idx + 1);
          taken++;
        }
      }
      t++;
    }
  }
  return picked;
}

export function assignSplits(claims: ClaimRecord[]): void {
  for (const track of ['synthetic', 'real'] as Track[]) {
    const trackClaims = claims.filter((c) => c.track === track).sort((a, b) => a.claimId.localeCompare(b.claimId));
    const devIds = stratifiedDevSelection(trackClaims);
    for (const c of trackClaims) {
      c.split = devIds.has(c.claimId) ? 'dev' : 'test';
    }
  }
}

export function buildCorpus(): Corpus {
  const claims = [...buildSyntheticClaims(50), ...buildRealClaims()];
  assignSplits(claims);

  const errors: string[] = [];
  for (const c of claims) {
    const parsed = ClaimRecordSchema.safeParse(c);
    if (!parsed.success) {
      errors.push(`${c.claimId}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      continue;
    }
    for (const e of claimRecordErrors(c)) errors.push(`${c.claimId}: ${e}`);
  }

  const byId = new Map(claims.map((c) => [c.claimId, c]));
  if (byId.size !== claims.length) errors.push('duplicate claim ids detected');

  const synthNames = claims.filter((c) => c.track === 'synthetic').map((c) => c.entityName.toLowerCase());
  const realNames = claims.filter((c) => c.track === 'real').map((c) => c.entityName.toLowerCase());
  for (const name of synthNames) {
    if (realNames.includes(name)) errors.push(`synthetic entity collides with real entity: ${name}`);
  }

  if (errors.length > 0) {
    throw new Error(`corpus validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  const dev = claims.filter((c) => c.split === 'dev');
  const test = claims.filter((c) => c.split === 'test');
  if (dev.length !== 20 || test.length !== 80) {
    throw new Error(`split sizes wrong: dev=${dev.length} test=${test.length}`);
  }
  const devByTrack: Record<Split, Record<Track, number>> = { dev: { synthetic: 0, real: 0 }, test: { synthetic: 0, real: 0 } };
  for (const c of claims) devByTrack[c.split][c.track]++;
  if (devByTrack.dev.synthetic !== 10 || devByTrack.dev.real !== 10) {
    throw new Error(`dev track balance wrong: ${JSON.stringify(devByTrack.dev)}`);
  }

  return { claims, dev, test };
}
