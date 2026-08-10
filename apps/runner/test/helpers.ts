import type { SearchResultPage, SearchQuery, VisiblePage } from '@echobench/schema';
import type { EchoWeb } from '@echobench/echoweb';
import type { ToolGateway } from '../src/gateway.js';

export class InMemoryGateway implements ToolGateway {
  constructor(
    private readonly echo: EchoWeb,
    private readonly token: string,
  ) {}

  async search(query: SearchQuery): Promise<SearchResultPage> {
    const world = this.echo.resolve(this.token);
    if (!world) throw new Error('invalid world token');
    return this.echo.search(world, {
      query: query.query,
      ...(query.site ? { site: query.site } : {}),
      ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
      ...(query.dateTo ? { dateTo: query.dateTo } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
  }

  async openPage(pageId: string): Promise<VisiblePage | null> {
    const world = this.echo.resolve(this.token);
    if (!world) throw new Error('invalid world token');
    return this.echo.openPage(world, pageId);
  }
}
