/**
 * Server-side client for the results API (backend/; contract in backend/src/api/types.ts, imported as "@api/types").
 * The browser never talks to the API directly: the Next.js server does, so there is no CORS setup and the backend
 * address and the proxy secret stay private.
 *
 * A search is ONE call to GET /api/search with every place, type and discipline picked. The API expands place
 * groups, filters by discipline, and ranks each type once over all the places, returning one group per type.
 * Because every visitor reaches the API from this server's address, each call names the visitor's address and
 * proves it is this server with API_PROXY_SECRET, so the API rate-limits visitors separately (see .env.example).
 */
import "server-only";

import type { API_ROUTES, ErrorCode, ErrorResponse, MetaResponse, PROXY_HEADERS, SearchResponse } from "@api/types";
import { cacheLife } from "next/cache";
import { toCard } from "./cards";
import type { Labels } from "./taxonomy";
import type { CallLog, Group, SearchInput, SearchOutput } from "./types";

// Typed against the contract: a renamed route or header in backend/src/api/types.ts fails `npm run typecheck`.
const ROUTES: typeof API_ROUTES = { search: "/api/search", opportunities: "/api/opportunities", meta: "/api/meta", health: "/api/health" };
const HEADERS: typeof PROXY_HEADERS = { secret: "x-proxy-secret", clientIp: "x-client-ip" };

const BASE = (process.env.BACKEND_URL || "http://localhost:8787").replace(/\/$/, "");
const PROXY_SECRET = process.env.API_PROXY_SECRET || "";
const SEARCH_TIMEOUT_MS = 120_000;
const META_TIMEOUT_MS = 5_000;

export class BackendError extends Error {
  constructor(public code: ErrorCode | "unreachable" | "bad_response", message: string) {
    super(message);
    this.name = "BackendError";
  }
}

export const FRIENDLY: Record<string, string> = {
  unreachable: "The results service isn't running right now.",
  bad_response: "The results service sent something we couldn't read.",
  bad_request: "That search wasn't understood. Try choosing again.",
  origin_not_allowed: "This site isn't allowed to call the results service.",
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

export async function backendHealth(): Promise<{ ok: boolean; url: string }> {
  try {
    const res = await fetch(`${BASE}${ROUTES.health}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return { ok: res.ok, url: BASE };
  } catch {
    return { ok: false, url: BASE };
  }
}

async function getJson<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
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

async function fetchMetaCached(): Promise<MetaResponse> {
  "use cache";
  // A few minutes: the lists change only when the backend is redeployed. A failed fetch throws and is not cached.
  cacheLife("minutes");
  return getJson<MetaResponse>(ROUTES.meta, { signal: AbortSignal.timeout(META_TIMEOUT_MS) });
}

/**
 * The picker lists and labels from GET /api/meta, cached on this server. Throws BackendError when the service is
 * down: there is deliberately no built-in copy of the lists to fall back on, because a search built from them
 * would fail against the same service anyway, and a copy could drift from what the running API accepts.
 * Call it only after a request-time API (searchParams, headers) so `next build` never needs the backend.
 */
export async function getMeta(): Promise<MetaResponse> {
  try {
    return await fetchMetaCached();
  } catch (e) {
    // Errors from a cached scope may lose their class on the way out; anything else means the service is unusable.
    throw e instanceof BackendError ? e : new BackendError("unreachable", FRIENDLY.unreachable);
  }
}

// X-Forwarded-For is only as trustworthy as the proxy in front of this server. With no proxy (next start on an open
// port) any visitor can write it and pick a fresh rate limit per request, so it is read only when a proxy is known
// to set it: on Vercel, or when TRUST_FORWARDED_FOR=1.
const TRUST_FORWARDED_FOR = process.env.VERCEL === "1" || process.env.TRUST_FORWARDED_FOR === "1";

/**
 * The visitor's address for the API's per-visitor rate limit: the LAST X-Forwarded-For entry, the one added by the
 * proxy in front of this server (Vercel replaces the header; nginx appends to it). Null when there is none or no
 * proxy is trusted; the API then limits every visitor together by this server's address (the safe direction).
 */
export function visitorAddress(headers: Headers): string | null {
  if (!TRUST_FORWARDED_FOR) return null;
  const last = headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return last ? last : null;
}

/** Proxy headers for one call, only when this server holds the shared secret and knows the visitor's address. */
function identityHeaders(visitor: string | null): Record<string, string> {
  return PROXY_SECRET && visitor ? { [HEADERS.secret]: PROXY_SECRET, [HEADERS.clientIp]: visitor } : {};
}

/** The /api/search query for picker choices. Commas are left readable; the API splits on them. */
export function searchQuery(input: SearchInput): string {
  const q = new URLSearchParams({ places: input.places.join(","), types: input.types.join(",") });
  if (input.disciplines.length) q.set("disciplines", input.disciplines.join(","));
  return q.toString().replaceAll("%2C", ",");
}

/** One search, one call. `visitor` is the end user's address (visitorAddress), forwarded for rate limiting. */
export async function searchBackend(input: SearchInput, opts: { visitor: string | null; labels: Labels }): Promise<SearchOutput> {
  const query = searchQuery(input);
  const res = await getJson<SearchResponse>(`${ROUTES.search}?${query}`, {
    cache: "no-store",
    headers: identityHeaders(opts.visitor),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
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
