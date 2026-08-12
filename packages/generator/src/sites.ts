import type { ClaimRecord } from '@echobench/schema';
import { sha256Hex } from './hash.js';
import { FORUM_SITE, type SiteIdentity } from './names.js';

export function opaquePageId(...parts: string[]): string {
  return `p_${sha256Hex(parts.join('|')).slice(0, 12)}`;
}

export function slugify(text: string, maxWords = 4): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, maxWords);
  return words.join('-');
}

const URL_FILLERS = ['details', 'update', 'report', 'discussion', 'analysis', 'statement', 'review', 'records', 'explained', 'latest'];

/** Neutral, non-leaky slug derived from claim topic + seeded noise. */
export function topicSlug(claim: ClaimRecord, rng: SeededRngLike, extra?: string): string {
  const base = slugify(`${claim.entityName} ${extra ?? claim.attributeLabel}`, 4);
  const filler = URL_FILLERS[rng.int(0, URL_FILLERS.length)] as string;
  const suffix = rng.int(100, 999);
  return `${base}-${filler}-${suffix}`;
}

export interface RngLike {
  int(min: number, max: number): number;
}
type SeededRngLike = RngLike;

export function communityOf(raw: string): string {
  return raw.replace(/^r\//, '');
}

export function forumUrl(community: string, pageId: string, slug: string): string {
  const shortId = pageId.slice(2, 8);
  return `https://${FORUM_SITE.domain}/r/${communityOf(community)}/comments/${shortId}/${slug}`;
}

export function newsUrl(site: SiteIdentity, outletType: string, publishedAt: string, slug: string): string {
  if (outletType === 'broadsheet' || outletType === 'wire') {
    const [y, m, d] = publishedAt.slice(0, 10).split('-');
    return `https://${site.domain}/${y}/${m}/${d}/${slug}/`;
  }
  return `https://${site.domain}/article/${slug}`;
}

export function officialUrl(site: SiteIdentity, docType: string, slug: string): string {
  const section =
    docType === 'press_release' ? 'press' : docType === 'registry_entry' ? 'registry' : docType === 'changelog' ? 'docs' : 'records';
  return `https://${site.domain}/${section}/${slug}`;
}

export function domainOf(url: string): string {
  const m = url.match(/^https:\/\/([^/]+)\//);
  return m?.[1] ?? '';
}
