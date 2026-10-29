/**
 * Read snapshot records from Postgres (supabase/schema.sql) for the request path.
 *
 * The backend connects as a database role that row level security does not restrict, so it would see
 * staging and retired snapshots too. Every read here is pinned to one snapshot id: the published one by
 * default, or an explicit id to check a staged snapshot before publishing it.
 *
 * The app reads through RecordSource, so it can run from Postgres (postgresSource) or from a snapshot's
 * records.json (db/json-source.ts) without depending on SQL text.
 */

import { BOROUGHS, type OppRecord, type Request, REGIONS } from "../agents/filter.ts";
import { disciplineTags } from "../agents/taxonomy.ts";

/** The part of pg.Pool / pg.Client used here, so tests can pass a fake. */
export type Queryable = { query(text: string, values: unknown[]): Promise<{ rows: unknown[] }> };

/** Where the app's records come from. */
export type RecordSource = {
  /** The snapshot to serve when none is pinned; throws NoPublishedSnapshotError when there is none. */
  publishedSnapshotId(): Promise<string>;
  /** Records of `snapshotId` that can match the request (filter.select still applies every hard filter). */
  loadRecords(req: Request, snapshotId: string): Promise<OppRecord[]>;
};

export class NoPublishedSnapshotError extends Error {
  override name = "NoPublishedSnapshotError";
}

// Dates come back as YYYY-MM-DD text, the same as records.json, instead of JS Date objects.
const COLUMNS = `title, dedupe_key, source, source_url, checked_at::text as checked_at, snapshot_id,
  opportunity_type, org, subtype, borough, region, deadline, event_dates::text[] as event_dates, recurrence,
  fee, award, location, eligibility, disciplines, extraction, caveat`;

// The same rules as filter.matches, so only rows that can match leave the database: any borough place
// (borough or 'citywide'), any region place, and, when disciplines are given, a shared tag or 'all'.
const QUERY = `select ${COLUMNS} from public.opportunities
  where snapshot_id = $1 and opportunity_type = $2
    and (borough = any($3::text[]) or region = any($4::text[]))
    and (cardinality($5::text[]) = 0 or disciplines && $5::text[])
  order by dedupe_key`;

export const publishedSnapshotId = async (db: Queryable): Promise<string> => {
  const { rows } = await db.query("select id from public.snapshots where status = 'published'", []);
  const row = rows[0] as { id: string } | undefined;
  if (!row) throw new NoPublishedSnapshotError("no snapshot is published");
  return row.id;
};

/** The query parameters for a request: [snapshot, type, borough keys, regions, discipline tags]. */
export const queryValues = (req: Request, snapshotId: string): unknown[] => {
  const boroughs = req.places.filter((p) => (BOROUGHS as readonly string[]).includes(p));
  const regions = req.places.filter((p) => (REGIONS as readonly string[]).includes(p));
  return [snapshotId, req.type, boroughs.length ? [...boroughs, "citywide"] : [], regions, disciplineTags(req.disciplines)];
};

/** Records that can match the request, from the published snapshot or `snapshotId`. */
export const loadRecords = async (
  db: Queryable, req: Request, snapshotId?: string,
): Promise<{ snapshotId: string; records: OppRecord[] }> => {
  const id = snapshotId ?? (await publishedSnapshotId(db));
  const { rows } = await db.query(QUERY, queryValues(req, id));
  return { snapshotId: id, records: rows as OppRecord[] };
};

export const postgresSource = (db: Queryable): RecordSource => ({
  publishedSnapshotId: () => publishedSnapshotId(db),
  loadRecords: async (req, snapshotId) => (await loadRecords(db, req, snapshotId)).records,
});
