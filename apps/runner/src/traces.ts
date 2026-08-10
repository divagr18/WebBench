import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Split } from '@echobench/schema';

export interface TraceMeta {
  type: 'meta';
  runId: string;
  episodeId: string;
  claimId: string;
  condition: string;
  split: Split;
  replicate: number;
  provider: 'deepseek';
  modelRequested: string;
  worldToken: string;
  callBudget: number;
  temperature: number;
  promptHashes: Record<string, string>;
  startedAt: string;
}

export interface RunIndexEntry {
  runId: string;
  episodeId: string;
  replicate: number;
  tracePath: string;
  status: 'completed' | 'failed' | 'rejected';
  modelReturned: string | null;
  checksum: string;
  finishedAt: string;
}

export function tracesDir(tracesRoot: string, split: Split, runSetId: string): string {
  return join(tracesRoot, split, runSetId);
}

export function tracePathFor(rootDir: string, split: Split, runSetId: string, episodeId: string, replicate: number): string {
  return join(tracesDir(rootDir, split, runSetId), `${episodeId}__r${replicate}.jsonl`);
}

export function indexPathFor(rootDir: string, split: Split, runSetId: string): string {
  return join(tracesDir(rootDir, split, runSetId), 'index.jsonl');
}

export function writeTraceLines(path: string, lines: unknown[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const payload = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  appendFileSync(path, payload, 'utf8');
}

export function appendIndex(rootDir: string, split: Split, runSetId: string, entry: RunIndexEntry): void {
  const path = indexPathFor(rootDir, split, runSetId);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
}

export function loadIndex(rootDir: string, split: Split, runSetId: string): RunIndexEntry[] {
  const path = indexPathFor(rootDir, split, runSetId);
  if (!existsSync(path)) return [];
  const out: RunIndexEntry[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as RunIndexEntry);
    } catch {
      // skip malformed tail (crash mid-append)
    }
  }
  return out;
}

export function writeRunManifest(rootDir: string, split: Split, runSetId: string, manifest: unknown): void {
  const path = join(tracesDir(rootDir, split, runSetId), 'run-manifest.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 1) + '\n', 'utf8');
}
