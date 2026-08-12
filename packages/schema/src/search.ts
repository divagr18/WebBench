import { z } from 'zod';
import { EngagementSchema, IsoDateTimeSchema, PlatformSchema } from './page.js';

export const SearchQuerySchema = z.object({
  query: z.string().min(1).max(512),
  /** Platform archetype (threadit|news|official) or a domain substring filter. */
  site: z.string().max(256).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cursor: z.string().optional(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchHitSchema = z.object({
  pageId: z.string(),
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  platform: PlatformSchema,
  siteDomain: z.string(),
  outlet: z.string().nullable(),
  publishedAt: IsoDateTimeSchema,
  engagement: EngagementSchema,
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const SearchResultPageSchema = z.object({
  query: z.string(),
  site: z.string().nullable(),
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  totalResults: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  results: z.array(SearchHitSchema).max(10),
});
export type SearchResultPage = z.infer<typeof SearchResultPageSchema>;

export const OpenPageRequestSchema = z.object({
  /** Opaque page id or the full synthetic URL shown in results/citations. */
  pageId: z.string().min(1).max(2048),
});
export type OpenPageRequest = z.infer<typeof OpenPageRequestSchema>;
