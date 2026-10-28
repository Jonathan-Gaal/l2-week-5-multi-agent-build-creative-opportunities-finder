/**
 * RecordSource over a snapshot file (data/snapshots/<id>/records.json) instead of Postgres: DATA_SOURCE=json.
 * For local development and the UI: no DATABASE_URL, no SQL. The file is read once, at startup, and records are
 * kept in file order (the order the eval and the parity check use). The file's snapshot is the only one served.
 */

import { existsSync } from "node:fs";

import { type OppRecord, REPO, load, matches } from "../agents/filter.ts";
import type { RecordSource } from "./opportunities.ts";

/** A snapshot id usable as one directory name (no separators, no "..", nothing hidden). */
export const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const snapshotDir = (snapshotId: string, root = `${REPO}data/snapshots`) => `${root}/${snapshotId}`;

/** Throws (naming the id, never file contents) if the id is malformed or the file is missing or unreadable. */
export const jsonSource = (snapshotId: string, dir = snapshotDir(snapshotId)): RecordSource => {
  if (!SNAPSHOT_ID_PATTERN.test(snapshotId)) throw new Error("SNAPSHOT_ID must be a snapshot directory name like 2026-10-27");
  if (!existsSync(`${dir}/records.json`)) throw new Error(`no records.json for snapshot ${snapshotId}`);
  const records: OppRecord[] = load(dir);
  if (!Array.isArray(records)) throw new Error(`records.json for snapshot ${snapshotId} has no records list`);
  return {
    publishedSnapshotId: async () => snapshotId,
    // Pinned like the database reads: another snapshot id finds nothing.
    loadRecords: async (req, id) => records.filter((r) => r.snapshot_id === id && matches(r, req)),
  };
};
