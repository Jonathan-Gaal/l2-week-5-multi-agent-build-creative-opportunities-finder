/**
 * The Next.js server's way into the results API (server/api/app.ts; contract in server/api/types.ts, imported as
 * "@api/types"). The API runs in this process: each call is a Request handed straight to its handler, with no
 * network hop and no separate service. The browser never reaches it; only pages and route handlers on this server.
 *
 * A search is ONE call to /api/search with every place, type and discipline picked. The API expands place groups,
 * filters by discipline, and ranks each type once over all the places, returning one group per type. Each call
 * names the visitor (their signed cookie id and their address), so the API rate-limits visitors separately (see
 * visitorClient).
 */
import "server-only";

import { after, connection } from "next/server";
import type { API_ROUTES, ErrorCode, ErrorResponse, MetaResponse, SearchResponse } from "@api/types";
import { ClaudeModel, missingCredentials } from "../../server/agents/model.ts";
import { type TraceSink, dailyFileSink } from "../../server/agents/trace.ts";
import { createApp, META } from "../../server/api/app.ts";
import { type Config, readConfig, resolveMode } from "../../server/api/config.ts";
import { type Client, clientKey } from "../../server/api/controls.ts";
import { SHARED_NETWORK, visitorClient as clientFor, visitorSecret } from "../../server/api/visitor.ts";
import { jsonSource } from "../../server/db/json-source.ts";
import { postgresSource } from "../../server/db/opportunities.ts";
import { getPool } from "../../server/db/pool.ts";
import { postgresSink } from "../../server/db/traces.ts";
import { toCard } from "./cards";
import type { Labels } from "./taxonomy";
import type { CallLog, Group, SearchInput, SearchOutput } from "./types";

// Typed against the contract: a renamed route in server/api/types.ts fails `npm run typecheck`.
const ROUTES: typeof API_ROUTES = { search: "/api/search", opportunities: "/api/opportunities", meta: "/api/meta", health: "/api/health" };

export class BackendError extends Error {
  constructor(public code: ErrorCode | "unreachable" | "bad_response", message: string) {
    super(message);
    this.name = "BackendError";
  }
}

export const FRIENDLY: Record<string, string> = {
  unreachable: "Search isn't available right now.",
  bad_response: "The results service sent something we couldn't read.",
  bad_request: "That search wasn't understood. Try choosing again.",
  rate_limited: "Too many searches in a short time. Try again in a minute.",
  busy: "The service is busy. Try again in a few seconds.",
  no_snapshot: "No opportunity data is published yet. Try again later.",
  internal: "Something went wrong on our side. Try again later.",
  not_found: "The results service doesn't have that endpoint.",
  method_not_allowed: "The results service doesn't accept that request.",
};

/** Any failure as a BackendError (unknown errors become the generic one). */
export const asBackendError = (e: unknown): BackendError =>
  e instanceof BackendError ? e : new BackendError("internal", FRIENDLY.internal);

/**
 * Run a trace write after the response is sent (next/server's after(); on Vercel it holds the function open with
 * waitUntil, so the write is not frozen mid-flight). The API in server/ stays framework-agnostic and awaits whatever
 * sink it is given; this one returns at once. Outside a request scope after() throws, and the write is awaited.
 * Only for postgresSink, which bounds itself and never rejects.
 */
const afterResponse = (sink: TraceSink): TraceSink => async (line) => {
  try {
    after(() => sink(line));
  } catch {
    await sink(line);
  }
};

/** The trace sink TRACE_SINK names (see server/api/config.ts). Files stay awaited, as before. */
const traceSink = (config: Config): TraceSink | null =>
  config.traceSink === "postgres" ? afterResponse(postgresSink(getPool()))
    : config.traceDir ? dailyFileSink(config.traceDir) : null;

type Api = ReturnType<typeof createApp>;
let api: Api | null = null;

/**
 * The API, built once per server process from the environment (web/.env.example): the record source (Postgres, or
 * the JSON snapshot with DATA_SOURCE=json) and the Claude model unless RANKER_MODE=baseline or credentials are
 * missing (then the code baseline, Tier 2). Its cache, rate limits and daily budget live in this process. Throws on
 * missing or invalid settings (data source, limits), but never on absent Claude credentials; the next call retries.
 */
