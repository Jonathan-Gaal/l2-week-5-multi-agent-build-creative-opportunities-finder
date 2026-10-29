/**
 * Filter (code): select snapshot records for a request and drop expired or failed-schema ones.
 * Port of agents/filter.py, generalized to several places and an optional discipline filter.
 *
 * A request is one or more places, an opportunity type, and optional disciplines. A place is an NYC borough
 * or one of the snapshot regions outside NYC; a record matches the request if it matches ANY of its places.
 * Hard filters are never relaxed:
 * - borough places match that borough or 'citywide' (open to any NYC resident); 'unknown' never matches;
 * - region places match the record's region;
 * - type must equal the record's opportunity_type;
 * - disciplines (when given) must share a tag with the record, or the record is tagged 'all'
 *   (taxonomy.fitsDisciplines; an untagged record never matches a discipline filter);
 * - expired: the record's last date is earlier than the request date. For events with several
 *   occurrences that is the last occurrence, so a series that has started but not ended is kept.
 *   'recurring', 'rolling' and a missing deadline never expire.
 * A request with one place and no disciplines behaves exactly as the Python port (same matches, label, trace).
 *
 * Dates are ISO strings (YYYY-MM-DD), which compare correctly as strings.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { BOROUGHS, PLACE_LABELS, type PlaceId, REGIONS, TYPES, disciplineLabel, fitsDisciplines, isDiscipline } from "./taxonomy.ts";

/**
 * The repo root (holds data/, agents/, traces/), ending in a separator. Under Node (tests, CLI scripts) this file
 * runs from its source location, web/server/agents/, three levels below the root. Inside the Next.js server bundle
 * that location isn't the source tree, so the root is found from the working directory instead: next dev/start run
 * in web/, one level below it. The first candidate holding data/snapshots wins.
 */
const findRepo = (): string => {
  const candidates: string[] = [];
  try {
    candidates.push(resolve(dirname(fileURLToPath(import.meta.url)), "../../.."));
  } catch {
    // Not a file: URL (bundled): fall through to the working directory.
  }
  candidates.push(resolve(process.cwd(), ".."), process.cwd());
  const root = candidates.find((dir) => existsSync(join(dir, "data", "snapshots"))) ?? candidates[0]!;
  return root.endsWith(sep) ? root : root + sep;
};

export const REPO = findRepo();
export const SNAPSHOT = `${REPO}data/snapshots/2026-10-27`;

export { BOROUGHS, REGIONS, TYPES } from "./taxonomy.ts";
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

/** `places`: one or more borough or region ids. `disciplines`: discipline ids; empty means no discipline filter. */
export type Request = { places: readonly string[]; type: string; asOf: string; disciplines: readonly string[] };

export type RemovedCounts = { expired: number; failed_schema: number; duplicate: number };

/** Today's date (or `d`'s) in local time, as YYYY-MM-DD. */
export const today = (d: Date = new Date()): string => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A single-place request with no discipline filter (the Python port's request). */
export const makeRequest = (place: string, type: string, asOf: string = today()): Request =>
  ({ places: [place], type, asOf, disciplines: [] });

/** A request over several places and optional disciplines. */
export const makeSearchRequest = (
  places: readonly string[], type: string, asOf: string = today(), disciplines: readonly string[] = [],
): Request => ({ places, type, asOf, disciplines });

const isBorough = (p: string) => (BOROUGHS as readonly string[]).includes(p);
const isPlace = (p: string) => isBorough(p) || (REGIONS as readonly string[]).includes(p);

/** Why the request can't be served, or null. */
export const requestProblem = (req: Request): string | null => {
  if (!req.places.length) return "no place given";
  const badPlace = req.places.find((p) => !isPlace(p));
  if (badPlace !== undefined) return `unknown place '${badPlace}'`;
  if (!(TYPES as readonly string[]).includes(req.type)) {
    return `unknown opportunity type '${req.type}'`;
  }
  const badDiscipline = req.disciplines.find((d) => !isDiscipline(d));
  if (badDiscipline !== undefined) return `unknown discipline '${badDiscipline}'`;
  return null;
};

const titleCase = (s: string) => s.replace(/\w+/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());

/** E.g. "Brooklyn open call" (one place: the Python port's label, unchanged), "Brooklyn, New Jersey grant",
 * "Brooklyn event (Music, Dance)". Used in the prompts and in the Tier 3 reason. */
export const requestLabel = (req: Request): string => {
  const where = req.places.length === 1
    ? titleCase(req.places[0]!.replaceAll("_", " "))
    : req.places.map((p) => PLACE_LABELS[p as PlaceId] ?? p).join(", ");
  const what = req.disciplines.length ? ` (${req.disciplines.map(disciplineLabel).join(", ")})` : "";
  return `${where} ${req.type.replaceAll("_", " ")}${what}`;
};

/** The request as the trace records it: the Python port's shape for one place and no disciplines. */
export const traceRequest = (req: Request): Record<string, unknown> =>
  req.places.length === 1 && !req.disciplines.length
    ? { place: req.places[0], type: req.type, as_of: req.asOf }
    : { places: req.places, type: req.type, disciplines: req.disciplines, as_of: req.asOf };

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

/** A URL safe to put in an href: http(s) only, normalized; anything else (javascript:, data:, relative) is null.
 * Lives here (the Filter) so schemaOk and the API's toOpportunity share one definition. */
export const safeHttpUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

/** The date after which the record is gone, or null if it never expires. Only events are kept alive by their
 * schedule: for an application type (open_call, grant, residency, job) the application deadline drives expiry, so
 * a past deadline expires the record even when it lists a later event date. 'recurring', 'rolling', a missing or
 * non-ISO deadline never expire. */
export const lastDate = (rec: OppRecord): string | null => {
  if (rec.opportunity_type === "event") {
    const dates = (rec.event_dates ?? []).filter((d): d is string => present(d));
    if (dates.length) {
      const last = dates.reduce((a, b) => (b > a ? b : a));
      return isIsoDate(last) ? last : null;
    }
  }
  return isIsoDate(rec.deadline) ? rec.deadline : null;     // recurring, rolling, or not listed
};

export const isExpired = (rec: OppRecord, asOf: string): boolean => {
  const d = lastDate(rec);
  return d !== null && d < asOf;
};

/** REQUIRED fields present, and source_url / checked_at well-formed (not merely truthy): a malformed value must
 * not survive to earn a "Checked <date>" or clickable-link claim downstream. */
export const schemaOk = (rec: OppRecord): boolean =>
  REQUIRED.every((f) => present(rec[f])) && safeHttpUrl(rec.source_url) !== null && isIsoDate(rec.checked_at);

/** One place's rule: a borough matches that borough or citywide; a region matches the record's region. */
export const matchesPlace = (rec: OppRecord, place: string): boolean =>
  isBorough(place) ? rec.borough === place || rec.borough === "citywide" : rec.region === place;

/** Place, type and discipline hard filters (not expiry). */
export const matches = (rec: OppRecord, req: Request): boolean => {
  if (rec.opportunity_type !== req.type) return false;
  if (!req.places.some((p) => matchesPlace(rec, p))) return false;
  return fitsDisciplines(rec.disciplines, req.disciplines);
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
