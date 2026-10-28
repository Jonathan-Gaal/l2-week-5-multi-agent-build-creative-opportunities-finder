/**
 * HTTP request handler for the API in api/types.ts, built on node:http. createApp takes every dependency
 * (database, model, clock, limits) so tests can pass fakes; server.ts wires the real ones.
 *
 * Opportunities request, in order:
 *   origin check -> validate place/type (closed lists) -> as_of = server's today -> resolve snapshot id ->
 *   cache hit? serve it : identical run in flight? share it : rate limit (model runs only) ->
 *   wait for a run slot (model runs only) -> load records -> pipeline.run with a deadline -> cache -> respond.
 * Cache hits and shared runs make no model calls, are not rate limited, and get their own request id and a
 * trace line pointing at the run that produced the result (PRD section 10: one trace entry per request).
 */

import { appendFile, mkdir } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

import { BOROUGHS, type Request, REGIONS, TYPES, today } from "../agents/filter.ts";
import type { Model } from "../agents/model.ts";
import * as pipeline from "../agents/pipeline.ts";
import { BaselineRanker, Ranker, type RankerRole, Reviewer, type ReviewerRole } from "../agents/roles.ts";
import { NoPublishedSnapshotError, type Queryable, loadRecords, publishedSnapshotId } from "../db/opportunities.ts";
import {
  BUDGET_USED_UP, type Clock, DEADLINE_PASSED, type RunEvents, clientKey, concurrencyGate, dailyBudget,
  guardedModel, lruCache, rateLimiter,
} from "./controls.ts";
import {
  API_ROUTES, type Borough, type ErrorCode, type ErrorResponse, type MetaResponse, type OpportunitiesResponse,
  type Opportunity, type OpportunityType, type Place, type Region,
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
  db: Queryable;
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

// Compile-time check that the API's unions are exactly filter.ts's lists.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const unionsMatch: [Same<Borough, (typeof BOROUGHS)[number]>, Same<Region, (typeof REGIONS)[number]>,
  Same<OpportunityType, (typeof TYPES)[number]>] = [true, true, true];
void unionsMatch;

const PLACE_LABELS: Record<Place, string> = {
  manhattan: "Manhattan", brooklyn: "Brooklyn", queens: "Queens", bronx: "The Bronx", staten_island: "Staten Island",
  nyc: "All of NYC", long_island: "Long Island", westchester_hudson: "Westchester & Hudson Valley",
  upstate_ny: "Upstate New York", new_jersey: "New Jersey", connecticut: "Connecticut", pennsylvania: "Pennsylvania",
  massachusetts: "Massachusetts", rhode_island: "Rhode Island", vermont: "Vermont", new_hampshire: "New Hampshire",
  maine: "Maine", delaware: "Delaware", maryland: "Maryland", dc: "Washington, DC",
};
const TYPE_LABELS: Record<OpportunityType, string> = {
  event: "Events", open_call: "Open calls", grant: "Grants", residency: "Residencies", job: "Jobs",
};

export const META: MetaResponse = {
  boroughs: BOROUGHS.map((value) => ({ value, label: PLACE_LABELS[value] })),
  regions: REGIONS.map((value) => ({ value, label: PLACE_LABELS[value] })),
  types: TYPES.map((value) => ({ value, label: TYPE_LABELS[value] })),
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
  reason: string | null; run_request_id: string;
};

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
  const traceReuse = async (requestId: string, req: Request, how: "cache" | "shared", c: Computed) => {
    const path = tracePath(req.asOf);
    if (!path) return;
    const line = {
      request_id: requestId, at: pipeline.localTimestamp(new Date(now())),
      request: { place: req.place, type: req.type, as_of: req.asOf }, served_from: how,
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
   * budget, the deadline or a failed model call shaped the result. */
  const compute = async (req: Request, snapshotId: string, useModel: boolean): Promise<{ c: Computed; degraded: boolean }> => {
    const ctl = new AbortController();
    const events: RunEvents = { calls: 0, degraded: false };
    let ranker: RankerRole = new BaselineRanker();
    let reviewer: ReviewerRole | null = null;
    if (deps.mode !== "baseline") {
      // With the budget already used up the run is aborted from the start: no model call, Tier 2 baseline.
      if (!useModel) {
        ctl.abort(BUDGET_USED_UP);
        events.degraded = true;
      }
      const model = guardedModel(deps.model!, budget, ctl, events);
      ranker = new Ranker(model);
      if (deps.mode === "ranker_reviewer") reviewer = new Reviewer(model);
    }
    let release = null;
    if (useModel) {
      release = await gate.acquire(limits.queueWaitMs);
      if (release === null) throw new HttpError("busy", { "Retry-After": "5" });
    }
    const timer = useModel ? setTimeout(() => ctl.abort(DEADLINE_PASSED), limits.requestDeadlineMs) : null;
    try {
      const { records } = await loadRecords(deps.db, req, snapshotId);
      const out = await pipeline.run(req, records, ranker, reviewer, tracePath(req.asOf), undefined, { signal: ctl.signal });
      if (ctl.signal.aborted && ctl.signal.reason === DEADLINE_PASSED) events.degraded = true;
      const c: Computed = {
        snapshot_id: snapshotId, as_of: req.asOf, tier: out.tier, results: out.results.map(toOpportunity),
        removed: out.removed, reason: out.reason ?? null, run_request_id: out.request_id!,
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

  const opportunities = async (params: URLSearchParams, client: string): Promise<OpportunitiesResponse> => {
    const q = parseOpportunitiesQuery(params);
    if (q === null) throw new HttpError("bad_request");
    const req: Request = { place: q.place, type: q.type, asOf: today(new Date(now())) };
    const snapshotId = deps.snapshotId ?? (await publishedSnapshotId(deps.db));
    const key = JSON.stringify([snapshotId, req.place, req.type, req.asOf]);

    const toResponse = (c: Computed, requestId: string): OpportunitiesResponse => {
      const base = { snapshot_id: c.snapshot_id, as_of: c.as_of, results: c.results, removed: c.removed, request_id: requestId };
      return c.tier === 3 ? { ...base, tier: 3, reason: c.reason ?? "no result" } : { ...base, tier: c.tier };
    };
    const reuse = async (c: Computed, how: "cache" | "shared") => {
      const id = pipeline.newRequestId();
      await traceReuse(id, req, how, c);
      return toResponse(c, id);
    };

    const cached = cache.get(key);
    if (cached) return reuse(cached, "cache");
    const running = inFlight.get(key);
    if (running) return reuse(await running, "shared");

    const useModel = deps.mode !== "baseline" && budget.remaining() > 0;
    if (useModel) {
      const decision = limiter.take(client);
      if (!decision.ok) {
        log(`rate limited ${client}`);
        throw new HttpError("rate_limited", { "Retry-After": String(decision.retryAfterSec) });
      }
    }
    const run = (async () => {
      const { c, degraded } = await compute(req, snapshotId, useModel);
      // Degraded results are kept briefly so they can recover (budget reset, model back up); others for a day.
      cache.set(key, c, degraded ? limits.degradedCacheTtlMs : limits.cacheTtlMs);
      return c;
    })();
    inFlight.set(key, run);
    try {
      const c = await run;
      return toResponse(c, c.run_request_id);
    } finally {
      inFlight.delete(key);
    }
  };

  const routes: Record<string, (url: URL, client: string) => Promise<unknown> | unknown> = {
    [API_ROUTES.health]: () => ({ ok: true }),
    [API_ROUTES.meta]: () => META,
    [API_ROUTES.opportunities]: (url, client) => opportunities(url.searchParams, client),
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