function getApi(): Api {
  if (api) return api;
  const config = readConfig(process.env);
  const useJson = config.dataSource === "json";
  if (!useJson && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (copy web/.env.example to web/.env, or run npm run dev:local)");
  }
  // Missing Claude credentials degrade an LLM mode to the code baseline (Tier 2) instead of throwing, so the app
  // always serves results; resolveMode warns once per process when it does. RANKER_MODE=baseline stays baseline.
  const mode = resolveMode(config, missingCredentials());
  api = createApp({
    source: useJson ? jsonSource(config.snapshotId!) : postgresSource(getPool()),
    model: mode === "baseline" ? null : new ClaudeModel(undefined, "medium", config.modelCallTimeoutMs),
    mode,
    snapshotId: config.snapshotId,
    trace: traceSink(config),
    limits: config.limits,
  });
  return api;
}

/** One API call for `client` (a rate-limit identity). Errors come back as BackendError with friendly text. */
async function callApi<T>(path: string, client: string | Client): Promise<T> {
  // The API reads the clock (deadlines, cache, rate limits): this is per-request work, never part of a prerender.
  await connection();
  let res: Response;
  try {
    res = await getApi()(new Request(`http://api${path}`), client);
  } catch (e) {
    // A setup problem (missing or invalid settings): the detail is for the server log, never the visitor.
    console.error(`results API unavailable: ${(e as Error).message}`);
    throw new BackendError("unreachable", FRIENDLY.unreachable);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new BackendError("bad_response", FRIENDLY.bad_response);
  }
  if (!res.ok) {
    const code = ((body as ErrorResponse)?.error ?? "internal") as ErrorCode;
    throw new BackendError(code, FRIENDLY[code] ?? FRIENDLY.internal);
  }
  return body as T;
}

/** Is the results API set up (settings valid, data source chosen)? Used by the dev page. */
export async function backendHealth(): Promise<{ ok: boolean }> {
  try {
    await callApi(ROUTES.health, "health");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** The picker lists and labels. Built from server/agents/taxonomy.ts, so they always match what the API accepts. */
export const getMeta = (): MetaResponse => META;

// X-Forwarded-For is only as trustworthy as the proxy in front of this server. With no proxy (next start on an open
// port) any visitor can write it and pick a fresh rate limit per request, so it is read only when a proxy is known
// to set it: on Vercel, or when TRUST_FORWARDED_FOR=1.
const TRUST_FORWARDED_FOR = process.env.VERCEL === "1" || process.env.TRUST_FORWARDED_FOR === "1";

/**
 * The visitor's address for the API's per-visitor rate limit: the LAST X-Forwarded-For entry, the one added by the
 * proxy in front of this server (Vercel replaces the header; nginx appends to it). Null when there is none or no
 * proxy is trusted; every such visitor then shares one limit (the safe direction).
 */
export function visitorAddress(headers: Headers): string | null {
  if (!TRUST_FORWARDED_FOR) return null;
  const last = headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return last ? last : null;
}

/**
 * The visitor's rate-limit identity for one request: their signed visitor cookie (set by src/proxy.ts, verified
 * here again) when valid, else their address as above; see server/api/visitor.ts. Without VISITOR_COOKIE_SECRET
 * it is the address alone.
 */
export function visitorClient(headers: Headers): Client {
  const address = visitorAddress(headers);
  return clientFor(headers.get("cookie"), address ? clientKey(address) : SHARED_NETWORK, visitorSecret());
}

/** The /api/search query for picker choices. Commas are left readable; the API splits on them. */
export function searchQuery(input: SearchInput): string {
  const q = new URLSearchParams({ places: input.places.join(","), types: input.types.join(",") });
  if (input.disciplines.length) q.set("disciplines", input.disciplines.join(","));
  return q.toString().replaceAll("%2C", ",");
}

/** One search, one call. `visitor` is the end user's rate-limit identity (visitorClient). */
export async function searchBackend(input: SearchInput, opts: { visitor: Client; labels: Labels }): Promise<SearchOutput> {
  const query = searchQuery(input);
  const res = await callApi<SearchResponse>(`${ROUTES.search}?${query}`, opts.visitor);
  const groups: Group[] = res.groups.map((g) => ({
    type: g.type,
    tier: g.tier,
    cards: g.results.map((o) => toCard(o, res.as_of, opts.labels)),
    removed: g.removed,
    reason: g.tier === 3 ? g.reason : null,
  }));
  const calls: CallLog[] = res.groups.map((g) => ({
    type: g.type, tier: g.tier, count: g.results.length, removed: g.removed, requestId: g.request_id,
  }));
  return { asOf: res.as_of, snapshotId: res.snapshot_id, groups, calls, query };
}
