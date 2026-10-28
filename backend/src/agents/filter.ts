/**
 * Filter (code): select snapshot records for a request and drop expired or failed-schema ones.
 * Port of agents/filter.py.
 *
 * A request is a place and an opportunity type. The place is an NYC borough or one of the snapshot
 * regions outside NYC. Hard filters are never relaxed:
 * - borough requests match that borough or 'citywide' (open to any NYC resident); 'unknown' never matches;
 * - region requests match the record's region;
 * - type must equal the record's opportunity_type;
 * - expired: the record's last date is earlier than the request date. For events with several
 *   occurrences that is the last occurrence, so a series that has started but not ended is kept.
 *   'recurring', 'rolling' and a missing deadline never expire.
 *
 * Dates are ISO strings (YYYY-MM-DD), which compare correctly as strings.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REPO = fileURLToPath(new URL("../../../", import.meta.url));
export const SNAPSHOT = `${REPO}data/snapshots/2026-10-27`;

export const BOROUGHS = ["manhattan", "brooklyn", "queens", "bronx", "staten_island"] as const;
export const REGIONS = ["nyc", "long_island", "westchester_hudson", "upstate_ny", "new_jersey", "connecticut",
  "pennsylvania", "massachusetts", "rhode_island", "vermont", "new_hampshire", "maine", "delaware", "maryland",
  "dc"] as const;
export const TYPES = ["event", "open_call", "grant", "residency", "job"] as const;
const REQUIRED = ["title", "source_url", "checked_at", "snapshot_id", "dedupe_key", "source"] as const;

export type Eligibility = { requirement: string; quote?: string | null };

/** One snapshot record (data/snapshots/<id>/records.json). Only the fields the agents read are typed. */
export type OppRecord = {
  title: string;
  dedupe_key: string;
  source: string;
  source_url: string;
  checked_at: string;
  snapshot_id: string;
  opportunity_type: string;
  org?: string | null;
  subtype?: string | null;
  borough?: string | null;
  region?: string | null;
  deadline?: string | null;
  event_dates?: (string | null)[] | null;
  recurrence?: string | null;
  fee?: string | null;
  award?: string | null;
  location?: string | null;
  eligibility?: Eligibility[] | null;
  disciplines?: string[] | null;
  extraction?: string | null;
  caveat?: string | null;
  [field: string]: unknown;
};

export type Request = { place: string; type: string; asOf: string };

export type RemovedCounts = { expired: number; failed_schema: number; duplicate: number };

/** Today's date in local time, as YYYY-MM-DD. */
export const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const makeRequest = (place: string, type: string, asOf: string = today()): Request => ({ place, type, asOf });

/** Why the request can't be served, or null. */
export const requestProblem = (req: Request): string | null => {
  if (!(BOROUGHS as readonly string[]).includes(req.place) && !(REGIONS as readonly string[]).includes(req.place)) {
    return `unknown place '${req.place}'`;
  }
  if (!(TYPES as readonly string[]).includes(req.type)) {
    return `unknown opportunity type '${req.type}'`;
  }
  return null;
};

const titleCase = (s: string) => s.replace(/\w+/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());

export const requestLabel = (req: Request): string =>
  `${titleCase(req.place.replaceAll("_", " "))} ${req.type.replaceAll("_", " ")}`;

export const load = (snapshotDir: string = SNAPSHOT): OppRecord[] =>
  JSON.parse(readFileSync(`${snapshotDir}/records.json`, "utf-8")).records;

/** A real calendar date written YYYY-MM-DD. */
export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** Python truthiness for record fields: null, "", [], {} and 0 count as missing. */
export const present = (value: unknown): boolean => {
  if (value === null || value === undefined || value === "" || value === 0 || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};

/** The date after which the record is gone, or null if it never expires. */
export const lastDate = (rec: OppRecord): string | null => {
  const dates = (rec.event_dates ?? []).filter((d): d is string => present(d));
  if (dates.length) {
    const last = dates.reduce((a, b) => (b > a ? b : a));
    return isIsoDate(last) ? last : null;
  }
  return isIsoDate(rec.deadline) ? rec.deadline : null;     // recurring, rolling, or not listed
};

export const isExpired = (rec: OppRecord, asOf: string): boolean => {
  const d = lastDate(rec);
  return d !== null && d < asOf;
};

export const schemaOk = (rec: OppRecord): boolean => REQUIRED.every((f) => present(rec[f]));

/** Place and type hard filters (not expiry). */
export const matches = (rec: OppRecord, req: Request): boolean => {
  if (rec.opportunity_type !== req.type) return false;
  if ((BOROUGHS as readonly string[]).includes(req.place)) {
    return rec.borough === req.place || rec.borough === "citywide";
  }
  return rec.region === req.place;
};

/** Return [candidates, removed] where removed counts excluded matches by reason. */
export const select = (records: OppRecord[], req: Request): [OppRecord[], RemovedCounts] => {
  const candidates: OppRecord[] = [];
  const removed: RemovedCounts = { expired: 0, failed_schema: 0, duplicate: 0 };
  const seen = new Set<string>();
  for (const rec of records) {
    if (!matches(rec, req)) continue;
    if (!schemaOk(rec)) {
      removed.failed_schema += 1;
    } else if (isExpired(rec, req.asOf)) {
      removed.expired += 1;
    } else if (seen.has(rec.dedupe_key)) {
      removed.duplicate += 1;
    } else {
      seen.add(rec.dedupe_key);
      candidates.push(rec);
    }
  }
  return [candidates, removed];
};
