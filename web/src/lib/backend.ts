/**
 * The Next.js server's way into the results API (server/api/app.ts; contract in server/api/types.ts, imported as
 * "@api/types"). The API runs in this process: each call is a Request handed straight to its handler, with no
 * network hop and no separate service. The browser never reaches it; only pages and route handlers on this server.
 *
 * A search is ONE call to /api/search with every place, type and discipline picked. The API expands place groups,
 * filters by discipline, and ranks each type once over all the places, returning one group per type. Each call
 * names the visitor's address, so the API rate-limits visitors separately (see visitorAddress).
 */
import "server-only";

import { connection } from "next/server";
import type { API_ROUTES, ErrorCode, ErrorResponse, MetaResponse, SearchResponse } from "@api/types";
import { ClaudeModel, missingCredentials } from "../../server/agents/model.ts";
import { createApp, META } from "../../server/api/app.ts";
import { readConfig } from "../../server/api/config.ts";
import { clientKey } from "../../server/api/controls.ts";
import { jsonSource } from "../../server/db/json-source.ts";
import { postgresSource } from "../../server/db/opportunities.ts";
import { getPool } from "../../server/db/pool.ts";
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

type Api = ReturnType<typeof createApp>;
let api: Api | null = null;

/**
 * The API, built once per server process from the environment (web/.env.example): the record source (Postgres, or
 * the JSON snapshot with DATA_SOURCE=json) and the Claude model unless RANKER_MODE=baseline. Its cache, rate limits
 * and daily budget live in this process. Throws on missing or invalid settings; the next call tries again.
 */
function getApi(): Api {
  if (api) return api;
  const config = readConfig(process.env);
  const useJson = config.dataSource === "json";
  if (!useJson && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (copy web/.env.example to web/.env, or run npm run dev:local)");
  }
  if (config.mode !== "baseline") {
    const missing = missingCredentials();
    if (missing) throw new Error(`RANKER_MODE=${config.mode} needs Claude: ${missing}. Or set RANKER_MODE=baseline.`);
  }
  api = createApp({
    source: useJson ? jsonSource(config.snapshotId!) : postgresSource(getPool()),
    model: config.mode === "baseline" ? null : new ClaudeModel(undefined, "medium", config.modelCallTimeoutMs),
    mode: config.mode,
    snapshotId: config.snapshotId,
    traceDir: config.traceDir,
    limits: config.limits,
  });
  return api;
}

/** One API call for `client` (a rate-limit key). Errors come back as BackendError with friendly text. */
async function callApi<T>(path: string, client: string): Promise<T> {
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

/** The /api/search query for picker choices. Commas are left readable; the API splits on them. */
export function searchQuery(input: SearchInput): string {
  const q = new URLSearchParams({ places: input.places.join(","), types: input.types.join(",") });
  if (input.disciplines.length) q.set("disciplines", input.disciplines.join(","));
  return q.toString().replaceAll("%2C", ",");
}

/** One search, one call. `visitor` is the end user's address (visitorAddress), the key for their rate limit. */
export async function searchBackend(input: SearchInput, opts: { visitor: string | null; labels: Labels }): Promise<SearchOutput> {
  const query = searchQuery(input);
  const res = await callApi<SearchResponse>(`${ROUTES.search}?${query}`, opts.visitor ? clientKey(opts.visitor) : "shared");
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
