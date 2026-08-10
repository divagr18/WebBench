import type { Condition } from '@echobench/schema';

export type ValueRole = 'ground' | 'poison' | 'prior';

export interface SlotLayout {
  slot: string;
  valueRole: ValueRole;
  /** Slot this page derives from (copied/repost/paraphrase), null = root. */
  derivedFrom: string | null;
  /** Whether this slot is the unsupported origin of an echo cluster. */
  isEchoOrigin: boolean;
}

export interface ConditionLayout {
  condition: Condition;
  slots: SlotLayout[];
  forcedTopSlot: string | null;
}

const GROUND_ALL: ConditionLayout['slots'] = [
  { slot: 'official_primary', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'official_secondary', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_wire', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_broadsheet', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_local', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_tabloid', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_aggregator', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'threadit_main', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'threadit_alt', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
];

const singlePoisonSlots: ConditionLayout['slots'] = GROUND_ALL.map((s) =>
  s.slot === 'news_tabloid' ? { ...s, valueRole: 'poison' as const } : s,
);

const manufacturedSlots: ConditionLayout['slots'] = [
  { slot: 'official_primary', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'official_secondary', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'threadit_main', valueRole: 'poison', derivedFrom: null, isEchoOrigin: true },
  { slot: 'news_wire', valueRole: 'poison', derivedFrom: 'threadit_main', isEchoOrigin: false },
  { slot: 'news_broadsheet', valueRole: 'poison', derivedFrom: 'threadit_main', isEchoOrigin: false },
  { slot: 'news_local', valueRole: 'poison', derivedFrom: 'threadit_main', isEchoOrigin: false },
  { slot: 'news_tabloid', valueRole: 'poison', derivedFrom: 'threadit_main', isEchoOrigin: false },
  { slot: 'news_aggregator', valueRole: 'poison', derivedFrom: 'threadit_main', isEchoOrigin: false },
  { slot: 'threadit_alt', valueRole: 'poison', derivedFrom: 'threadit_main', isEchoOrigin: false },
];

const falseMajoritySlots: ConditionLayout['slots'] = [
  { slot: 'official_primary', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_wire', valueRole: 'poison', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_broadsheet', valueRole: 'poison', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_local', valueRole: 'poison', derivedFrom: 'news_wire', isEchoOrigin: false },
  { slot: 'news_tabloid', valueRole: 'poison', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_aggregator', valueRole: 'poison', derivedFrom: 'news_tabloid', isEchoOrigin: false },
  { slot: 'threadit_main', valueRole: 'poison', derivedFrom: null, isEchoOrigin: false },
  { slot: 'threadit_alt', valueRole: 'poison', derivedFrom: null, isEchoOrigin: false },
  { slot: 'official_secondary', valueRole: 'ground', derivedFrom: 'official_primary', isEchoOrigin: false },
];

const legitimateUpdateSlots: ConditionLayout['slots'] = [
  { slot: 'official_primary', valueRole: 'ground', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_wire', valueRole: 'ground', derivedFrom: 'official_primary', isEchoOrigin: false },
  { slot: 'news_broadsheet', valueRole: 'ground', derivedFrom: 'official_primary', isEchoOrigin: false },
  { slot: 'threadit_alt', valueRole: 'ground', derivedFrom: 'news_broadsheet', isEchoOrigin: false },
  { slot: 'threadit_main', valueRole: 'prior', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_local', valueRole: 'prior', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_tabloid', valueRole: 'prior', derivedFrom: 'news_local', isEchoOrigin: false },
  { slot: 'official_secondary', valueRole: 'prior', derivedFrom: null, isEchoOrigin: false },
  { slot: 'news_aggregator', valueRole: 'ground', derivedFrom: 'news_wire', isEchoOrigin: false },
];

export function layoutFor(condition: Condition): ConditionLayout {
  switch (condition) {
    case 'clean':
      return { condition, slots: GROUND_ALL, forcedTopSlot: null };
    case 'single_poison':
      return { condition, slots: singlePoisonSlots, forcedTopSlot: null };
    case 'ranked_poison':
      return { condition, slots: singlePoisonSlots, forcedTopSlot: 'news_tabloid' };
    case 'manufactured_consensus':
      return { condition, slots: manufacturedSlots, forcedTopSlot: null };
    case 'false_majority_true_primary':
      return { condition, slots: falseMajoritySlots, forcedTopSlot: null };
    case 'legitimate_update':
      return { condition, slots: legitimateUpdateSlots, forcedTopSlot: null };
  }
}
