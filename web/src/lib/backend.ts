/**
 * Server-side client for Jon's API (backend/src/api/types.ts). The browser never talks to the API directly: the
 * Next.js server does, so there is no CORS setup and the backend address stays private.
 *
 * The API takes ONE place and ONE type per call and has no discipline filter. The picker allows several of each, so a
 * search fans out into one call per (place, type) and merges the answers. That is fine for the code ranker. For the
 * model-backed modes it would burn the API's rate limit and budget, which is why the API needs multi-select support
 * (see the request to Jon in log.md).
 */
import type { ErrorCode, ErrorResponse, Opportunity, OpportunitiesResponse } from "./api-types";
import { toCard } from "./cards";
import { expandPlaces, TRISTATE_REGIONS, WIDER_REGIONS } from "./taxonomy";
import type { CallLog, Group, SearchInput, SearchOutput } from "./types";

const BASE = (process.env.BACKEND_URL || "http://localhost:8787").replace(/\/$/, "");
const CALL_TIMEOUT_MS = 120_000;
const MAX_PARALLEL = 6;
const TOP_N = 5;

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

export async function backendHealth(): Promise<{ ok: boolean; url: string }> {
  try {
    const res = await fetch(`${BASE}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return { ok: res.ok, url: BASE };
  } catch {
    return { ok: false, url: BASE };
  }
}

async function callApi(place: string, type: string): Promise<OpportunitiesResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/opportunities?place=${encodeURIComponent(place)}&type=${encodeURIComponent(type)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
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
  return body as OpportunitiesResponse;
}

/** The places to ask the API about. "NYC" already covers every borough, so boroughs are dropped when it is included. */
export function apiPlaces(places: string[]): string[] {
  const { boroughs, regions } = expandPlaces(places);
  const known = new Set([...TRISTATE_REGIONS, ...WIDER_REGIONS]);
  const out = [...regions].filter((r) => known.has(r));
  return regions.has("nyc") ? out : [...boroughs, ...out];
}

/** Best results from several lists, taking each list's rank 1, then rank 2, and so on; no listing twice. */
export function interleave(lists: Opportunity[][], limit = TOP_N): Opportunity[] {
  const seen = new Set<string>();
  const out: Opportunity[] = [];
  for (let rank = 0; out.length < limit && lists.some((l) => rank < l.length); rank++) {
    for (const l of lists) {
      const o = l[rank];
      if (o && !seen.has(o.dedupe_key) && out.length < limit) {
        seen.add(o.dedupe_key);
        out.push(o);
      }
    }
  }
  return out;
}

/** "2 expired listings removed." notes from several calls, added up. */
export function sumRemoved(notes: (string | null)[]): string | null {
  const totals: Record<string, number> = {};
  for (const note of notes) {
    for (const m of (note ?? "").matchAll(/(\d+) (expired|incomplete|duplicate) listings?/g)) {
      totals[m[2]] = (totals[m[2]] ?? 0) + Number(m[1]);
    }
  }
  const parts = Object.entries(totals).map(([k, n]) => `${n} ${k} listing${n === 1 ? "" : "s"}`);
  return parts.length ? `${parts.join(", ")} removed.` : null;
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function searchBackend(input: SearchInput): Promise<SearchOutput> {
  const places = apiPlaces(input.places);
  const jobs = input.types.flatMap((type) => places.map((place) => ({ place, type })));
  const settled = await pool(jobs, MAX_PARALLEL, async (job) => {
    try {
      return { job, res: await callApi(job.place, job.type), err: null as BackendError | null };
    } catch (e) {
      return { job, res: null, err: e instanceof BackendError ? e : new BackendError("internal", FRIENDLY.internal) };
    }
  });

  const failures = settled.filter((s) => s.err);
  if (failures.length === settled.length) throw failures[0].err;

  const calls: CallLog[] = settled.map(({ job, res, err }) =>
    res
      ? { ...job, ok: true, tier: res.tier, count: res.results.length, removed: res.removed, requestId: res.request_id }
      : { ...job, ok: false, error: err!.code },
  );
  const first = settled.find((s) => s.res)!.res!;
  const asOf = first.as_of;

  const groups: Group[] = input.types.map((type) => {
    const mine = settled.filter((s) => s.job.type === type);
    const answered = mine.filter((s) => s.res).map((s) => s.res!);
    const results = interleave(answered.map((r) => r.results));
    // The weakest tier among the lists that contributed: one unchecked list makes the group "not fully checked".
    const tiers = answered.filter((r) => r.results.length).map((r) => r.tier);
    const tier = results.length ? ((tiers.includes(2) ? 2 : 0) as 0 | 2) : 3;
    return {
      type,
      tier,
      cards: results.map((o) => toCard(o, asOf)),
      removed: sumRemoved(answered.map((r) => r.removed)),
      reason: results.length ? null : (answered.map((r) => (r.tier === 3 ? r.reason : null)).find(Boolean) ?? "No listings match."),
    };
  });

  const warnings = failures.length
    ? [`${failures.length} of ${settled.length} lookups failed (${[...new Set(failures.map((f) => f.err!.code))].join(", ")}), so some places may be missing.`]
    : [];
  return { asOf, snapshotId: first.snapshot_id, groups, calls, warnings };
}
