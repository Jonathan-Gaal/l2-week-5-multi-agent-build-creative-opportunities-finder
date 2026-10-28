/**
 * HTTP request handler for the API in api/types.ts, built on node:http. createApp takes every dependency
 * (record source, model, clock, limits) so tests can pass fakes; server.ts wires the real ones.
 *
 * Search and opportunities requests, in order:
 *   origin check -> validate the query (closed lists) -> as_of = server's today -> resolve snapshot id ->
 *   one run per type (search: over the union of the places; opportunities: one place). For each run:
 *   cache hit? serve it : identical run in flight? share it : fresh. Then one rate-limit charge for all the
 *   fresh model runs together (all or nothing) -> each fresh run waits for a run slot (model runs only) ->
 *   load records -> pipeline.run with a deadline -> cache -> respond.
 * Cache hits and shared runs make no model calls, are not rate limited, and get their own request id and a
 * trace line pointing at the run that produced the result (PRD section 10: one trace entry per run). The runs
 * of one search share a search_id in the trace.
 * When no run slot frees up in time, an opportunities request gets 503 busy; a search serves that type from
 * the code baseline (Tier 2, not fully checked) instead of failing every group.
 * The client's rate-limit identity is its socket address.
 */

import { appendFile, mkdir } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

import { BOROUGHS, type Request, REGIONS, TYPES, makeRequest, makeSearchRequest, today, traceRequest } from "../agents/filter.ts";
import type { Model } from "../agents/model.ts";
import * as pipeline from "../agents/pipeline.ts";
import { BaselineRanker, Ranker, type RankerRole, Reviewer, type ReviewerRole } from "../agents/roles.ts";
import {
  DISCIPLINES, OTHER_PLACE_LABELS, PLACE_GROUPS, PLACE_LABELS, TYPE_INFO, canonicalDisciplines, expandPlaceChoices,
} from "../agents/taxonomy.ts";
import { NoPublishedSnapshotError, type RecordSource } from "../db/opportunities.ts";
import {
  BUDGET_USED_UP, type Clock, DEADLINE_PASSED, type RunEvents, SERVER_BUSY, clientKey, concurrencyGate, dailyBudget,
  guardedModel, lruCache, rateLimiter,
} from "./controls.ts";
import {
  API_ROUTES, type Borough, type Discipline, type ErrorCode, type ErrorResponse, type MetaResponse,
  type OpportunitiesResponse, type Opportunity, type OpportunityType, type Place, type PlaceGroup, type Region,
  type RemovedCounts, type SearchGroup, type SearchResponse,
} from "./types.ts";

export const MODES = ["ranker_reviewer", "ranker_only", "baseline"] as const;
export type Mode = (typeof MODES)[number];

export type Limits = {
  /** Model-backed runs a client may start per minute. */
  ratePerMinute: number;
  /** Model-backed runs at once; more wait in a queue. */
  maxConcurrentRuns: number;
  /** Runs allowed to wait for a slot; beyond this a request gets 503 busy at once. */
  maxQueuedRuns: number;
  /** How long a queued run waits for a slot before 503 busy. */
  queueWaitMs: number;
  /** Model calls (each Ranker or Reviewer call) per local day for the whole process. */
  dailyModelCalls: number;
  /** After this, a run starts no new model call and serves the best tier reached. */
  requestDeadlineMs: number;
  cacheEntries: number;
  /** Time to live for a normal result (the key already changes with the date and snapshot). */
  cacheTtlMs: number;
  /** Time to live for a result degraded by the budget, the deadline or a failed model call. */
  degradedCacheTtlMs: number;
  maxUrlLength: number;
};

export const DEFAULT_LIMITS: Limits = {
  ratePerMinute: 10, maxConcurrentRuns: 2, maxQueuedRuns: 8, queueWaitMs: 10_000, dailyModelCalls: 300,
  requestDeadlineMs: 90_000, cacheEntries: 500, cacheTtlMs: 24 * 3600_000, degradedCacheTtlMs: 5 * 60_000,
  maxUrlLength: 512,
};

