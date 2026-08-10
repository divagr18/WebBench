import { z } from 'zod';
import { IsoDateTimeSchema, PlatformSchema } from './page.js';

export const SearchQuerySchema = z.object({
  query: z.string().min(1).max(512),
  site: PlatformSchema.optional(),
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
  publishedAt: IsoDateTimeSchema,
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const SearchResultPageSchema = z.object({
  query: z.string(),
  site: PlatformSchema.nullable(),
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  totalResults: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  results: z.array(SearchHitSchema).max(10),
});
export type SearchResultPage = z.infer<typeof SearchResultPageSchema>;

export const OpenPageRequestSchema = z.object({
  pageId: z.string().min(1).max(512),
});
export type OpenPageRequest = z.infer<typeof OpenPageRequestSchema>;
