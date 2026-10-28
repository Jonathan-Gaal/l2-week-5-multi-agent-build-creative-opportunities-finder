import type { ErrorCode } from "./api-types";

/** One result card, already shaped for display. */
export type Card = {
  title: string;
  org: string | null;
  type: string;
  subtype: string | null;
  place: string;
  location: string | null;
  deadline: string;
  closesIn: number | null;
  eventDates: string[] | null;
  recurrence: string | null;
  fee: string;
  award: string | null;
  eligibility: string[];
  source: string;
  sourceUrl: string | null;
  label: string;
  trust: "checked" | "partial" | "unchecked";
  caveat: string | null;
  key: string;
};

export type Group = {
  type: string;
  /** 0 verified, 2 not fully checked, 3 nothing found. The weakest tier across the places searched. */
  tier: 0 | 2 | 3;
  cards: Card[];
  /** E.g. "3 expired listings removed.", or null. */
  removed: string | null;
  reason: string | null;
};

/** One call to the results service: a single place and a single type, which is all the API takes today. */
export type CallLog = {
  place: string;
  type: string;
  ok: boolean;
  tier?: number;
  count?: number;
  removed?: string | null;
  requestId?: string;
  error?: ErrorCode | "unreachable" | "bad_response";
};

export type SearchInput = { places: string[]; types: string[]; disciplines: string[] };

export type SearchOutput = {
  asOf: string;
  snapshotId: string;
  groups: Group[];
  calls: CallLog[];
  warnings: string[];
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
