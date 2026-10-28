// The HTTP API end to end on a real node:http server, with a fake database and a fake model.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { after, describe, it } from "node:test";

import type { OppRecord } from "../agents/filter.ts";
import { type CallOptions, type Model, ModelError } from "../agents/model.ts";
import { type AppDeps, type Limits, createApp, parseOpportunitiesQuery, safeHttpUrl } from "./app.ts";
import { ConfigError, readConfig } from "./config.ts";
import type { MetaResponse, OpportunitiesResponse } from "./types.ts";

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

type FakeDb = AppDeps["db"] & { published: string | null; fail: Error | null; queries: number };
const fakeDb = (): FakeDb => ({
  published: "snap1", fail: null, queries: 0,
  async query(text: string) {
    this.queries += 1;
    if (this.fail) throw this.fail;
    if (text.includes("public.snapshots")) return { rows: this.published ? [{ id: this.published }] : [] };
    return { rows: RECORDS };
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

const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

type Setup = Partial<Omit<AppDeps, "limits">> & { limits?: Partial<Limits> };
const start = async (setup: Setup = {}) => {
  const db = (setup.db as FakeDb | undefined) ?? fakeDb();
  const model = (setup.model as FakeModel | undefined) ?? fakeModel();
  const logs: string[] = [];
  const clock = { t: NOW };
  const handler = createApp({
    db, model, mode: "ranker_reviewer", allowedOrigins: ["http://localhost:5173"], traceDir: null,
    now: () => clock.t, log: (l) => logs.push(l), ...setup, limits: setup.limits ?? {},
  });
  const server = createServer((req, res) => void handler(req, res));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(base + path, init);
    return { status: res.status, headers: res.headers, body: res.status === 204 ? null : await res.json() };
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
    assert.deepEqual([post.status, post.body.error, post.headers.get("allow")], [405, "method_not_allowed", "GET, OPTIONS"]);
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

describe("CORS", () => {
  it("allowed origin is echoed with Vary; no origin gets no CORS header", async () => {
    const { get } = await start();
    const r = await get("/api/health", { headers: { Origin: "http://localhost:5173" } });
    assert.deepEqual([r.status, r.headers.get("access-control-allow-origin")], [200, "http://localhost:5173"]);
    assert.match(r.headers.get("vary") ?? "", /Origin/);
    assert.equal((await get("/api/health")).headers.get("access-control-allow-origin"), null);
  });

  it("disallowed origin is refused with 403 before any work", async () => {
    const { get, model, db } = await start();
    const r = await get(opp("brooklyn", "open_call"), { headers: { Origin: "https://evil.example" } });
    assert.deepEqual([r.status, r.body.error, r.headers.get("access-control-allow-origin")], [403, "origin_not_allowed", null]);
    assert.deepEqual([model.calls, db.queries], [0, 0]);
    const lookalike = await get("/api/health", { headers: { Origin: "http://localhost:5173.evil.example" } });
    assert.equal(lookalike.status, 403);
  });

  it("preflight: 204 with GET for an allowed origin, 403 otherwise, never '*'", async () => {
    const { get } = await start();
    const ok = await get(opp("brooklyn", "open_call"), { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET" } });
    assert.deepEqual([ok.status, ok.headers.get("access-control-allow-methods"), ok.headers.get("access-control-allow-origin")],
      [204, "GET", "http://localhost:5173"]);
    const bad = await get("/api/health", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
    assert.equal(bad.status, 403);
  });

  it("'*' is refused at startup", () => {
    assert.throws(() => createApp({ db: fakeDb(), model: null, mode: "baseline", allowedOrigins: ["*"], traceDir: null }));
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
    assert.deepEqual([c.port, c.mode, c.snapshotId, c.allowedOrigins, c.limits.ratePerMinute, c.limits.dailyModelCalls,
      c.limits.maxConcurrentRuns, c.limits.requestDeadlineMs], [8787, "ranker_reviewer", undefined, ["http://localhost:5173"], 10, 300, 2, 90_000]);
    assert.ok(c.traceDir?.endsWith("traces"));
  });

  it("empty TRACE_DIR disables tracing; values are parsed", () => {
    const c = readConfig({ TRACE_DIR: "", RANKER_MODE: "baseline", SNAPSHOT_ID: "2026-10-27", DAILY_MODEL_CALLS: "0",
      ALLOWED_ORIGINS: "http://localhost:5173, https://app.example.org" });
    assert.deepEqual([c.traceDir, c.mode, c.snapshotId, c.limits.dailyModelCalls, c.allowedOrigins],
      [null, "baseline", "2026-10-27", 0, ["http://localhost:5173", "https://app.example.org"]]);
  });

  it("refuses bad values without echoing them", () => {
    for (const env of [{ RANKER_MODE: "gpt" }, { ALLOWED_ORIGINS: "*" }, { ALLOWED_ORIGINS: "https://a.org/path" },
      { RATE_LIMIT_PER_MINUTE: "ten" }, { RATE_LIMIT_PER_MINUTE: "0" }, { PORT: "70000" }, { DAILY_MODEL_CALLS: "-1" }]) {
      assert.throws(() => readConfig(env), (e: Error) => e instanceof ConfigError && !Object.values(env).some((v) => e.message.includes(v)));
    }
  });
});