export type AppDeps = {
  source: RecordSource;
  /** The Claude model; required unless mode is "baseline". */
  model: Model | null;
  mode: Mode;
  /** Serve this snapshot instead of the published one (local development only). */
  snapshotId?: string | undefined;
  allowedOrigins: readonly string[];
  /** Directory for the per-day JSONL trace; null disables tracing. */
  traceDir: string | null;
  now?: Clock;
  limits?: Partial<Limits>;
  /** Server-side log for errors and abuse signals. Never sent to the client. */
  log?: (line: string) => void;
};

// Compile-time check that the API's unions are exactly taxonomy.ts's lists.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const unionsMatch: [Same<Borough, (typeof BOROUGHS)[number]>, Same<Region, (typeof REGIONS)[number]>,
  Same<OpportunityType, (typeof TYPES)[number]>, Same<Discipline, (typeof DISCIPLINES)[number]["id"]>,
  Same<PlaceGroup, (typeof PLACE_GROUPS)[number]["id"]>] = [true, true, true, true, true];
void unionsMatch;

export const META: MetaResponse = {
  boroughs: BOROUGHS.map((value) => ({ value, label: PLACE_LABELS[value] })),
  regions: REGIONS.map((value) => ({ value, label: PLACE_LABELS[value] })),
  types: TYPE_INFO.map(({ id, label, hint }) => ({ value: id, label, hint })),
  disciplines: DISCIPLINES.map(({ id, label, tags }) => ({ value: id, label, tags: [...tags] })),
  place_groups: PLACE_GROUPS.map(({ id, label, hint, members }) => ({ value: id, label, hint, members: [...members] })),
  other_places: (Object.keys(OTHER_PLACE_LABELS) as (keyof typeof OTHER_PLACE_LABELS)[])
    .map((value) => ({ value, label: OTHER_PLACE_LABELS[value] })),
};

const MESSAGES: Record<ErrorCode, string> = {
  bad_request: "Choose a place and an opportunity type from the lists at /api/meta.",
  origin_not_allowed: "This site is not allowed to call the API.",
  not_found: "No such endpoint.",
  method_not_allowed: "Only GET is supported.",
  rate_limited: "Too many searches in a short time. Try again in a minute.",
  busy: "The service is busy. Try again in a few seconds.",
  no_snapshot: "No opportunity data is published yet. Try again later.",
  internal: "Something went wrong on our side. Try again later.",
};
const STATUS: Record<ErrorCode, number> = {
  bad_request: 400, origin_not_allowed: 403, not_found: 404, method_not_allowed: 405, rate_limited: 429,
  busy: 503, no_snapshot: 503, internal: 500,
};

/** A URL safe to put in an href: http(s) only, normalized; anything else (javascript:, data:, relative) is null. */
export const safeHttpUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

/** The API form of one pipeline result: the same fields, with the link checked. */
export const toOpportunity = (r: pipeline.PresentedResult): Opportunity => ({ ...r, source_url: safeHttpUrl(r.source_url) });

const isPlace = (v: string): v is Place => (BOROUGHS as readonly string[]).includes(v) || (REGIONS as readonly string[]).includes(v);
const isType = (v: string): v is OpportunityType => (TYPES as readonly string[]).includes(v);

const PLACE_CHOICES: ReadonlySet<string> = new Set([...BOROUGHS, ...REGIONS, ...PLACE_GROUPS.map((g) => g.id)]);
const TYPE_CHOICES: ReadonlySet<string> = new Set(TYPES);
const DISCIPLINE_CHOICES: ReadonlySet<string> = new Set(DISCIPLINES.map((d) => d.id));
const SEARCH_PARAMS: ReadonlySet<string> = new Set(["places", "types", "disciplines"]);

/** A comma-separated list of distinct ids from `allowed` (at least one), or null. */
const idList = (raw: string | null, allowed: ReadonlySet<string>): string[] | null => {
  if (raw === null) return null;
  const items = raw.split(",");
  if (!items.every((x) => allowed.has(x)) || new Set(items).size !== items.length) return null;
  return items;
};

/** A validated search: places expanded and in canonical order, types in the order asked, disciplines canonical. */
export type SearchSpec = { places: Place[]; types: OpportunityType[]; disciplines: Discipline[] };

/** The validated search, or null. `places` and `types` are required and `disciplines` is optional; each is a
 * list of distinct ids from the closed lists, given at most once; nothing else (in particular not as_of). */
