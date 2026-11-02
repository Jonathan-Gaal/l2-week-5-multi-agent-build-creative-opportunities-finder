/** One result card, already shaped for display. */
/** What was read on the listing's own page; a field the page did not give is absent. */
export type ReadDetails = { pay?: string; fee?: string; dates?: string; where?: string; by?: string };

export type Card = {
  title: string;
  org: string | null;
  type: string;
  /** Display label for `type`, from the API's meta lists. */
  typeLabel: string;
  subtype: string | null;
  /** Other kinds this listing also is (same broad type). It still appears once in the list. */
  alsoSubtypes: string[];
  /** The top tag (one of the eleven step-two choices) and the small tag beside it (null when the top tag says it all). */
  tag: string;
  subtag: string | null;
  place: string;
  location: string | null;
  deadline: string;
  closesIn: number | null;
  /** What closesIn counts to: the application deadline, or a date the listing gives (an event, an audition). */
  nextKind: "deadline" | "date" | null;
  eventDates: string[] | null;
  recurrence: string | null;
  /** A real fee, No fee, or Fee not listed where a fee is a real question; null where a fee line would say nothing. */
  fee: string | null;
  award: string | null;
  eligibility: string[];
  source: string;
  sourceUrl: string | null;
  label: string;
  trust: "checked" | "partial" | "unchecked";
  caveat: string | null;
  key: string;
  /** Added by the results page from the bundled page details; absent in other views. */
  read?: ReadDetails;
};

export type Group = {
  type: string;
  /** 0 verified, 2 not fully checked, 3 nothing found: the tier of this type's one ranked list. */
  tier: 0 | 2 | 3;
  cards: Card[];
  /** E.g. "3 expired listings removed.", or null. */
  removed: string | null;
  /** The expired listings behind the count (at most 20), for the "expired removed" list. */
  expired: Card[];
  /** How many listings match this search; `cards` are the best of them. */
  total: number;
  /** The best of the other matches (not reviewed), for the browse list. */
  more: Card[];
  reason: string | null;
};

/** One type's run inside the single search call: what the results service traced under `requestId`. */
export type CallLog = {
  type: string;
  tier: number;
  count: number;
  removed: string | null;
  requestId: string;
};

/** `subtypes` are "type.kind" tokens (e.g. "event.open_mic") naming the kinds to rank before anything is cut; empty means every kind. */
export type SearchInput = { places: string[]; types: string[]; disciplines: string[]; subtypes?: string[] };

export type SearchOutput = {
  asOf: string;
  snapshotId: string;
  groups: Group[];
  /** One per type group, in the same order. */
  calls: CallLog[];
  /** The query string of the one GET /api/search call, for the dev tools. */
  query: string;
};

/** One step of a run, shown in order in the dev playback. */
export type Frame =
  | { kind: "request" | "filter" | "call"; title: string; lines: string[] }
  | { kind: "candidates"; title: string; items: CandidateItem[] }
  | { kind: "ranker"; title: string; note?: string; items: RankedItem[]; forced?: boolean }
  | { kind: "checks"; title: string; problems: string[] }
  | { kind: "reviewer"; title: string; verdict: "accept" | "reject" | "not run"; critique: string }
  | { kind: "result"; title: string; tier: number; lines: string[] };

export type CandidateItem = { id: string; title: string; org: string | null; place: string; deadline: string | null; unverified: boolean; injected?: boolean };
export type RankedItem = { id: string; title: string | null; reason: string; unverified?: boolean };

export type Removed = { expired: number; failed_schema: number; duplicate: number };

/** A saved run exported from runs/claude-code-as-model by scripts/export_web_data.py. */
export type SavedRun = {
  id: string;
  name: string;
  story: string;
  request: { place: string; type: string; as_of: string };
  modelCalls: number;
  playedBy: string;
  filter: { matched: number; sentToRanker: number; removed: Removed };
  candidates: CandidateItem[];
  attempts: {
    n: number;
    ranking?: RankedItem[];
    forced?: boolean;
    check_problems: string[];
    verdict?: "accept" | "reject";
    critique?: string;
  }[];
  tier: number;
  downgraded: string | null;
  reason: string | null;
  removedNote: string | null;
  results: {
    title: string;
    org: string | null;
    place: string;
    deadline: string;
    fee: string;
    award: string | null;
    label: string;
    source: string;
    source_url: string;
    caveat: string | null;
  }[];
};
