import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ClaimRecordSchema,
  DatasetManifestSchema,
  WorldManifestSchema,
  claimRecordErrors,
  worldManifestErrors,
  CONDITIONS,
  episodeIdOf,
  type ClaimRecord,
  type DatasetManifest,
  type Split,
  type WorldManifest,
} from '@echobench/schema';
import { canonicalJson, sha256Hex } from './hash.js';
import { GENERATOR_VERSION } from './worldgen.js';

export interface DatasetWriteOptions {
  datasetName: string;
  createdAt: string;
  seed: string;
  worldDate: string;
  proseModel: string | null;
  renderStats?: DatasetManifest['renderStats'];
}

export function datasetDir(dataRoot: string, split: Split): string {
  return join(dataRoot, split);
}

export function writeDataset(rootDir: string, split: Split, claims: ClaimRecord[], worlds: WorldManifest[], opts: DatasetWriteOptions): DatasetManifest {
  const dir = datasetDir(rootDir, split);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'worlds'), { recursive: true });

  const sortedClaims = [...claims].sort((a, b) => a.claimId.localeCompare(b.claimId));
  writeFileSync(join(dir, 'claims.json'), JSON.stringify(sortedClaims, null, 1) + '\n', 'utf8');

  const episodes: DatasetManifest['episodes'] = {};
  for (const world of worlds) {
    const file = `worlds/${world.episodeId}.json`;
    writeFileSync(join(dir, file), JSON.stringify(world, null, 1) + '\n', 'utf8');
    episodes[world.episodeId] = {
      episodeId: world.episodeId,
      condition: world.condition,
      claimId: world.claimId,
      file,
      checksum: sha256Hex(canonicalJson(world)),
    };
  }

  const manifest: DatasetManifest = {
    schemaVersion: 1,
    name: opts.datasetName,
    split,
    version: GENERATOR_VERSION,
    createdAt: opts.createdAt,
    seed: opts.seed,
    worldDate: opts.worldDate,
    proseModel: opts.proseModel,
    claimCount: sortedClaims.length,
    episodeCount: worlds.length,
    claims: sortedClaims.map((c) => ({
      claimId: c.claimId,
      track: c.track,
      domain: c.domain,
      answerType: c.answerType,
      difficulty: c.difficulty,
      file: 'claims.json',
    })),
    episodes,
    integrityChecksum: '',
    ...(opts.renderStats ? { renderStats: opts.renderStats } : {}),
  };
  manifest.integrityChecksum = sha256Hex(canonicalJson({ claims: manifest.claims, episodes: manifest.episodes }));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n', 'utf8');
  return manifest;
}

export interface LoadedDataset {
  manifest: DatasetManifest;
  claims: Map<string, ClaimRecord>;
  worlds: Map<string, WorldManifest>;
}

export interface DatasetValidationResult {
  errors: string[];
  warnings: string[];
}

export function loadAndValidateDataset(rootDir: string, split: Split): { dataset: LoadedDataset; validation: DatasetValidationResult } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const dir = datasetDir(rootDir, split);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { dataset: { manifest: null as unknown as DatasetManifest, claims: new Map(), worlds: new Map() }, validation: { errors: [`manifest missing: ${manifestPath}`], warnings } };
  }

  let manifest: DatasetManifest;
  try {
    manifest = DatasetManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  } catch (e) {
    return { dataset: { manifest: null as unknown as DatasetManifest, claims: new Map(), worlds: new Map() }, validation: { errors: [`manifest invalid: ${String(e).slice(0, 300)}`], warnings } };
  }

  const claims = new Map<string, ClaimRecord>();
  try {
    const raw = JSON.parse(readFileSync(join(dir, 'claims.json'), 'utf8')) as unknown[];
    for (const item of raw) {
      const parsed = ClaimRecordSchema.safeParse(item);
      if (!parsed.success) {
        errors.push(`claim invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
        continue;
      }
      const c = parsed.data;
      if (c.split !== split) errors.push(`${c.claimId}: claim.split ${c.split} != dataset split ${split}`);
      for (const e of claimRecordErrors(c)) errors.push(`${c.claimId}: ${e}`);
      claims.set(c.claimId, c);
    }
  } catch (e) {
    errors.push(`claims.json unreadable: ${String(e).slice(0, 200)}`);
  }

  const worlds = new Map<string, WorldManifest>();
  const worldFiles = existsSync(join(dir, 'worlds')) ? readdirSync(join(dir, 'worlds')).filter((f) => f.endsWith('.json')) : [];
  for (const f of worldFiles.sort()) {
    try {
      const w = WorldManifestSchema.parse(JSON.parse(readFileSync(join(dir, 'worlds', f), 'utf8')));
      worlds.set(w.episodeId, w);
    } catch (e) {
      errors.push(`world file ${f} invalid: ${String(e).slice(0, 200)}`);
    }
  }

  for (const [episodeId, entry] of Object.entries(manifest.episodes)) {
    const world = worlds.get(episodeId);
    if (!world) {
      errors.push(`${episodeId}: listed in manifest but missing on disk`);
      continue;
    }
    const actualChecksum = sha256Hex(canonicalJson(world));
    if (actualChecksum !== entry.checksum) errors.push(`${episodeId}: checksum mismatch (file changed after freeze)`);
    if (world.split !== split) errors.push(`${episodeId}: world.split mismatch`);
    const claim = claims.get(world.claimId);
    if (!claim) {
      errors.push(`${episodeId}: claim ${world.claimId} not in claims.json`);
    } else {
      if (JSON.stringify(world.truth.groundTruth) !== JSON.stringify(claim.groundTruth)) {
        errors.push(`${episodeId}: world ground truth differs from claim record`);
      }
    }
    errors.push(...worldManifestErrors(world).map((e) => `${episodeId}: ${e}`));
  }

  for (const [episodeId] of worlds) {
    if (!manifest.episodes[episodeId]) errors.push(`${episodeId}: present on disk but not in manifest`);
  }

  for (const claim of claims.values()) {
    for (const condition of CONDITIONS) {
      const episodeId = episodeIdOf(claim.claimId, condition);
      if (!worlds.has(episodeId)) errors.push(`${episodeId}: world missing for claim ${claim.claimId}`);
    }
  }

  const expectedIntegrity = sha256Hex(canonicalJson({ claims: manifest.claims, episodes: manifest.episodes }));
  if (expectedIntegrity !== manifest.integrityChecksum) errors.push('manifest integrityChecksum mismatch');

  if (manifest.episodeCount !== Object.keys(manifest.episodes).length) errors.push('episodeCount mismatch');
  if (manifest.claimCount !== claims.size) errors.push('claimCount mismatch');

  const devClaimsFile = join(datasetDir(rootDir, 'dev'), 'claims.json');
  const testClaimsFile = join(datasetDir(rootDir, 'test'), 'claims.json');
  if (existsSync(devClaimsFile) && existsSync(testClaimsFile)) {
    const devIds = new Set((JSON.parse(readFileSync(devClaimsFile, 'utf8')) as Array<{ claimId: string }>).map((c) => c.claimId));
    for (const id of (JSON.parse(readFileSync(testClaimsFile, 'utf8')) as Array<{ claimId: string }>).map((c) => c.claimId)) {
      if (devIds.has(id)) errors.push(`claim ${id} appears in both dev and test splits (leakage)`);
    }
  }

  for (const claim of claims.values()) {
    if (claim.review.status !== 'approved') warnings.push(`${claim.claimId}: review status is ${claim.review.status}`);
  }

  return { dataset: { manifest, claims, worlds }, validation: { errors, warnings } };
}