export const parseSearchQuery = (params: URLSearchParams): SearchSpec | null => {
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || !keys.every((k) => SEARCH_PARAMS.has(k))) return null;
  const places = idList(params.get("places"), PLACE_CHOICES);
  const types = idList(params.get("types"), TYPE_CHOICES);
  const disciplines = params.has("disciplines") ? idList(params.get("disciplines"), DISCIPLINE_CHOICES) : [];
  if (places === null || types === null || disciplines === null) return null;
  return {
    places: expandPlaceChoices(places),
    types: types as OpportunityType[],
    disciplines: canonicalDisciplines(disciplines),
  };
};

/** The validated request, or null. Exactly one `place` and one `type`, both from the closed lists, and no
 * other parameter (in particular not as_of, which the server sets). */
export const parseOpportunitiesQuery = (params: URLSearchParams): { place: Place; type: OpportunityType } | null => {
  const keys = [...params.keys()];
  if (keys.length !== 2 || !params.has("place") || !params.has("type")) return null;
  const place = params.get("place")!;
  const type = params.get("type")!;
  return isPlace(place) && isType(type) ? { place, type } : null;
};

/** A run's result, shared by everyone asking the same question; request_id is the run's own. */
type Computed = {
  snapshot_id: string; as_of: string; tier: 0 | 2 | 3; results: Opportunity[]; removed: string | null;
  removed_counts: RemovedCounts | null; reason: string | null; run_request_id: string;
};
/** One run as served to one request: the result and this request's own id for it. */
type Served = { c: Computed; requestId: string };
type ServeOptions = {
  /** What to do when no run slot frees up in time: 503 busy, or serve the code baseline (Tier 2). */
  whenBusy: "fail" | "baseline";
  traceFields?: Record<string, unknown>;
};

/** Cache and in-flight key: everything that decides a run's result (places and disciplines arrive canonical). */
const runKey = (snapshotId: string, req: Request) =>
  JSON.stringify([snapshotId, req.places, req.type, req.disciplines, req.asOf]);

class HttpError extends Error {
  override name = "HttpError";
  readonly code: ErrorCode;
  readonly headers: Record<string, string>;
  constructor(code: ErrorCode, headers: Record<string, string> = {}) {
    super(code);
    this.code = code;
    this.headers = headers;
  }
}

const respond = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  const text = status === 204 ? "" : JSON.stringify(body);
  res.writeHead(status, {
    ...(status === 204 ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers,
  });
  res.end(text);
};

