import type { SearchResultPage, SearchQuery, VisiblePage } from '@echobench/schema';
import { SearchResultPageSchema, VisiblePageSchema } from '@echobench/schema';

export interface ToolGateway {
  search(query: SearchQuery): Promise<SearchResultPage>;
  openPage(pageId: string): Promise<VisiblePage | null>;
}

export class HttpToolGateway implements ToolGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly worldToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: SearchQuery): Promise<SearchResultPage> {
    const resp = await this.fetchImpl(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-world-token': this.worldToken },
      body: JSON.stringify(query),
    });
    if (!resp.ok) throw new Error(`search failed: ${resp.status} ${await resp.text()}`);
    return SearchResultPageSchema.parse(await resp.json());
  }

  async openPage(pageId: string): Promise<VisiblePage | null> {
    const resp = await this.fetchImpl(`${this.baseUrl}/openPage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-world-token': this.worldToken },
      body: JSON.stringify({ pageId }),
    });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`openPage failed: ${resp.status} ${await resp.text()}`);
    return VisiblePageSchema.parse(await resp.json());
  }
}
