import { z } from 'zod';

export const PlatformSchema = z.enum(['threadit', 'news', 'official']);
export type Platform = z.infer<typeof PlatformSchema>;

export const IsoDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

export const PageAuthorSchema = z.object({
  authorId: z.string(),
  displayName: z.string(),
  verified: z.boolean(),
  accountCreated: z.string().regex(/^\d{4}-\d{2}$/),
  credibilityCues: z.array(z.string()),
});
export type PageAuthor = z.infer<typeof PageAuthorSchema>;

export const ThreaditCommentSchema = z.object({
  commentId: z.string(),
  author: PageAuthorSchema,
  body: z.string(),
  votes: z.number().int(),
  postedAt: IsoDateTimeSchema,
});
export type ThreaditComment = z.infer<typeof ThreaditCommentSchema>;

export const ThreaditContentSchema = z.object({
  platform: z.literal('threadit'),
  community: z.string(),
  title: z.string(),
  body: z.string(),
  votes: z.number().int(),
  flair: z.string().nullable(),
  edited: z.boolean(),
  comments: z.array(ThreaditCommentSchema),
});

export const NewsContentSchema = z.object({
  platform: z.literal('news'),
  outlet: z.string(),
  outletType: z.enum(['wire', 'broadsheet', 'tabloid', 'content_farm', 'aggregator']),
  headline: z.string(),
  byline: z.string(),
  body: z.string(),
  correctionNotice: z.string().nullable(),
});

export const OfficialContentSchema = z.object({
  platform: z.literal('official'),
  orgName: z.string(),
  orgType: z.enum(['government', 'company', 'standards_body', 'registry', 'research_lab']),
  docType: z.enum(['spec_sheet', 'press_release', 'registry_entry', 'changelog', 'notice', 'datasheet']),
  title: z.string(),
  body: z.string(),
});

export const PageContentSchema = z.discriminatedUnion('platform', [
  ThreaditContentSchema,
  NewsContentSchema,
  OfficialContentSchema,
]);
export type PageContent = z.infer<typeof PageContentSchema>;

export const EngagementSchema = z.object({
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  shares: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
});
export type Engagement = z.infer<typeof EngagementSchema>;

export const PageCitationSchema = z.object({
  targetPageId: z.string(),
  anchorText: z.string(),
  url: z.string(),
});
export type PageCitation = z.infer<typeof PageCitationSchema>;

/**
 * The model-facing page. Contains ONLY visible fields: content, timestamps,
 * engagement, authorship cues, citations. Hidden stance/truth/provenance live
 * in WorldManifest.truth.pageMeta (never served by echoweb).
 */
export const VisiblePageSchema = z.object({
  pageId: z.string().regex(/^[a-z][a-z0-9_]*$/),
  url: z.string().regex(/^https:\/\/(threadit|news|official)\.echo\/p\/[a-z][a-z0-9_]*$/),
  platform: PlatformSchema,
  publishedAt: IsoDateTimeSchema,
  content: PageContentSchema,
  engagement: EngagementSchema,
  citations: z.array(PageCitationSchema),
});
export type VisiblePage = z.infer<typeof VisiblePageSchema>;

export const AuthorityClassSchema = z.enum([
  'primary_official',
  'secondary_reputable',
  'low',
  'unknown',
]);
export type AuthorityClass = z.infer<typeof AuthorityClassSchema>;

/** Evaluator-only per-page metadata (hidden from the model). */
export const HiddenPageMetaSchema = z.object({
  claimId: z.string(),
  stance: z.enum(['supports_true', 'supports_false', 'neutral']),
  assertsValue: z.string(),
  originClusterId: z.string(),
  copiedFromPageId: z.string().nullable(),
  authorityClass: AuthorityClassSchema,
  isPrimarySource: z.boolean(),
  slotRole: z.string(),
  renderMode: z.enum(['llm', 'template']),
});
export type HiddenPageMeta = z.infer<typeof HiddenPageMetaSchema>;

export const ProvenanceRelationSchema = z.enum([
  'copied_from',
  'cites',
  'reposts',
  'paraphrases',
  'screenshots',
  'independently_observed',
  'quotes',
  'aggregates',
  'syndicates',
  'summarizes',
  'derived_from',
]);
export type ProvenanceRelation = z.infer<typeof ProvenanceRelationSchema>;

export const ProvenanceEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  relation: ProvenanceRelationSchema,
});
export type ProvenanceEdge = z.infer<typeof ProvenanceEdgeSchema>;
