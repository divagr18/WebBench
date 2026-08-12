import type { VisiblePage } from '@echobench/schema';

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  dimensions: number;
  modelId: string;
}

let cached: Embedder | null = null;

export const EMBED_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

/** Lazily loads the local MiniLM model (CPU, no API calls). Throws if unavailable. */
export async function getLocalEmbedder(): Promise<Embedder> {
  if (cached) return cached;
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = await pipeline('feature-extraction', EMBED_MODEL_ID);
  cached = {
    modelId: EMBED_MODEL_ID,
    dimensions: 384,
    async embed(texts: string[]): Promise<number[][]> {
      const batch = texts.map((t) => (t.length > 2000 ? t.slice(0, 2000) : t));
      const output = await extractor(batch, { pooling: 'mean', normalize: true });
      const rows = output.tolist() as number[][];
      return rows.map((row) => row.map((v) => Number(v.toFixed(4))));
    },
  };
  return cached;
}

export function pageEmbedText(page: VisiblePage): string {
  const c = page.content;
  switch (c.platform) {
    case 'threadit':
      return `${c.title}\n${c.body}\n${c.comments.map((x) => x.body).join('\n')}`;
    case 'news':
      return `${c.headline}\n${c.body}`;
    case 'official':
      return `${c.title}\n${c.body}`;
  }
}

/** Embeds all pages of a world; returns pageId -> vector (rounded, deterministic JSON). */
export async function embedWorldPages(embedder: Embedder, pages: VisiblePage[], batchSize = 16): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  for (let i = 0; i < pages.length; i += batchSize) {
    const slice = pages.slice(i, i + batchSize);
    const vectors = await embedder.embed(slice.map(pageEmbedText));
    for (let j = 0; j < slice.length; j++) {
      const page = slice[j];
      const vec = vectors[j];
      if (page && vec) out[page.pageId] = vec;
    }
  }
  return out;
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}
