// The API, called in process, against the real Supabase Postgres, code ranker only (no model calls, free).
// Read-only: SELECTs only, against the staged snapshot. Run with `npm run test:integration`; skips without
// DATABASE_URL.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import * as flt from "../../server/agents/filter.ts";
import * as pipeline from "../../server/agents/pipeline.ts";
import { BaselineRanker } from "../../server/agents/roles.ts";
import { toOpportunity } from "../../server/api/app.ts";
import type { MetaResponse, OpportunitiesResponse, Opportunity, SearchResponse } from "../../server/api/types.ts";
import { NoPublishedSnapshotError, publishedSnapshotId } from "../../server/db/opportunities.ts";
import { type Started, TEST_SNAPSHOT, closePool, getPool, opp, startApp } from "../helpers.ts";

const SKIP = process.env.DATABASE_URL
  ? false
  : "DATABASE_URL is not set (export it in the shell or put it in web/.env); database integration tests skipped";
if (SKIP) console.log(`# ${SKIP}`);

const BASELINE_ENV = { RANKER_MODE: "baseline", SNAPSHOT_ID: TEST_SNAPSHOT };

const OPPORTUNITY_KEYS = [
  "title", "org", "type", "subtype", "place", "location", "deadline", "event_dates", "recurrence", "fee", "award",
  "eligibility", "source", "source_url", "label", "caveat", "dedupe_key",
].sort();

