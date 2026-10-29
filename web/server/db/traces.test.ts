import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Queryable } from "./opportunities.ts";
import { INSERT, PRUNE, PRUNE_EVERY_MS, RETENTION_DAYS, postgresSink, traceValues } from "./traces.ts";

/** Records each query; `fail(text)` decides per call whether it rejects (an Error) or hangs ("hang"). */
const fakeDb = (fail: (text: string) => Error | "hang" | null = () => null) => {
  const calls: { text: string; values: unknown[] }[] = [];
  const db: Queryable = {
    query(text, values) {
      calls.push({ text, values });
      const f = fail(text);
      if (f === "hang") return new Promise(() => {});
      return f ? Promise.reject(f) : Promise.resolve({ rows: [] });
    },
  };
  return { db, calls, inserts: () => calls.filter((c) => c.text === INSERT), prunes: () => calls.filter((c) => c.text === PRUNE) };
};

// Shaped like the lines pipeline.run (fresh) and app.ts's traceReuse (cache) write.
const FRESH = {
  request_id: "aaaaaaaaaaaa", at: "2026-10-29T10:00:00", search_id: "ssssssssssss",
  request: { places: ["brooklyn", "dc"], type: "grant", disciplines: ["music"], as_of: "2026-10-29" },
  attempts: [{ n: 1, ranking: ["r1"], verdict: "accept", critique: "" }], tokens: { input_tokens: 12, output_tokens: 3 },
  filter: { matched: 4, removed: { expired: 1, failed_schema: 0, duplicate: 0 }, sent_to_ranker: 4 },
  tier: 0, served: ["k1"], reason: null,
};
const CACHED = {
  request_id: "bbbbbbbbbbbb", at: "2026-10-29T10:01:00", request: { place: "brooklyn", type: "grant", as_of: "2026-10-29" },
  served_from: "cache", run_request_id: "aaaaaaaaaaaa", snapshot_id: "2026-10-27", tier: 2, served: ["k1"], model_calls: 0,
};

const collect = () => {
  const logs: string[] = [];
  return { logs, log: (l: string) => logs.push(l) };
};

describe("postgresSink", () => {
  it("maps a fresh run's line: its ids and tier in columns, no served_from or run id, the whole line as jsonb", async () => {
    const { db, inserts } = fakeDb();
    await postgresSink(db, { log: () => {} })(FRESH);
    const [call] = inserts();
    assert.deepEqual(call!.values.slice(0, 6), ["aaaaaaaaaaaa", "ssssssssssss", null, null, 0, null]);
    assert.deepEqual(JSON.parse(call!.values[6] as string), FRESH);
    // Parameterized: nothing from the line reaches the SQL text.
    assert.doesNotMatch(call!.text, /aaaa|brooklyn|grant/);
  });

  it("maps a cache line: served_from, the producing run's id and the snapshot", async () => {
    const { db, inserts } = fakeDb();
    await postgresSink(db, { log: () => {} })(CACHED);
    assert.deepEqual(inserts()[0]!.values.slice(0, 6), ["bbbbbbbbbbbb", null, "aaaaaaaaaaaa", "2026-10-27", 2, "cache"]);
  });

  it("a column value of the wrong type is null, never coerced (the line keeps the original)", () => {
    const v = traceValues({ request_id: "x", search_id: 7, tier: "0", served_from: { a: 1 } });
    assert.deepEqual(v.slice(0, 6), ["x", null, null, null, null, null]);
  });

  it("a failed insert is logged (id and error, not the line) and swallowed", async () => {
    const { db } = fakeDb(() => new Error('relation "public.traces" does not exist'));
    const { logs, log } = collect();
    await postgresSink(db, { log })(FRESH);         // resolves: a rejection here would fail the test
    assert.equal(logs.length, 1);
    assert.match(logs[0]!, /^trace write failed for aaaaaaaaaaaa: relation "public.traces" does not exist$/);
    assert.doesNotMatch(logs[0]!, /brooklyn|grant|accept/);
  });

  it("a hung insert is abandoned after the timeout, logged and swallowed", async () => {
    const { db } = fakeDb(() => "hang");
    const { logs, log } = collect();
    const t0 = Date.now();
    await postgresSink(db, { log, timeoutMs: 20 })(FRESH);
    assert.ok(Date.now() - t0 < 1000);
    assert.deepEqual(logs, ["trace write failed for aaaaaaaaaaaa: trace insert timed out after 20ms"]);
  });

  it(`prunes rows older than ${RETENTION_DAYS} days after an insert, at most once an hour (fake clock)`, async () => {
    const { db, prunes } = fakeDb();
    const clock = { t: 1_000_000 };
    const sink = postgresSink(db, { now: () => clock.t, log: () => {} });
    await sink(FRESH);
    await sink(CACHED);
    assert.equal(prunes().length, 1);
    assert.match(PRUNE, /^delete from public\.traces where at < now\(\) - interval '30 days'$/);
    clock.t += PRUNE_EVERY_MS - 1;
    await sink(FRESH);
    assert.equal(prunes().length, 1);
    clock.t += 1;
    await sink(FRESH);
    assert.equal(prunes().length, 2);
  });

  it("concurrent writes prune once", async () => {
    const { db, prunes } = fakeDb();
    const sink = postgresSink(db, { now: () => 5, log: () => {} });
    await Promise.all([sink(FRESH), sink(CACHED), sink(FRESH)]);
    assert.equal(prunes().length, 1);
  });

  it("no prune after a failed insert; a failed prune is logged, swallowed, and not retried within the hour", async () => {
    let insertFails = true;
    const { db, prunes } = fakeDb((text) => (text === INSERT ? (insertFails ? new Error("down") : null) : new Error("prune down")));
    const { logs, log } = collect();
    const sink = postgresSink(db, { now: () => 0, log });
    await sink(FRESH);
    assert.equal(prunes().length, 0);
    insertFails = false;
    await sink(FRESH);
    await sink(FRESH);
    assert.equal(prunes().length, 1);
    assert.deepEqual(logs, ["trace write failed for aaaaaaaaaaaa: down", "trace prune failed: prune down"]);
  });
});
