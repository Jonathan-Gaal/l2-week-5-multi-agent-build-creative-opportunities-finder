// The API end to end through its Request -> Response handler, with a fake database and a fake model.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import type { OppRecord } from "../agents/filter.ts";
import { type CallOptions, type Model, ModelError } from "../agents/model.ts";
import { type Queryable, postgresSource } from "../db/opportunities.ts";
import { type AppDeps, type Limits, createApp, parseOpportunitiesQuery, parseSearchQuery, safeHttpUrl } from "./app.ts";
import { ConfigError, readConfig } from "./config.ts";
import type { MetaResponse, OpportunitiesResponse, SearchResponse } from "./types.ts";

const NOW = new Date(2026, 9, 28, 12).getTime();
const rec = (title: string, extra: Partial<OppRecord> = {}): OppRecord => ({
  title, dedupe_key: title.toLowerCase(), source: "s", source_url: `https://example.org/${title}`,
  checked_at: "2026-10-27", snapshot_id: "snap1", opportunity_type: "open_call", borough: "brooklyn", region: "nyc",
  deadline: "2026-12-01", ...extra,
});
const RECORDS = [
  rec("A", { source_url: "javascript:alert(1)" }), rec("B"), rec("C", { source_url: "data:text/html,x" }),
  rec("G", { opportunity_type: "grant" }), rec("R", { opportunity_type: "residency" }), rec("E", { opportunity_type: "event" }),
  rec("J", { opportunity_type: "job" }),
];

type FakeDb = Queryable & { published: string | null; fail: Error | null; queries: number };
/** Answers every records query with `rows` (the pipeline's Filter does the matching). */
const fakeDb = (rows: OppRecord[] = RECORDS): FakeDb => ({
  published: "snap1", fail: null, queries: 0,
  async query(text: string) {
    this.queries += 1;
    if (this.fail) throw this.fail;
    if (text.includes("public.snapshots")) return { rows: this.published ? [{ id: this.published }] : [] };
    return { rows };
  },
});

/** Ranks the first candidate (or `rankIds`) and accepts. `delayMs` honors the abort signal like the SDK. */
type FakeModel = Model & { calls: number; ranker: number; reviewer: number; delayMs: number; error: Error | null; rankIds: string[] };
const fakeModel = (): FakeModel => ({
  calls: 0, ranker: 0, reviewer: 0, delayMs: 0, error: null, rankIds: ["r1"],
  async call(_s: string, _u: string, schema: Record<string, unknown>, opts?: CallOptions) {
    this.calls += 1;
    if (this.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, this.delayMs);
        opts?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new ModelError("APIUserAbortError: Request was aborted."));
        });
      });
    }
    if (this.error) throw this.error;
    const isRanker = "ranking" in (schema.properties as object);
    if (isRanker) {
      this.ranker += 1;
      return [{ ranking: this.rankIds.map((id) => ({ id, reason: "fit" })) }, { input_tokens: 10, output_tokens: 5 }];
    }
    this.reviewer += 1;
    return [{ verdict: "accept", critique: "" }, { input_tokens: 10, output_tokens: 5 }];
  },
});