/** The OpportunitiesResponse shape from api/types.ts, field by field. */
const assertShape = (body: OpportunitiesResponse) => {
  const keys = ["snapshot_id", "as_of", "tier", "results", "removed", "request_id", ...(body.tier === 3 ? ["reason"] : [])];
  assert.deepEqual(Object.keys(body).sort(), keys.sort());
  assert.equal(body.snapshot_id, TEST_SNAPSHOT);
  assert.match(body.as_of, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok([0, 2, 3].includes(body.tier));
  assert.match(body.request_id, /^[0-9a-f]{12}$/);
  assert.ok(body.removed === null || typeof body.removed === "string");
  assert.ok(body.results.length <= 5);
  if (body.tier === 3) {
    assert.equal(body.results.length, 0);
    assert.equal(typeof body.reason, "string");
  }
  for (const r of body.results) {
    assert.deepEqual(Object.keys(r).sort(), OPPORTUNITY_KEYS);
    for (const k of ["title", "type", "deadline", "fee", "source", "label", "dedupe_key"] as const) {
      assert.equal(typeof r[k], "string", `${k} is a string`);
    }
    assert.ok(r.eligibility === "Eligibility not stated" || Array.isArray(r.eligibility));
  }
};

const isHttpUrl = (u: string) => {
  const p = new URL(u).protocol;
  return p === "http:" || p === "https:";
};

/** What the server should answer: the pipeline over records.json for the same request and date. */
const expectedFromJson = async (fromJson: flt.OppRecord[], place: string, type: string, asOf: string) => {
  const out = await pipeline.run(flt.makeRequest(place, type, asOf), fromJson, new BaselineRanker());
  const results: Opportunity[] = out.results.map(toOpportunity);
  return JSON.parse(JSON.stringify({ tier: out.tier, results, removed: out.removed, reason: out.reason ?? undefined }));
};
const comparable = (b: OpportunitiesResponse) =>
  JSON.parse(JSON.stringify({ tier: b.tier, results: b.results, removed: b.removed, reason: b.tier === 3 ? b.reason : undefined }));

// Every place once, cycling through the types so each type is covered 4 times (the full sweep is check:db).
const PLACES = [...flt.BOROUGHS, ...flt.REGIONS];
const SAMPLE = PLACES.map((place, i) => [place, flt.TYPES[i % flt.TYPES.length]!] as const);

describe("API on real Postgres (baseline ranker)", { skip: SKIP }, () => {
  let app: Started;
  let fromJson: flt.OppRecord[];
  const seen: OpportunitiesResponse[] = [];

  before(async () => {
    fromJson = flt.load(`${flt.REPO}data/snapshots/${TEST_SNAPSHOT}`);
    app = await startApp(BASELINE_ENV);
  });
  after(async () => {
    await app?.close();
    await closePool();
  });

  it("GET /api/health", async () => {
    const r = await app.get("/api/health");
    assert.deepEqual([r.status, r.body], [200, { ok: true }]);
  });

  it("GET /api/meta lists exactly filter.ts's places and types, in order", async () => {
    const r = await app.get("/api/meta");
    assert.equal(r.status, 200);
    const meta = r.body as MetaResponse;
    assert.deepEqual(meta.boroughs.map((o) => o.value), [...flt.BOROUGHS]);
    assert.deepEqual(meta.regions.map((o) => o.value), [...flt.REGIONS]);
    assert.deepEqual(meta.types.map((o) => o.value).sort(), [...flt.TYPES].sort());
    for (const o of [...meta.boroughs, ...meta.regions, ...meta.types, ...meta.disciplines, ...meta.place_groups]) {
      assert.ok(o.label.length > 0);
    }
  });

  for (const [place, type] of [["brooklyn", "open_call"], ["new_jersey", "event"]] as const) {
    it(`${place} ${type}: 200, the API shape, same result as records.json`, async () => {
      const r = await app.get(opp(place, type));
      assert.equal(r.status, 200);
      const body = r.body as OpportunitiesResponse;
      assertShape(body);
      seen.push(body);
      assert.deepEqual(comparable(body), await expectedFromJson(fromJson, place, type, body.as_of));
    });
  }

  it(`sample of ${SAMPLE.length} place x type requests matches records.json`, async () => {
    const differ: string[] = [];
    for (const [place, type] of SAMPLE) {
      const r = await app.get(opp(place, type));
      assert.equal(r.status, 200, `${place} ${type}`);
      const body = r.body as OpportunitiesResponse;
      assertShape(body);
      seen.push(body);
      const want = await expectedFromJson(fromJson, place, type, body.as_of);
      if (JSON.stringify(comparable(body)) !== JSON.stringify(want)) differ.push(`${place} ${type}`);
    }
    assert.deepEqual(differ, []);
    // The sample should exercise real results, not only Tier 3.
    assert.ok(seen.some((b) => b.results.length > 0));
  });

  it("a second identical request is a cache hit: no database query, traced as served from the cache", async () => {
    // manhattan job is not in SAMPLE, so the first request here is a fresh run.
    const first = (await app.get(opp("manhattan", "job"))).body as OpportunitiesResponse;
    const queries = app.db.queries;
    const second = await app.get(opp("manhattan", "job"));
    assert.equal(second.status, 200);
    const body = second.body as OpportunitiesResponse;
    assert.equal(app.db.queries, queries);
    assert.notEqual(body.request_id, first.request_id);
    assert.deepEqual({ ...body, request_id: "" }, { ...first, request_id: "" });
    const line = app.trace(body.as_of).find((l) => l.request_id === body.request_id);
    assert.ok(line, "trace line for the cached request");
    assert.deepEqual([line.served_from, line.run_request_id, line.model_calls], ["cache", first.request_id, 0]);
  });

  it("GET /api/search: one call, every group the same as the pipeline over records.json", async () => {
    const r = await app.get("/api/search?places=brooklyn,tristate&types=open_call,event,grant&disciplines=music,dance");
    assert.equal(r.status, 200);
    const body = r.body as SearchResponse;
    assert.deepEqual([body.snapshot_id, body.groups.map((g) => g.type)], [TEST_SNAPSHOT, ["open_call", "event", "grant"]]);
    const places = ["brooklyn", "nyc", "long_island", "westchester_hudson", "upstate_ny", "new_jersey", "connecticut"];
    for (const g of body.groups) {
      const out = await pipeline.run(flt.makeSearchRequest(places, g.type, body.as_of, ["music", "dance"]), fromJson, new BaselineRanker());
      const want = { tier: out.tier, results: out.results.map(toOpportunity), removed: out.removed, removed_counts: out.removed_counts,
        reason: out.reason ?? undefined };
      const got = { tier: g.tier, results: g.results, removed: g.removed, removed_counts: g.removed_counts,
        reason: g.tier === 3 ? g.reason : undefined };
      assert.deepEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(want)), g.type);
    }
    assert.ok(body.groups.some((g) => g.results.length > 0));
  });

  it("400 for a bad place, an extra parameter, or as_of, without echoing the input", async () => {
    for (const path of [
      opp("atlantis", "open_call"), `${opp("brooklyn", "open_call")}&limit=50`,
      `${opp("brooklyn", "open_call")}&as_of=2020-01-01`,
    ]) {
      const r = await app.get(path);
      assert.deepEqual([r.status, r.body.error], [400, "bad_request"], path);
      assert.ok(!JSON.stringify(r.body).includes("atlantis"));
    }
  });

  it("404 for an unknown path, 405 for another method", async () => {
    const nf = await app.get("/api/nope");
    assert.deepEqual([nf.status, nf.body.error], [404, "not_found"]);
    const post = await app.get("/api/meta", { method: "POST" });
    assert.deepEqual([post.status, post.body.error], [405, "method_not_allowed"]);
  });

  it("503 no_snapshot without SNAPSHOT_ID while nothing is published", async (t) => {
    try {
      const id = await publishedSnapshotId(getPool());
      t.skip(`snapshot ${id} is published, so no_snapshot cannot happen`);
      return;
    } catch (e) {
      if (!(e instanceof NoPublishedSnapshotError)) throw e;
    }
    const unpinned = await startApp({ ...BASELINE_ENV, SNAPSHOT_ID: undefined });
    try {
      const r = await unpinned.get(opp("brooklyn", "open_call"));
      assert.deepEqual([r.status, r.body.error], [503, "no_snapshot"]);
    } finally {
      await unpinned.close();
    }
  });

  it("every source_url served is http(s) or null", () => {
    assert.ok(seen.length > 0);
    const urls = seen.flatMap((b) => b.results.map((r) => r.source_url));
    const bad = urls.filter((u) => u !== null && !isHttpUrl(u));
    assert.deepEqual(bad, []);
  });
});