export const createApp = (deps: AppDeps) => {
  const now = deps.now ?? Date.now;
  const limits: Limits = { ...DEFAULT_LIMITS, ...deps.limits };
  const log = deps.log ?? ((line: string) => console.error(line));
  if (deps.mode !== "baseline" && deps.model === null) throw new Error(`mode ${deps.mode} needs a model`);
  const origins = new Set(deps.allowedOrigins);
  if (origins.has("*")) throw new Error("allowed origins must be listed; '*' is not allowed");

  const limiter = rateLimiter(limits.ratePerMinute, 60_000, now);
  const budget = dailyBudget(limits.dailyModelCalls, now);
  const gate = concurrencyGate(limits.maxConcurrentRuns, limits.maxQueuedRuns);
  const cache = lruCache<Computed>(limits.cacheEntries, now);
  const inFlight = new Map<string, Promise<Computed>>();

  const tracePath = (asOf: string) => (deps.traceDir ? `${deps.traceDir}/${asOf}.jsonl` : null);

  /** One trace line for a request served from the cache or a shared run. Failure is logged, never thrown. */
  const traceReuse = async (
    requestId: string, req: Request, how: "cache" | "shared", c: Computed, traceFields: Record<string, unknown> = {},
  ) => {
    const path = tracePath(req.asOf);
    if (!path) return;
    const line = {
      request_id: requestId, at: pipeline.localTimestamp(new Date(now())), ...traceFields,
      request: traceRequest(req), served_from: how,
      run_request_id: c.run_request_id, snapshot_id: c.snapshot_id, tier: c.tier,
      served: c.results.map((r) => r.dedupe_key), model_calls: 0,
    };
    try {
      await mkdir(deps.traceDir!, { recursive: true });
      await appendFile(path, JSON.stringify(line) + "\n", "utf-8");
    } catch (e) {
      log(`trace write failed for ${requestId}: ${(e as Error).message}`);
    }
  };

  /** Run the pipeline once. Model runs hold a gate slot and stop at the deadline. `degraded` means the
   * budget, the deadline, a full gate or a failed model call shaped the result. */
  const compute = async (
    req: Request, snapshotId: string, useModel: boolean, opts: ServeOptions,
  ): Promise<{ c: Computed; degraded: boolean }> => {
    let release = null;
    let busy = false;
    if (useModel) {
      release = await gate.acquire(limits.queueWaitMs);
      if (release === null) {
        if (opts.whenBusy === "fail") throw new HttpError("busy", { "Retry-After": "5" });
        busy = true;
      }
    }
    const ctl = new AbortController();
    const events: RunEvents = { calls: 0, degraded: false };
    let ranker: RankerRole = new BaselineRanker();
    let reviewer: ReviewerRole | null = null;
    if (deps.mode !== "baseline") {
      // With the budget used up, or no run slot, the run is aborted from the start: no model call, Tier 2 baseline.
      if (!useModel || busy) {
        ctl.abort(busy ? SERVER_BUSY : BUDGET_USED_UP);
        events.degraded = true;
      }
      const model = guardedModel(deps.model!, budget, ctl, events);
      ranker = new Ranker(model);
      if (deps.mode === "ranker_reviewer") reviewer = new Reviewer(model);
    }
    const timer = release ? setTimeout(() => ctl.abort(DEADLINE_PASSED), limits.requestDeadlineMs) : null;
    try {
      const records = await deps.source.loadRecords(req, snapshotId);
      const out = await pipeline.run(req, records, ranker, reviewer, tracePath(req.asOf), undefined, {
        signal: ctl.signal, ...(opts.traceFields ? { traceFields: opts.traceFields } : {}),
      });
      if (ctl.signal.aborted && ctl.signal.reason === DEADLINE_PASSED) events.degraded = true;
      const c: Computed = {
        snapshot_id: snapshotId, as_of: req.asOf, tier: out.tier, results: out.results.map(toOpportunity),
        removed: out.removed, removed_counts: out.removed_counts, reason: out.reason ?? null,
        run_request_id: out.request_id!,
      };
      if (events.degraded) {
        const why = typeof ctl.signal.reason === "string" ? ctl.signal.reason : "model call failed";
        log(`run ${c.run_request_id} degraded: ${why} (${events.calls} model calls)`);
      }
      return { c, degraded: events.degraded };
    } finally {
      if (timer) clearTimeout(timer);
      release?.();
    }
  };

  /** Start a fresh run and register it, synchronously, so identical requests arriving meanwhile share it. */
  const startRun = (req: Request, key: string, snapshotId: string, useModel: boolean, opts: ServeOptions) => {
    const run = (async () => {
      const { c, degraded } = await compute(req, snapshotId, useModel, opts);
      // Degraded results are kept briefly so they can recover (budget reset, model back up); others for a day.
      cache.set(key, c, degraded ? limits.degradedCacheTtlMs : limits.cacheTtlMs);
      return c;
    })();
    inFlight.set(key, run);
    return run.finally(() => {
      if (inFlight.get(key) === run) inFlight.delete(key);
    });
  };

  /** Serve several runs for one client request, in order. Fresh model runs are charged to the client's rate
   * limit together, all or nothing, before any of them starts. */
  const serve = async (reqs: Request[], snapshotId: string, client: string, opts: ServeOptions): Promise<Served[]> => {
    const plans = reqs.map((req) => {
      const key = runKey(snapshotId, req);
      return { req, key, cached: cache.get(key), running: inFlight.get(key) };
    });
    const fresh = plans.filter((p) => !p.cached && !p.running).length;
    const useModel = deps.mode !== "baseline" && budget.remaining() > 0;
    if (useModel && fresh > 0) {
      const decision = limiter.take(client, fresh);
      if (!decision.ok) {
        log(`rate limited ${client}`);
        throw new HttpError("rate_limited", { "Retry-After": String(decision.retryAfterSec) });
      }
    }
    const reuse = async (req: Request, c: Computed, how: "cache" | "shared"): Promise<Served> => {
      const requestId = pipeline.newRequestId();
      await traceReuse(requestId, req, how, c, opts.traceFields);
      return { c, requestId };
    };
    // Every fresh run is started (and registered in flight) before the first await below.
    return Promise.all(plans.map(async ({ req, key, cached, running }) => {
      if (cached) return reuse(req, cached, "cache");
      if (running) return reuse(req, await running, "shared");
      const c = await startRun(req, key, snapshotId, useModel, opts);
      return { c, requestId: c.run_request_id };
    }));
  };

  const snapshotFor = async () => deps.snapshotId ?? (await deps.source.publishedSnapshotId());

  const opportunities = async (params: URLSearchParams, client: string): Promise<OpportunitiesResponse> => {
    const q = parseOpportunitiesQuery(params);
    if (q === null) throw new HttpError("bad_request");
    const req = makeRequest(q.place, q.type, today(new Date(now())));
    const snapshotId = await snapshotFor();
    const [{ c, requestId }] = (await serve([req], snapshotId, client, { whenBusy: "fail" })) as [Served];
    const base = { snapshot_id: c.snapshot_id, as_of: c.as_of, results: c.results, removed: c.removed, request_id: requestId };
    return c.tier === 3 ? { ...base, tier: 3, reason: c.reason ?? "no result" } : { ...base, tier: c.tier };
  };

  const search = async (params: URLSearchParams, client: string): Promise<SearchResponse> => {
    const q = parseSearchQuery(params);
    if (q === null) throw new HttpError("bad_request");
    const asOf = today(new Date(now()));
    const snapshotId = await snapshotFor();
    const reqs = q.types.map((type) => makeSearchRequest(q.places, type, asOf, q.disciplines));
    const served = await serve(reqs, snapshotId, client, {
      whenBusy: "baseline", traceFields: { search_id: pipeline.newRequestId() },
    });
    const groups = served.map(({ c, requestId }, i): SearchGroup => {
      const base = {
        type: q.types[i]!, results: c.results, removed: c.removed, removed_counts: c.removed_counts,
        request_id: requestId,
      };
      return c.tier === 3 ? { ...base, tier: 3, reason: c.reason ?? "no result" } : { ...base, tier: c.tier };
    });
    return { snapshot_id: snapshotId, as_of: asOf, groups };
  };

  const routes: Record<string, (url: URL, client: string) => Promise<unknown> | unknown> = {
    [API_ROUTES.health]: () => ({ ok: true }),
    [API_ROUTES.meta]: () => META,
    [API_ROUTES.opportunities]: (url, client) => opportunities(url.searchParams, client),
    [API_ROUTES.search]: (url, client) => search(url.searchParams, client),
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const headers: Record<string, string> = { Vary: "Origin" };
    const fail = (code: ErrorCode, extra: Record<string, string> = {}) => {
      const body: ErrorResponse = { error: code, message: MESSAGES[code] };
      respond(res, STATUS[code], body, { ...headers, ...extra });
    };
    try {
      // A browser on another site sends a simple GET without a preflight, so a disallowed Origin is refused
      // before any work (otherwise any page could spend model calls from its visitors' addresses).
      const origin = req.headers.origin;
      if (origin !== undefined) {
        if (!origins.has(origin)) return fail("origin_not_allowed");
        headers["Access-Control-Allow-Origin"] = origin;
      }
      const raw = req.url ?? "/";
      if (raw.length > limits.maxUrlLength) return fail("bad_request");
      const url = new URL(raw, "http://localhost");
      const route = routes[url.pathname];
      if (route === undefined) return fail("not_found");
      if (req.method === "OPTIONS" && origin !== undefined) {
        return respond(res, 204, null, {
          ...headers, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "600",
        });
      }
      if (req.method !== "GET") return fail("method_not_allowed", { Allow: "GET, OPTIONS" });
      const body = await route(url, clientKey(req.socket.remoteAddress));
      return respond(res, 200, body, headers);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.code, e.headers);
      if (e instanceof NoPublishedSnapshotError) return fail("no_snapshot");
      log(`request failed: ${e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ""}` : String(e)}`);
      return fail("internal");
    }
  };
};