type Setup = Partial<Omit<AppDeps, "limits" | "source">> & { limits?: Partial<Limits>; db?: FakeDb };
const start = async ({ db = fakeDb(), ...setup }: Setup = {}) => {
  const model = (setup.model as FakeModel | undefined) ?? fakeModel();
  const logs: string[] = [];
  const clock = { t: NOW };
  const handler = createApp({
    source: postgresSource(db), model, mode: "ranker_reviewer", traceDir: null,
    now: () => clock.t, log: (l) => logs.push(l), ...setup, limits: setup.limits ?? {},
  });
  /** One request from `client` (the rate-limit key the Next.js server passes). */
  const get = async (path: string, init: RequestInit = {}, client = "127.0.0.1") => {
    const res = await handler(new Request(`http://app${path}`, init), client);
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
  return { get, db, model, logs, clock };
};
const opp = (place: string, type: string) => `/api/opportunities?place=${place}&type=${type}`;

describe("routing", () => {
  it("health, meta, 404, 405", async () => {
    const { get, db } = await start();
    assert.deepEqual((await get("/api/health")).body, { ok: true });
    assert.equal(db.queries, 0);                       // health touches neither the db nor the model
    const meta = (await get("/api/meta")).body as MetaResponse;
    assert.deepEqual([meta.boroughs.length, meta.regions.length, meta.types.length], [5, 15, 5]);
    assert.deepEqual(meta.boroughs[3], { value: "bronx", label: "The Bronx" });
    const nf = await get("/nope");
    assert.deepEqual([nf.status, nf.body.error], [404, "not_found"]);
    const post = await get("/api/health", { method: "POST" });
    assert.deepEqual([post.status, post.body.error, post.headers.get("allow")], [405, "method_not_allowed", "GET"]);
    assert.equal(nf.headers.get("cache-control"), "no-store");
  });
});

describe("GET /api/opportunities", () => {
  it("serves the pipeline result with server-set as_of, snapshot id and request id", async () => {
    const { get, model } = await start();
    const r = await get(opp("brooklyn", "open_call"));
    const body = r.body as OpportunitiesResponse;
    assert.equal(r.status, 200);
    assert.deepEqual([body.tier, body.as_of, body.snapshot_id, body.removed], [0, "2026-10-28", "snap1", null]);
    assert.match(body.request_id, /^[0-9a-f]{12}$/);
    assert.equal(body.results.length, 1);
    assert.deepEqual([model.ranker, model.reviewer], [1, 1]);
  });

  it("drops non-http(s) links from results", async () => {
    const model = fakeModel();
    model.rankIds = ["r1", "r2", "r3"];
    const { get } = await start({ model });
    const body = (await get(opp("brooklyn", "open_call"))).body as OpportunitiesResponse;
    const urls = Object.fromEntries(body.results.map((x) => [x.title, x.source_url]));
    assert.deepEqual(urls, { A: null, B: "https://example.org/B", C: null });
  });

  it("tier 3 carries the reason", async () => {
    const { get, model } = await start();
    const body = (await get(opp("queens", "open_call"))).body;
    // queens has no borough match (only brooklyn records); citywide none either
    assert.deepEqual([body.tier, body.reason, body.results], [3, "no records match Queens open call", []]);
    assert.equal(model.calls, 0);
  });

  it("rejects bad input with a fixed 400 that does not echo it, before any db or model work", async () => {
    const { get, db, model } = await start();
    for (const path of [
      opp("<script>x</script>", "open_call"), opp("brooklyn", "gallery"), "/api/opportunities?place=brooklyn",
      "/api/opportunities", `${opp("brooklyn", "open_call")}&as_of=2020-01-01`, `${opp("brooklyn", "open_call")}&place=queens`,
      opp("Brooklyn", "open_call"), opp("brooklyn%00", "open_call"), `${opp("brooklyn", "open_call")}&x=${"a".repeat(600)}`,
    ]) {
      const r = await get(path);
      assert.equal(r.status, 400, path);
      assert.equal(r.body.error, "bad_request");
      assert.ok(!JSON.stringify(r.body).includes("script") && !JSON.stringify(r.body).includes("gallery"));
    }
    assert.deepEqual([db.queries, model.calls], [0, 0]);
  });
});

describe("parseOpportunitiesQuery and safeHttpUrl", () => {
  it("accepts exactly place and type from the lists", () => {
    assert.deepEqual(parseOpportunitiesQuery(new URLSearchParams("type=grant&place=dc")), { place: "dc", type: "grant" });
    assert.equal(parseOpportunitiesQuery(new URLSearchParams("place=dc&type=grant&type=job")), null);
    assert.equal(parseOpportunitiesQuery(new URLSearchParams("place=&type=grant")), null);
    assert.equal(parseOpportunitiesQuery(new URLSearchParams("place=toString&type=grant")), null);
  });

  it("keeps only absolute http(s) URLs", () => {
    assert.equal(safeHttpUrl("https://a.org/x?y=1"), "https://a.org/x?y=1");
    assert.equal(safeHttpUrl("HTTP://A.org"), "http://a.org/");
    for (const bad of ["javascript:alert(1)", " javascript:alert(1)", "JaVaScRiPt:x", "data:text/html,x", "/relative",
      "ftp://a.org", "", null, 42]) {
      assert.equal(safeHttpUrl(bad), null, String(bad));
    }
  });
});

describe("cost controls", () => {
  it("identical requests are served from the cache: no new model calls, own request id, traced", async () => {
    const traceDir = mkdtempSync(`${tmpdir()}/api-trace-`);
    const { get, model } = await start({ traceDir });
    const a = (await get(opp("brooklyn", "open_call"))).body;
    const b = (await get(opp("brooklyn", "open_call"))).body;
    assert.equal(model.calls, 2);
    assert.notEqual(a.request_id, b.request_id);
    assert.deepEqual(b.results, a.results);
    const lines = readFileSync(`${traceDir}/2026-10-28.jsonl`, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.length, 2);
    assert.deepEqual([lines[1].served_from, lines[1].run_request_id, lines[1].request_id], ["cache", a.request_id, b.request_id]);
  });

  it("the cache key includes the date: the next day runs again", async () => {
    const { get, model, clock } = await start();
    await get(opp("brooklyn", "open_call"));
    clock.t += 24 * 3600_000;
    const r = (await get(opp("brooklyn", "open_call"))).body;
    assert.deepEqual([model.calls, r.as_of], [4, "2026-10-29"]);
  });

  it("concurrent identical requests share one run", async () => {
    const model = fakeModel();
    model.delayMs = 30;
    const { get } = await start({ model });
    const rs = await Promise.all([1, 2, 3].map(() => get(opp("brooklyn", "open_call"))));
    assert.deepEqual(rs.map((r) => r.status), [200, 200, 200]);
    assert.equal(model.calls, 2);
    assert.equal(new Set(rs.map((r) => r.body.request_id)).size, 3);
  });

  it("rate limit counts only model runs: over the limit is 429 with Retry-After; cache hits still served", async () => {
    const { get, logs } = await start({ limits: { ratePerMinute: 2 } });
    assert.equal((await get(opp("brooklyn", "open_call"))).status, 200);
    assert.equal((await get(opp("brooklyn", "grant"))).status, 200);
    const limited = await get(opp("brooklyn", "residency"));
    assert.deepEqual([limited.status, limited.body.error, limited.headers.get("retry-after")], [429, "rate_limited", "60"]);
    assert.equal((await get(opp("brooklyn", "open_call"))).status, 200);   // cache hit
    assert.ok(logs.some((l) => l.startsWith("rate limited")));
  });

  it("baseline mode is not rate limited and never calls the model", async () => {
    const model = fakeModel();
    const { get } = await start({ mode: "baseline", model, limits: { ratePerMinute: 1 } });
    for (const t of ["open_call", "grant", "residency", "event"]) assert.equal((await get(opp("brooklyn", t))).status, 200);
    assert.equal(model.calls, 0);
  });

  it("daily budget: counts each call; when used up the run serves Tier 2 and stops calling the model", async () => {
    const { get, model, clock } = await start({ limits: { dailyModelCalls: 1 } });
    const first = (await get(opp("brooklyn", "open_call"))).body;
    assert.deepEqual([first.tier, model.ranker, model.reviewer], [2, 1, 0]);   // reviewer refused by the budget
    assert.ok(first.results[0].label.endsWith("not fully checked"));
    const second = (await get(opp("brooklyn", "grant"))).body;
    assert.deepEqual([second.tier, second.results.length, model.calls], [2, 1, 1]);   // code baseline, no call
    clock.t += 24 * 3600_000;                                                    // next day: budget is back
    const third = (await get(opp("brooklyn", "event"))).body;
    assert.deepEqual([third.tier, model.ranker, model.reviewer], [2, 2, 0]);    // one call again, Ranker only
  });

  it("budget used up: requests are not rate limited (no model call is made)", async () => {
    const { get } = await start({ limits: { dailyModelCalls: 0, ratePerMinute: 1 } });
    for (const t of ["open_call", "grant", "residency"]) assert.equal((await get(opp("brooklyn", t))).body.tier, 2);
  });

  it("degraded results are cached briefly, then recomputed", async () => {
    const model = fakeModel();
    model.error = new ModelError("APIError: 529 overloaded");
    const { get, clock } = await start({ model });
    assert.equal((await get(opp("brooklyn", "open_call"))).body.tier, 2);
    const callsAfterFirst = model.calls;
    await get(opp("brooklyn", "open_call"));
    assert.equal(model.calls, callsAfterFirst);          // still cached
    model.error = null;
    clock.t += 5 * 60_000;
    assert.equal((await get(opp("brooklyn", "open_call"))).body.tier, 0);
  });

  it("deadline: the in-flight call is aborted and the request returns Tier 2 promptly", async () => {
    const model = fakeModel();
    model.delayMs = 5_000;
    const { get, logs } = await start({ model, limits: { requestDeadlineMs: 50 } });
    const t0 = Date.now();
    const r = (await get(opp("brooklyn", "open_call"))).body;
    assert.ok(Date.now() - t0 < 2_000);
    assert.deepEqual([r.tier, r.results.length, model.calls], [2, 3, 1]);     // code baseline: A, B, C
    assert.ok(logs.some((l) => l.includes("request deadline passed")));
  });

  it("concurrency cap: past the running and queued limits, a new run gets 503 busy", async () => {
    const model = fakeModel();
    model.delayMs = 200;
    const { get } = await start({ model, limits: { maxConcurrentRuns: 1, maxQueuedRuns: 0 } });
    const [a, b] = await Promise.all([get(opp("brooklyn", "open_call")), get(opp("brooklyn", "grant"))]);
    assert.deepEqual([a.status, b.status, b.body.error, b.headers.get("retry-after")], [200, 503, "busy", "5"]);
    assert.equal(model.calls, 2);
  });

  it("ranker_only mode never calls the Reviewer", async () => {
    const model = fakeModel();
    const { get } = await start({ model, mode: "ranker_only" });
    assert.equal((await get(opp("brooklyn", "open_call"))).body.tier, 2);
    assert.deepEqual([model.ranker, model.reviewer], [1, 0]);
  });
});

describe("errors", () => {
  it("no published snapshot is 503 no_snapshot", async () => {
    const db = fakeDb();
    db.published = null;
    const r = await start({ db }).then((s) => s.get(opp("brooklyn", "open_call")));
    assert.deepEqual([r.status, r.body.error], [503, "no_snapshot"]);
  });

  it("a database error is 500 with fixed text; the detail is logged, not sent", async () => {
    const db = fakeDb();
    db.fail = new Error('password authentication failed for user "postgres.abc"');
    const { get, logs } = await start({ db });
    const r = await get(opp("brooklyn", "open_call"));
    assert.deepEqual([r.status, r.body.error], [500, "internal"]);
    assert.ok(!JSON.stringify(r.body).includes("password"));
    assert.ok(logs.some((l) => l.includes("password authentication failed")));
  });

  it("model errors never reach the client (absorbed into Tier 2)", async () => {
    const model = fakeModel();
    model.error = new ModelError("APIError: 401 invalid x-api-key for claude-opus-5-5");
    const r = await start({ model }).then((s) => s.get(opp("brooklyn", "open_call")));
    assert.equal(r.body.tier, 2);
    const text = JSON.stringify(r.body).toLowerCase();
    assert.ok(!text.includes("claude") && !text.includes("api") && !text.includes("anthropic"));
  });

  it("an unexpected error in the pipeline is 500 generic", async () => {
    const model = fakeModel();
    model.error = new TypeError("bug at roles.ts:42");
    const r = await start({ model }).then((s) => s.get(opp("brooklyn", "open_call")));
    assert.deepEqual([r.status, r.body], [500, { error: "internal", message: "Something went wrong on our side. Try again later." }]);
  });

  it("a trace that cannot be written does not fail the request", async () => {
    const dir = mkdtempSync(`${tmpdir()}/api-trace-`);
    writeFileSync(`${dir}/file`, "");
    const { get } = await start({ traceDir: `${dir}/file` });
    assert.equal((await get(opp("brooklyn", "open_call"))).status, 200);
    assert.equal((await get(opp("brooklyn", "open_call"))).status, 200);     // cache-hit trace path too
  });
});

describe("readConfig", () => {
  it("defaults", () => {
    const c = readConfig({});
    assert.deepEqual([c.mode, c.snapshotId, c.limits.ratePerMinute, c.limits.dailyModelCalls,
      c.limits.maxConcurrentRuns, c.limits.requestDeadlineMs], ["ranker_reviewer", undefined, 10, 300, 2, 90_000]);
    assert.ok(c.traceDir?.endsWith("traces"));
    assert.equal(readConfig({ VERCEL: "1" }).traceDir, null);        // read-only filesystem: tracing off by default
  });

  it("empty TRACE_DIR disables tracing; values are parsed", () => {
    const c = readConfig({ TRACE_DIR: "", RANKER_MODE: "baseline", SNAPSHOT_ID: "2026-10-27", DAILY_MODEL_CALLS: "0" });
    assert.deepEqual([c.traceDir, c.mode, c.snapshotId, c.limits.dailyModelCalls], [null, "baseline", "2026-10-27", 0]);
  });

  it("data source: default and parsing", () => {
    assert.equal(readConfig({}).dataSource, "postgres");
    const c = readConfig({ DATA_SOURCE: "json", SNAPSHOT_ID: "2026-10-27" });
    assert.deepEqual([c.dataSource, c.snapshotId], ["json", "2026-10-27"]);
  });

  it("refuses bad values without echoing them", () => {
    for (const env of [{ RANKER_MODE: "gpt" },
      { RATE_LIMIT_PER_MINUTE: "ten" }, { RATE_LIMIT_PER_MINUTE: "0" }, { DAILY_MODEL_CALLS: "-1" },
      // A search charges one per type, so fewer than five per minute could never serve a full search.
      { RATE_LIMIT_PER_MINUTE: "4" },
      { DATA_SOURCE: "mysql" }, { DATA_SOURCE: "json" }, { DATA_SOURCE: "json", SNAPSHOT_ID: "../secrets" }]) {
      assert.throws(() => readConfig(env), (e: Error) => e instanceof ConfigError && !Object.values(env).some((v) => e.message.includes(v)));
    }
  });
});

// A mixed pool for searches: several places, types and discipline tags.
const POOL = [
  rec("BkMusic", { opportunity_type: "grant", disciplines: ["music"] }),
  rec("BkDance", { opportunity_type: "grant", disciplines: ["dance"] }),
  rec("CityAll", { opportunity_type: "grant", borough: "citywide", disciplines: ["all"] }),
  rec("QnMusic", { opportunity_type: "grant", borough: "queens", disciplines: ["music"] }),
  rec("NjSound", { opportunity_type: "grant", borough: null, region: "new_jersey", disciplines: ["sound"] }),
  rec("NjUntagged", { opportunity_type: "grant", borough: null, region: "new_jersey" }),
  rec("NjOldMusic", { opportunity_type: "grant", borough: null, region: "new_jersey", disciplines: ["music"], deadline: "2026-10-01" }),
  rec("CtMusic", { opportunity_type: "grant", borough: null, region: "connecticut", disciplines: ["music"] }),
  rec("PaMusic", { opportunity_type: "grant", borough: null, region: "pennsylvania", disciplines: ["music"] }),
  rec("BkCall", { disciplines: ["music"] }),
  rec("NjCall", { borough: null, region: "new_jersey", disciplines: ["visual"] }),
];
const keys = (g: { results: { title: string }[] }) => g.results.map((r) => r.title).sort();
const searchPath = (q: string) => `/api/search?${q}`;

describe("GET /api/search", () => {
  it("one call: several places, types in the order asked, discipline filter, removed counts", async () => {
    const { get, db } = await start({ mode: "baseline", db: fakeDb(POOL) });
    const r = await get(searchPath("places=brooklyn,new_jersey&types=grant,open_call&disciplines=music"));
    assert.equal(r.status, 200);
    const body = r.body as SearchResponse;
    assert.deepEqual(Object.keys(body).sort(), ["as_of", "groups", "snapshot_id"]);
    assert.deepEqual([body.snapshot_id, body.as_of], ["snap1", "2026-10-28"]);
    assert.deepEqual(body.groups.map((g) => g.type), ["grant", "open_call"]);
    const [grant, call] = body.groups as [SearchResponse["groups"][number], SearchResponse["groups"][number]];
    // Brooklyn (+ citywide) and New Jersey; music or "all"; sound is a music tag; untagged never matches.
    assert.deepEqual(keys(grant), ["BkMusic", "CityAll", "NjSound"]);
    assert.deepEqual([grant.tier, grant.removed, grant.removed_counts], [2, "1 expired listing removed.",
      { expired: 1, failed_schema: 0, duplicate: 0 }]);
    assert.deepEqual(keys(call), ["BkCall"]);
    assert.match(grant.request_id, /^[0-9a-f]{12}$/);
    assert.notEqual(grant.request_id, call.request_id);
    assert.equal(db.queries, 3);                          // published snapshot once, then one load per type
  });

  it("ranks each type once over the union of the places (one pipeline run per type)", async () => {
    const model = fakeModel();
    const { get } = await start({ model, db: fakeDb(POOL) });
    const body = (await get(searchPath("places=brooklyn,queens,new_jersey,connecticut&types=grant,open_call"))).body as SearchResponse;
    assert.deepEqual([model.ranker, model.reviewer], [2, 2]);
    assert.deepEqual(body.groups.map((g) => g.tier), [0, 0]);
  });

  it("place groups expand in the API: tristate covers NYC and its neighbors, not the wider Northeast", async () => {
    const { get } = await start({ mode: "baseline", db: fakeDb(POOL) });
    const body = (await get(searchPath("places=tristate&types=grant&disciplines=music"))).body as SearchResponse;
    assert.deepEqual(keys(body.groups[0]!), ["BkMusic", "CityAll", "CtMusic", "NjSound", "QnMusic"]);
    const wider = (await get(searchPath("places=wider&types=grant"))).body as SearchResponse;
    assert.deepEqual(keys(wider.groups[0]!), ["PaMusic"]);
  });

  it("no disciplines means no discipline filter, untagged records included", async () => {
    const { get } = await start({ mode: "baseline", db: fakeDb(POOL) });
    const body = (await get(searchPath("places=new_jersey&types=grant"))).body as SearchResponse;
    assert.deepEqual(keys(body.groups[0]!), ["NjSound", "NjUntagged"]);
  });

  it("Tier 3 group carries a reason naming the places and disciplines; other groups are unaffected", async () => {
    const { get } = await start({ mode: "baseline", db: fakeDb(POOL) });
    const body = (await get(searchPath("places=brooklyn,new_jersey&types=residency,grant&disciplines=music,comedy"))).body;
    assert.deepEqual([body.groups[0].tier, body.groups[0].reason, body.groups[0].results],
      [3, "no records match Brooklyn, New Jersey residency (Music, Comedy)", []]);
    assert.equal(body.groups[1].tier, 2);
    assert.equal("reason" in body.groups[1], false);
  });

  it("one place, one type, no disciplines is the same run as /api/opportunities and shares its cache", async () => {
    const { get, db, model } = await start({ db: fakeDb(POOL) });
    const single = (await get(opp("brooklyn", "grant"))).body as OpportunitiesResponse;
    const queries = db.queries;
    const calls = model.calls;
    const viaSearch = (await get(searchPath("places=brooklyn&types=grant"))).body as SearchResponse;
    const g = viaSearch.groups[0]!;
    assert.deepEqual([g.tier, g.results, g.removed], [single.tier, single.results, single.removed]);
    assert.equal(model.calls, calls);                     // cache hit: no model call
    assert.equal(db.queries, queries + 1);                // only the published-snapshot lookup
  });

  it("the order of places and disciplines does not matter (same cache entry, same label)", async () => {
    const { get, model } = await start({ db: fakeDb(POOL) });
    const a = (await get(searchPath("places=new_jersey,brooklyn&types=grant&disciplines=music,dance"))).body;
    const calls = model.calls;
    const b = (await get(searchPath("places=brooklyn,new_jersey&types=grant&disciplines=dance,music"))).body;
    assert.equal(model.calls, calls);
    assert.deepEqual(b.groups[0].results, a.groups[0].results);
  });

  it("every run is traced with the search's search_id and its places, types and disciplines", async () => {
    const traceDir = mkdtempSync(`${tmpdir()}/api-trace-`);
    const { get } = await start({ mode: "baseline", traceDir, db: fakeDb(POOL) });
    await get(searchPath("places=brooklyn&types=grant"));                    // primes the cache for one group
    const body = (await get(searchPath("places=brooklyn,dc&types=grant,open_call&disciplines=music"))).body;
    await get(searchPath("places=brooklyn&types=grant,event"));             // grant: cache hit inside a search
    const lines = readFileSync(`${traceDir}/2026-10-28.jsonl`, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.length, 5);
    const second = lines.filter((l) => body.groups.some((g: { request_id: string }) => g.request_id === l.request_id));
    assert.equal(second.length, 2);
    assert.equal(second[0].search_id, second[1].search_id);
    assert.match(second[0].search_id, /^[0-9a-f]{12}$/);
    // Runs go in parallel, so their lines are in completion order.
    assert.deepEqual(second.map((l) => l.request).sort((a, b) => a.type.localeCompare(b.type)), [
      { places: ["brooklyn", "dc"], type: "grant", disciplines: ["music"], as_of: "2026-10-28" },
      { places: ["brooklyn", "dc"], type: "open_call", disciplines: ["music"], as_of: "2026-10-28" },
    ]);
    const third = lines.slice(3);
    assert.equal(third[0].search_id, third[1].search_id);
    assert.notEqual(third[0].search_id, second[0].search_id);
    assert.deepEqual(third.map((l) => l.served_from ?? "run").sort(), ["cache", "run"]);
  });

  it("rejects bad queries with the fixed 400, before any db or model work, without echoing input", async () => {
    const { get, db, model } = await start({ db: fakeDb(POOL) });
    for (const q of [
      "", "types=grant", "places=brooklyn", "places=atlantis&types=grant", "places=brooklyn&types=gallery",
      "places=brooklyn&types=grant&disciplines=jazz", "places=brooklyn&types=grant,grant", "places=brooklyn,brooklyn&types=grant",
      "places=brooklyn&places=queens&types=grant", "places=brooklyn&types=grant&types=job", "places=brooklyn&types=grant&as_of=2020-01-01",
      "places=brooklyn&types=grant&place=queens", "places=brooklyn&types=grant&disciplines=", "places=brooklyn&types=grant,",
      "places=,brooklyn&types=grant", "places=Brooklyn&types=grant", "places=brooklyn%00&types=grant", "places=brooklyn&types=grant&x=<script>",
      "places=brooklyn&types=grant&disciplines=music&disciplines=dance", "places=brooklyn;queens&types=grant",
    ]) {
      const r = await get(searchPath(q));
      assert.deepEqual([r.status, r.body.error], [400, "bad_request"], q);
      const text = JSON.stringify(r.body);
      assert.ok(!text.includes("atlantis") && !text.includes("gallery") && !text.includes("jazz") && !text.includes("script"), q);
    }
    assert.deepEqual([db.queries, model.calls], [0, 0]);
  });

  it("every choice at once fits the URL limit and is served: all five types, every place, every discipline", async () => {
    const { get } = await start({ mode: "baseline", db: fakeDb(POOL) });
    const meta = (await get("/api/meta")).body as MetaResponse;
    const q = new URLSearchParams({
      places: [...meta.boroughs, ...meta.regions.filter((r) => r.value !== "nyc"), ...meta.place_groups].map((o) => o.value).join(","),
      types: meta.types.map((t) => t.value).join(","),
      disciplines: meta.disciplines.map((d) => d.value).join(","),
    });
    const r = await get(searchPath(q.toString().replaceAll("%2C", ",")));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.groups.map((g: { type: string }) => g.type), meta.types.map((t) => t.value));
  });
});

