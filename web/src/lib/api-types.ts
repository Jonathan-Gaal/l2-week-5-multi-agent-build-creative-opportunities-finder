// Copied from backend/src/api/types.ts (Jon's API contract). Keep in sync; do not edit by hand.
// Re-copy with: git show origin/developer:backend/src/api/types.ts

/**
 * HTTP API contract shared with the frontend. Types plus the route paths, self-contained (no imports), so the React
 * app can import or copy this file as is. The server checks at compile time that these unions match the
 * lists in agents/filter.ts.
 *
 * Routes (GET only, JSON; anything else is 404, a known route with another method is 405):
 *   GET /api/opportunities?place=<Place>&type=<OpportunityType>  -> OpportunitiesResponse
 *   GET /api/meta                                                -> MetaResponse
 *   GET /api/health                                              -> HealthResponse
 * Every non-2xx response has an ErrorResponse body.
 *
 * UNTRUSTED DATA: listing text is copied from third-party websites. Render every field marked "untrusted" as
 * plain text (React's default escaping). Never pass it to `dangerouslySetInnerHTML`, `eval`, or a URL
 * without checking it. The server only sends `source_url` when it is an http(s) URL (otherwise null), and the
 * frontend should still use it only as an `href` on an `<a>` with `rel="noopener noreferrer"`.
 */

export const API_ROUTES = {
  opportunities: "/api/opportunities",
  meta: "/api/meta",
  health: "/api/health",
} as const;

export type Borough = "manhattan" | "brooklyn" | "queens" | "bronx" | "staten_island";
/** Places outside the five boroughs; "nyc" means every NYC listing, including ones with no borough. */
export type Region =
  | "nyc" | "long_island" | "westchester_hudson" | "upstate_ny" | "new_jersey" | "connecticut" | "pennsylvania"
  | "massachusetts" | "rhode_island" | "vermont" | "new_hampshire" | "maine" | "delaware" | "maryland" | "dc";
export type Place = Borough | Region;
export type OpportunityType = "event" | "open_call" | "grant" | "residency" | "job";

/** Query parameters for GET /api/opportunities. Both are required, and nothing else is accepted. The
 * request date (as_of) is always set by the server. */
export type OpportunitiesQuery = { place: Place; type: OpportunityType };

/** 0 = verified (passed the code checks and the Reviewer); 2 = not fully checked; 3 = no result. */
export type Tier = 0 | 2 | 3;

/** A stated eligibility requirement. Both fields are untrusted. */
export type Eligibility = { requirement: string; quote: string | null };

/** One ranked opportunity. Fields marked untrusted come from third-party sites. */
export type Opportunity = {
  /** Untrusted. */
  title: string;
  /** Untrusted. */
  org: string | null;
  type: string;
  /** Untrusted. */
  subtype: string | null;
  /** Borough or region key, e.g. "brooklyn" or "citywide". */
  place: string | null;
  /** Untrusted. */
  location: string | null;
  /** YYYY-MM-DD, "rolling", "recurring", or "Deadline not listed". Untrusted when free text. */
  deadline: string;
  /** Untrusted. */
  event_dates: (string | null)[] | null;
  /** Untrusted. */
  recurrence: string | null;
  /** "none", an amount, or "Fee unknown" (never treat unknown as free). Untrusted. */
  fee: string;
  /** Untrusted. */
  award: string | null;
  /** Untrusted when a list. */
  eligibility: Eligibility[] | "Eligibility not stated";
  /** Name of the source the record came from. Untrusted. */
  source: string;
  /** Untrusted link to the original listing: always http(s), or null if the stored value was not. */
  source_url: string | null;
  /** Check-date label, e.g. "Checked 2026-10-27 · not fully checked". Show it with every result. */
  label: string;
  /** Untrusted. */
  caveat: string | null;
  /** Stable key for React lists. */
  dedupe_key: string;
};

type OpportunitiesBase = {
  snapshot_id: string;
  /** The date (YYYY-MM-DD) expiry was checked against: the server's today. */
  as_of: string;
  /** Up to 5 results, best fit first. Empty when tier is 3. */
  results: Opportunity[];
  /** E.g. "2 expired listings removed.", or null. */
  removed: string | null;
  /** Quote this when reporting a problem; it identifies the trace entry. */
  request_id: string;
};

export type OpportunitiesResponse =
  | (OpportunitiesBase & { tier: 0 | 2 })
  /** No result; `reason` says why, e.g. "no records match Brooklyn residency". */
  | (OpportunitiesBase & { tier: 3; reason: string });

export type Option<T extends string> = { value: T; label: string };

/** Dropdown options, in display order. */
export type MetaResponse = {
  boroughs: Option<Borough>[];
  regions: Option<Region>[];
  types: Option<OpportunityType>[];
};

export type HealthResponse = { ok: true };

/**
 * bad_request (400), origin_not_allowed (403), not_found (404), method_not_allowed (405),
 * rate_limited (429, see the Retry-After header), busy (503, retry shortly), no_snapshot (503),
 * internal (500).
 */
export type ErrorCode =
  | "bad_request" | "origin_not_allowed" | "not_found" | "method_not_allowed" | "rate_limited" | "busy"
  | "no_snapshot" | "internal";

/** `message` is fixed text for display; it never contains request input or internal details. */
export type ErrorResponse = { error: ErrorCode; message: string };
