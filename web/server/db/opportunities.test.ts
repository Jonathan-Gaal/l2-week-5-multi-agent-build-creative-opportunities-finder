import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { makeRequest, makeSearchRequest, select } from "../agents/filter.ts";
import { NoPublishedSnapshotError, type Queryable, loadRecords, queryValues } from "./opportunities.ts";

/** Answers the snapshot lookup with `published` and every other query with `rows`, recording each call. */
const fakeDb = (published: string[], rows: unknown[] = []) => {
  const calls: { text: string; values: unknown[] }[] = [];
  const db: Queryable = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows: text.includes("from public.snapshots") ? published.map((id) => ({ id })) : rows };
    },
  };
  return { db, calls };
};

describe("loadRecords", () => {
  it("reads the published snapshot", async () => {
    const { db, calls } = fakeDb(["2026-10-27"], [{ title: "A" }]);
    const out = await loadRecords(db, makeRequest("brooklyn", "grant", "2026-11-01"));
    assert.equal(out.snapshotId, "2026-10-27");
    assert.deepEqual(out.records, [{ title: "A" }]);
    assert.deepEqual(calls[1]!.values, ["2026-10-27", "grant", ["brooklyn", "citywide"], [], []]);
  });

  it("borough places add citywide; region places match the region only; disciplines become tags plus 'all'", async () => {
    const { db, calls } = fakeDb(["s"]);
    await loadRecords(db, makeRequest("queens", "event", "2026-11-01"));
    await loadRecords(db, makeRequest("new_jersey", "event", "2026-11-01"));
    await loadRecords(db, makeSearchRequest(["brooklyn", "queens", "new_jersey", "dc"], "grant", "2026-11-01", ["music", "dance"]));
    assert.deepEqual(calls[1]!.values, ["s", "event", ["queens", "citywide"], [], []]);
    assert.deepEqual(calls[3]!.values, ["s", "event", [], ["new_jersey"], []]);
    assert.deepEqual(calls[5]!.values,
      ["s", "grant", ["brooklyn", "queens", "citywide"], ["new_jersey", "dc"], ["all", "music", "sound", "dance"]]);
    // One parameterized query for every shape: request values never reach the SQL text.
    assert.equal(new Set([calls[1]!.text, calls[3]!.text, calls[5]!.text]).size, 1);
    assert.doesNotMatch(calls[5]!.text, /brooklyn|music|grant/);
  });

  it("no published snapshot is an error, not an empty result", async () => {
    const { db, calls } = fakeDb([]);
    await assert.rejects(loadRecords(db, makeRequest("brooklyn", "grant", "2026-11-01")), NoPublishedSnapshotError);
    assert.equal(calls.length, 1);
  });

  it("an explicit snapshot id skips the published lookup", async () => {
    const { db, calls } = fakeDb([]);
    const out = await loadRecords(db, makeRequest("brooklyn", "grant", "2026-11-01"), "2026-10-27");
    assert.equal(out.snapshotId, "2026-10-27");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.values[0], "2026-10-27");
  });
});

describe("extra kinds (also_subtypes) and fetched_at on the Postgres path", () => {
  // A casting call that is also a paid gig, as the database returns it (dates as text, arrays as arrays).
  const row = {
    title: "Paid reading", dedupe_key: "k1", source: "backstage", source_url: "https://example.org/a", checked_at: "2026-11-01",
    snapshot_id: "s", opportunity_type: "open_call", subtype: "casting_call", also_subtypes: ["paid_gig"], borough: "manhattan",
    region: "nyc", deadline: "2026-12-01", event_dates: null, disciplines: ["theater"], eligibility: [], fetched_at: "2026-10-27",
  };

  it("selects also_subtypes and fetched_at (as YYYY-MM-DD text), and passes them through unchanged", async () => {
    const { db, calls } = fakeDb(["s"], [row]);
    const out = await loadRecords(db, makeSearchRequest(["manhattan"], "open_call", "2026-11-01", [], ["paid_gig"]));
    assert.match(calls[1]!.text, /\bsubtype, also_subtypes,/);
    assert.match(calls[1]!.text, /fetched_at::text as fetched_at/);
    assert.deepEqual(out.records[0]!.also_subtypes, ["paid_gig"]);
    assert.equal(out.records[0]!.fetched_at, "2026-10-27");
  });

  it("the database never filters by kind, so a row picked only through also_subtypes reaches the Filter, which keeps it", async () => {
    const req = makeSearchRequest(["manhattan"], "open_call", "2026-11-01", [], ["paid_gig"]);
    assert.deepEqual(queryValues(req, "s"), queryValues({ ...req, subtypes: [] }, "s"));
    const { db, calls } = fakeDb(["s"], [row]);
    const { records } = await loadRecords(db, req);
    assert.doesNotMatch(calls[1]!.text.split("where")[1]!, /subtype/);
    assert.deepEqual(select(records, req)[0].map((r) => r.dedupe_key), ["k1"]);
    // Without the column (the old select) the same row is dropped: the reason it is selected.
    assert.deepEqual(select([{ ...row, also_subtypes: undefined }], req)[0], []);
  });
});