describe("GET /api/search cost controls", () => {
  it("each fresh model run counts against the rate limit, all or nothing; cache hits are free", async () => {
    const { get, model, logs } = await start({ db: fakeDb(POOL), limits: { ratePerMinute: 3 } });
    assert.equal((await get(searchPath("places=brooklyn&types=grant,open_call"))).status, 200);     // 2 charged
    const calls = model.calls;
    const over = await get(searchPath("places=brooklyn&types=event,job"));                          // 2 more > 3
    assert.deepEqual([over.status, over.body.error, over.headers.get("retry-after")], [429, "rate_limited", "60"]);
    assert.equal(model.calls, calls);                                                                // nothing ran
    // grant and open_call are cached, so only event is fresh: 1 more fits.
    assert.equal((await get(searchPath("places=brooklyn&types=grant,open_call,event"))).status, 200);
    assert.equal((await get(searchPath("places=brooklyn&types=job"))).status, 429);
    assert.ok(logs.some((l) => l.startsWith("rate limited")));
  });

  it("baseline mode is never rate limited", async () => {
    const { get } = await start({ mode: "baseline", db: fakeDb(POOL), limits: { ratePerMinute: 1 } });
    for (const t of ["grant,open_call,event", "residency,job"]) assert.equal((await get(searchPath(`places=queens&types=${t}`))).status, 200);
  });

  it("no free run slot: that group is served from the code baseline (Tier 2), not the whole search failed", async () => {
    const model = fakeModel();
    model.delayMs = 100;
    const { get, logs } = await start({ model, db: fakeDb(POOL), limits: { maxConcurrentRuns: 1, maxQueuedRuns: 0 } });
    const r = await get(searchPath("places=brooklyn&types=grant,open_call"));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.groups.map((g: { tier: number }) => g.tier).sort(), [0, 2]);
    for (const g of r.body.groups.filter((x: { tier: number }) => x.tier === 2)) {
      assert.ok(g.results.every((x: { label: string }) => x.label.endsWith("not fully checked")));   // never looks verified
    }
    assert.equal(model.ranker, 1);
    assert.ok(logs.some((l) => l.includes("no run slot free in time")));
  });

  it("daily budget is shared across a search's runs; when used up, the rest serve Tier 2", async () => {
    const { get, model } = await start({ db: fakeDb(POOL), limits: { dailyModelCalls: 1 } });
    const r = await get(searchPath("places=brooklyn&types=grant,open_call"));
    assert.equal(r.status, 200);
    assert.equal(model.calls, 1);                 // both runs start together: one Ranker call, then refused
    type G = { tier: number; results: { label: string }[] };
    assert.deepEqual(r.body.groups.map((g: G) => g.tier), [2, 2]);
    assert.ok(r.body.groups.every((g: G) => g.results.length > 0 && g.results.every((x) => x.label.endsWith("not fully checked"))));
  });
});

