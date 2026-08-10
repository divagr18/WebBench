import type { VisiblePage, WorldManifest } from '@echobench/schema';

const K1 = 1.2;
const B = 0.75;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

interface DocIndex {
  pageId: string;
  tokens: string[];
  tf: Map<string, number>;
  titleTokens: Set<string>;
  length: number;
}

export class WorldSearchIndex {
  private docs: DocIndex[] = [];
  private avgLen = 0;
  private df = new Map<string, number>();

  constructor(
    public readonly world: WorldManifest,
  ) {
    for (const page of world.pages) {
      const text = pageText(page);
      const tokens = tokenize(text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      const titleTokens = new Set(tokenize(pageTitle(page)));
      this.docs.push({ pageId: page.pageId, tokens, tf, titleTokens, length: tokens.length });
    }
    const total = this.docs.reduce((s, d) => s + d.length, 0);
    this.avgLen = this.docs.length > 0 ? total / this.docs.length : 0;
    for (const d of this.docs) {
      for (const term of d.tf.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
    }
    this.docs.sort((a, b) => a.pageId.localeCompare(b.pageId));
  }

  score(queryTokens: string[], doc: DocIndex): number {
    const n = this.docs.length;
    let s = 0;
    for (const q of queryTokens) {
      const df = this.df.get(q) ?? 0;
      if (df === 0) continue;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      const tf = doc.tf.get(q) ?? 0;
      if (tf === 0) continue;
      const titleBoost = doc.titleTokens.has(q) ? 1.6 : 1.0;
      const denom = tf + K1 * (1 - B + (B * doc.length) / (this.avgLen || 1));
      s += idf * ((tf * (K1 + 1)) / denom) * titleBoost;
    }
    return s;
  }

  rankedIds(query: string): Array<{ pageId: string; score: number }> {
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];
    const scored: Array<{ pageId: string; score: number }> = [];
    for (const d of this.docs) {
      const sc = this.score(qTokens, d);
      if (sc > 0) scored.push({ pageId: d.pageId, score: sc });
    }
    scored.sort((a, b) => b.score - a.score || a.pageId.localeCompare(b.pageId));
    if (this.world.searchConfig.mode === 'bm25_with_overrides') {
      const forced = this.world.searchConfig.forcedTopPageIds;
      for (let i = scored.length - 1; i >= 0; i--) {
        const item = scored[i];
        if (item && forced.includes(item.pageId)) {
          scored.splice(i, 1);
          scored.unshift(item);
        }
      }
    }
    return scored;
  }
}

export function pageTitle(page: VisiblePage): string {
  switch (page.content.platform) {
    case 'threadit':
      return page.content.title;
    case 'news':
      return page.content.headline;
    case 'official':
      return page.content.title;
  }
}

export function pageBodyText(page: VisiblePage): string {
  switch (page.content.platform) {
    case 'threadit':
      return `${page.content.body} ${page.content.comments.map((c) => c.body).join(' ')}`;
    case 'news':
      return page.content.body;
    case 'official':
      return page.content.body;
  }
}

function pageText(page: VisiblePage): string {
  const c = page.content;
  const extra =
    c.platform === 'threadit'
      ? `${c.community} ${c.title}`
      : c.platform === 'news'
        ? `${c.outlet} ${c.headline}`
        : `${c.orgName} ${c.title}`;
  return `${extra} ${pageTitle(page)} ${pageBodyText(page)}`;
}

const SNIPPET_WORDS = 34;

export function makeSnippet(page: VisiblePage, query: string): string {
  const queryTokens = new Set(tokenize(query));
  const body = pageBodyText(page);
  const words = body.split(/\s+/).filter(Boolean);
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;
    const toks = tokenize(word);
    if (toks.some((t) => queryTokens.has(t))) {
      start = Math.max(0, i - 6);
      break;
    }
  }
  const slice = words.slice(start, start + SNIPPET_WORDS).join(' ');
  return `${slice}${start + SNIPPET_WORDS < words.length ? '...' : ''}`;
}
