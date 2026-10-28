/**
 * Check that the pipeline gives the same results from Postgres as from the JSON snapshot.
 * Runs every place and type on three dates with the code baseline ranker (no model calls), then a set of
 * multi-place and discipline searches (the /api/search shape) on the same dates.
 *
 * Usage:
 *   npm run check:db                  # snapshot 2026-10-27, staged or published
 *   npm run check:db -- <snapshot-id>
 */

import * as flt from "../agents/filter.ts";
import { expandPlaceChoices } from "../agents/taxonomy.ts";
import * as pipeline from "../agents/pipeline.ts";
import { BaselineRanker } from "../agents/roles.ts";
import { loadRecords } from "../db/opportunities.ts";
import { closePool, getPool } from "../db/pool.ts";

const DATES = ["2026-10-28", "2026-12-15", "2027-06-01"];
const PLACE_SETS = [["brooklyn", "new_jersey"], ["manhattan", "queens", "bronx"], expandPlaceChoices(["tristate"]),
  expandPlaceChoices(["staten_island", "wider"])];
const DISCIPLINE_SETS = [[], ["music", "dance"], ["visual"], ["writing", "theater", "film"]];

const main = async () => {
  const snapshotId = process.argv[2] ?? "2026-10-27";
  const fromJson = flt.load(`${flt.REPO}data/snapshots/${snapshotId}`);
  const db = getPool();
  const differ: string[] = [];
  const check = async (req: flt.Request, name: string) => {
    const { records } = await loadRecords(db, req, snapshotId);
    const [a, b] = await Promise.all([
      pipeline.run(req, fromJson, new BaselineRanker()),
      pipeline.run(req, records, new BaselineRanker()),
    ]);
    delete a.request_id;
    delete b.request_id;
    if (JSON.stringify(a) !== JSON.stringify(b)) differ.push(name);
  };
  let single = 0;
  let multi = 0;
  for (const date of DATES) {
    for (const place of [...flt.BOROUGHS, ...flt.REGIONS]) {
      for (const type of flt.TYPES) {
        await check(flt.makeRequest(place, type, date), `${date} ${place} ${type}`);
        single += 1;
      }
    }
    for (const places of PLACE_SETS) {
      for (const disciplines of DISCIPLINE_SETS) {
        for (const type of flt.TYPES) {
          await check(flt.makeSearchRequest(places, type, date, disciplines), `${date} ${places.join("+")} ${type} [${disciplines.join(",")}]`);
          multi += 1;
        }
      }
    }
  }
  console.log(`${single + multi} requests (${single} single-place, ${multi} multi-place/discipline) checked against snapshot ${snapshotId}; ${differ.length} differ`);
  for (const d of differ) console.log(`  differs: ${d}`);
  if (differ.length) process.exitCode = 1;
};

main()
  .catch((e: Error) => {
    console.error(e.message);
    process.exitCode = 2;
  })
  .finally(closePool);