describe("GET /api/meta (picker lists)", () => {
  it("lists every closed list with the labels the pickers show", async () => {
    const { get, db } = await start();
    const meta = (await get("/api/meta")).body as MetaResponse;
    assert.deepEqual(meta.types.map((t) => t.value), ["open_call", "grant", "residency", "event", "job"]);
    assert.deepEqual(meta.types[0], { value: "open_call", label: "Open calls & auditions", hint: "Submit work or show up and be considered" });
    assert.deepEqual(meta.disciplines.map((d) => d.value), ["music", "comedy", "dance", "theater", "writing", "visual", "film", "craft"]);
    assert.deepEqual(meta.disciplines[0], { value: "music", label: "Music", tags: ["music", "sound"] });
    assert.deepEqual(meta.place_groups.map((g) => [g.value, g.members.length]), [["nyc", 1], ["tristate", 6], ["wider", 9]]);
    const regions = new Set(meta.regions.map((r) => r.value));
    assert.ok(meta.place_groups.every((g) => g.members.every((m) => regions.has(m))));
    assert.deepEqual(meta.other_places, [{ value: "citywide", label: "Citywide" }, { value: "unknown", label: "NYC (borough not stated)" }]);
    assert.equal(db.queries, 0);
  });
});

describe("parseSearchQuery", () => {
  it("expands groups, keeps type order, orders places and disciplines canonically", () => {
    assert.deepEqual(parseSearchQuery(new URLSearchParams("types=job,grant&places=dc,brooklyn,nyc&disciplines=film,music")), {
      places: ["brooklyn", "nyc", "dc"], types: ["job", "grant"], disciplines: ["music", "film"],
    });
    assert.deepEqual(parseSearchQuery(new URLSearchParams("places=tristate,new_jersey&types=event"))?.places,
      ["nyc", "long_island", "westchester_hudson", "upstate_ny", "new_jersey", "connecticut"]);
  });

  it("refuses prototype keys and anything outside the lists", () => {
    for (const q of ["places=toString&types=grant", "places=__proto__&types=grant", "places=brooklyn&types=constructor"]) {
      assert.equal(parseSearchQuery(new URLSearchParams(q)), null, q);
    }
  });
});

describe("rate-limit identity", () => {
  it("each client key the caller passes gets its own limit", async () => {
    const { get } = await start({ limits: { ratePerMinute: 1 } });
    assert.equal((await get(opp("brooklyn", "open_call"), {}, "203.0.113.1")).status, 200);
    assert.equal((await get(opp("brooklyn", "grant"), {}, "203.0.113.2")).status, 200);
    assert.equal((await get(opp("brooklyn", "event"), {}, "203.0.113.1")).status, 429);
  });
});
