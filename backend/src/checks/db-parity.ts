/**
 * Check that the pipeline gives the same results from Postgres as from the JSON snapshot.
 * Runs every place and type on three dates with the code baseline ranker (no model calls).
 *
 * Usage:
 *   npm run check:db                  # snapshot 2026-10-27, staged or published
 *   npm run check:db -- <snapshot-id>
 */

import * as flt from "../agents/filter.ts";
import * as pipeline from "../agents/pipeline.ts";
import { BaselineRanker } from "../agents/roles.ts";
import { loadRecords } from "../db/opportunities.ts";
import { closePool, getPool } from "../db/pool.ts";

const DATES = ["2026-10-28", "2026-12-15", "2027-06-01"];

const main = async () => {
  const snapshotId = process.argv[2] ?? "2026-10-27";
  const fromJson = flt.load(`${flt.REPO}data/snapshots/${snapshotId}`);
  const db = getPool();
  let checked = 0;
  const differ: string[] = [];
  for (const date of DATES) {
    for (const place of [...flt.BOROUGHS, ...flt.REGIONS]) {
      for (const type of flt.TYPES) {
        const req = flt.makeRequest(place, type, date);
        const { records } = await loadRecords(db, req, snapshotId);
        const [a, b] = await Promise.all([
          pipeline.run(req, fromJson, new BaselineRanker()),
          pipeline.run(req, records, new BaselineRanker()),
        ]);
        delete a.request_id;
        delete b.request_id;
        if (JSON.stringify(a) !== JSON.stringify(b)) differ.push(`${date} ${place} ${type}`);
        checked += 1;
      }
    }
  }
  console.log(`${checked} requests checked against snapshot ${snapshotId}; ${differ.length} differ`);
  for (const d of differ) console.log(`  differs: ${d}`);
  if (differ.length) process.exitCode = 1;
};

main()
  .catch((e: Error) => {
    console.error(e.message);
    process.exitCode = 2;
  })
  .finally(closePool);
