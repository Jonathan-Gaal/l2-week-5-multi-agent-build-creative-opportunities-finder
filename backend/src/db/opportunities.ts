/**
 * Read snapshot records from Postgres (supabase/schema.sql) for the request path.
 *
 * The backend connects as a database role that row level security does not restrict, so it would see
 * staging and retired snapshots too. Every read here is pinned to one snapshot id: the published one by
 * default, or an explicit id to check a staged snapshot before publishing it.
 */

import { BOROUGHS, type OppRecord, type Request } from "../agents/filter.ts";

/** The part of pg.Pool / pg.Client used here, so tests can pass a fake. */
export type Queryable = { query(text: string, values: unknown[]): Promise<{ rows: unknown[] }> };

export class NoPublishedSnapshotError extends Error {
  override name = "NoPublishedSnapshotError";
}

// Dates come back as YYYY-MM-DD text, the same as records.json, instead of JS Date objects.
const COLUMNS = `title, dedupe_key, source, source_url, checked_at::text as checked_at, snapshot_id,
  opportunity_type, org, subtype, borough, region, deadline, event_dates::text[] as event_dates, recurrence,
  fee, award, location, eligibility, disciplines, extraction, caveat`;

// The same place rule as filter.matches, so only rows that can match leave the database.
// filter.select still applies every hard filter to what comes back.
const BOROUGH_QUERY = `select ${COLUMNS} from public.opportunities
  where snapshot_id = $1 and opportunity_type = $2 and borough in ($3, 'citywide') order by dedupe_key`;
const REGION_QUERY = `select ${COLUMNS} from public.opportunities
  where snapshot_id = $1 and opportunity_type = $2 and region = $3 order by dedupe_key`;

export const publishedSnapshotId = async (db: Queryable): Promise<string> => {
  const { rows } = await db.query("select id from public.snapshots where status = 'published'", []);
  const row = rows[0] as { id: string } | undefined;
  if (!row) throw new NoPublishedSnapshotError("no snapshot is published");
  return row.id;
};

/** Records that can match the request's place and type, from the published snapshot or `snapshotId`. */
export const loadRecords = async (
  db: Queryable, req: Request, snapshotId?: string,
): Promise<{ snapshotId: string; records: OppRecord[] }> => {
  const id = snapshotId ?? (await publishedSnapshotId(db));
  const sql = (BOROUGHS as readonly string[]).includes(req.place) ? BOROUGH_QUERY : REGION_QUERY;
  const { rows } = await db.query(sql, [id, req.type, req.place]);
  return { snapshotId: id, records: rows as OppRecord[] };
};
