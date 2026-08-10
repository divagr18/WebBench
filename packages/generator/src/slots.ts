import type { Platform } from '@echobench/schema';
import { SeededRng } from './rng.js';

export interface SlotDef {
  slot: string;
  platform: Platform;
  /** Days before worldDate this slot is published (baseline recency). */
  baseAgeDays: number;
  outletType: 'wire' | 'broadsheet' | 'tabloid' | 'content_farm' | 'aggregator';
  orgType: 'government' | 'company' | 'standards_body' | 'registry' | 'research_lab';
  docType: 'spec_sheet' | 'press_release' | 'registry_entry' | 'changelog' | 'notice' | 'datasheet';
  community: string;
  authorityBase: 'primary_official' | 'secondary_reputable' | 'low' | 'unknown';
}

/**
 * Fixed 9-slot page template shared by every world of a claim. Surface
 * attributes (engagement, recency jitter) are seeded per (claim, slot) so the
 * clean and manufactured_consensus worlds are surface-matched while stance and
 * provenance topology vary.
 */
export const SLOTS: readonly SlotDef[] = [
  { slot: 'official_primary', platform: 'official', baseAgeDays: 12, outletType: 'wire', orgType: 'company', docType: 'spec_sheet', community: '', authorityBase: 'primary_official' },
  { slot: 'official_secondary', platform: 'official', baseAgeDays: 400, outletType: 'wire', orgType: 'company', docType: 'registry_entry', community: '', authorityBase: 'secondary_reputable' },
  { slot: 'news_wire', platform: 'news', baseAgeDays: 9, outletType: 'wire', orgType: 'company', docType: 'notice', community: '', authorityBase: 'secondary_reputable' },
  { slot: 'news_broadsheet', platform: 'news', baseAgeDays: 15, outletType: 'broadsheet', orgType: 'company', docType: 'notice', community: '', authorityBase: 'secondary_reputable' },
  { slot: 'news_local', platform: 'news', baseAgeDays: 320, outletType: 'broadsheet', orgType: 'company', docType: 'notice', community: '', authorityBase: 'secondary_reputable' },
  { slot: 'news_tabloid', platform: 'news', baseAgeDays: 45, outletType: 'tabloid', orgType: 'company', docType: 'notice', community: '', authorityBase: 'low' },
  { slot: 'news_aggregator', platform: 'news', baseAgeDays: 6, outletType: 'aggregator', orgType: 'company', docType: 'notice', community: '', authorityBase: 'low' },
  { slot: 'threadit_main', platform: 'threadit', baseAgeDays: 200, outletType: 'broadsheet', orgType: 'company', docType: 'notice', community: 'r/verifythis', authorityBase: 'unknown' },
  { slot: 'threadit_alt', platform: 'threadit', baseAgeDays: 20, outletType: 'broadsheet', orgType: 'company', docType: 'notice', community: 'r/factcheck', authorityBase: 'unknown' },
];

export interface SlotSurface {
  publishedDaysAgo: number;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  authorIndex: number;
}

export function slotSurface(claimId: string, slot: SlotDef): SlotSurface {
  const rng = new SeededRng(`${claimId}|surface|${slot.slot}`);
  const ageJitter = slot.baseAgeDays === 0 ? 0 : Math.round(slot.baseAgeDays * rng.jitter(0, 0.2));
  const publishedDaysAgo = Math.max(1, slot.baseAgeDays + ageJitter);
  const logViews = rng.jitter(9.5, 3.2);
  const views = Math.max(12, Math.round(Math.exp(logViews)));
  const likes = Math.max(1, Math.round(views * rng.float() * 0.045 + views * 0.004));
  const shares = Math.max(0, Math.round(likes * rng.float() * 0.4 + likes * 0.08));
  const comments = Math.max(0, Math.round(likes * rng.float() * 0.25 + likes * 0.03));
  const authorIndex = rng.int(0, 64);
  return { publishedDaysAgo, views, likes, shares, comments, authorIndex };
}
