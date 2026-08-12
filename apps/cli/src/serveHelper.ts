import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { WorldManifest } from '@echobench/schema';
import { EchoWeb } from '@echobench/echoweb';
import { getLocalEmbedder } from '@echobench/generator';

export async function makeEmbedQuery(): Promise<((query: string) => Promise<number[]>) | undefined> {
  try {
    const embedder = await getLocalEmbedder();
    return (query: string) => embedder.embed([query]).then((rows) => rows[0] ?? []);
  } catch (e) {
    console.warn(`[echoweb] semantic search disabled (BM25 only): ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

export async function startEchoWeb(
  worlds: WorldManifest[],
  port: number,
  host = '127.0.0.1',
  opts: { embedQuery?: (query: string) => Promise<number[]> } = {},
): Promise<{ app: FastifyInstance; baseUrl: string; close: () => Promise<void> }> {
  const echo = new EchoWeb(worlds, opts.embedQuery ? { embedQuery: opts.embedQuery } : {});
  const app = echo.buildApp();
  await app.listen({ port, host });
  const address = await app.addresses();
  const bound = address[0];
  const actualPort = bound && typeof bound === 'object' && 'port' in bound ? bound.port : port;
  const baseUrl = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`;
  return { app, baseUrl, close: () => app.close() };
}

export function defaultDataDir(repoRoot: string): string {
  return join(repoRoot, 'datasets');
}
