/**
 * API contract shared with the pages. Types plus the route paths, self-contained (no imports), so client components
 * can import them (tsconfig.json path alias "@api/*", type-only imports). The server checks at compile time that
 * these unions match the lists in agents/taxonomy.ts. The Next.js server calls the API in process
 * (src/lib/backend.ts); these routes are not public URLs.
 *
 * Routes (GET only, JSON; anything else is 404, a known route with another method is 405):
 *   GET /api/search?places=..&types=..[&disciplines=..]          -> SearchResponse   (see SearchQuery)
 *   GET /api/opportunities?place=<Place>&type=<OpportunityType>  -> OpportunitiesResponse (one place, one type)
 *   GET /api/meta                                                -> MetaResponse
 *   GET /api/health                                              -> HealthResponse
 * Every non-2xx response has an ErrorResponse body.
 *
 * Rate limiting is per client: the caller passes the visitor's address with each request.
 *
 * UNTRUSTED DATA: listing text is copied from third-party websites. Render every field marked "untrusted" as
 * plain text (React's default escaping). Never pass it to `dangerouslySetInnerHTML`, `eval`, or a URL
 * without checking it. The server only sends `source_url` when it is an http(s) URL (otherwise null), and the
 * frontend should still use it only as an `href` on an `<a>` with `rel="noopener noreferrer"`.
 */

export const API_ROUTES = {
  search: "/api/search",
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
export type Discipline = "music" | "comedy" | "dance" | "theater" | "writing" | "visual" | "film" | "craft" | "photographer" | "videographer" | "crew" | "model" | "singer" | "poet";
/** Picker shortcuts the API expands: "nyc" (the nyc region), "tristate", "wider" (see MetaResponse.place_groups). */
export type PlaceGroup = "nyc" | "tristate" | "wider";

/**
 * Query parameters for GET /api/search, each a comma-separated list with no repeats, given at most once:
 *   places       required. Borough, region or place-group ids; groups expand to their members.
 *   types        required. Up to all five types; one result group per type, in the order given.
 *   disciplines  optional. A record fits if it shares a tag with any of them or is open to any artist; omit
 *                for no discipline filter.
 * Nothing else is accepted (in particular not as_of, which the server sets). Each type is ranked once over the
 * union of the places (a record matches if it matches any place).
 */
export type SearchQuery = { places: (Place | PlaceGroup)[]; types: OpportunityType[]; disciplines?: Discipline[] };

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
  /** Other kinds this listing also is, inside the same broad type (e.g. a casting call that is also a paid gig). */
  also_subtypes?: string[];
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

/** Matching records left out, by reason. */
export type RemovedCounts = { expired: number; failed_schema: number; duplicate: number };

/** One type's ranked list in a search. Each group is its own pipeline run with its own tier and trace entry. */
type SearchGroupBase = {
  type: OpportunityType;
  /** Up to 5 results, best fit first. Empty when tier is 3. */
  results: Opportunity[];
  /** E.g. "2 expired listings removed.", or null. */
  removed: string | null;
  removed_counts: RemovedCounts | null;
  /** Quote this when reporting a problem; it identifies the group's trace entry. */
  request_id: string;
};
export type SearchGroup =
  | (SearchGroupBase & { tier: 0 | 2 })
  /** No result; `reason` says why, e.g. "no records match Brooklyn, New Jersey grant (Music)". */
  | (SearchGroupBase & { tier: 3; reason: string });

export type SearchResponse = {
  snapshot_id: string;
  /** The date (YYYY-MM-DD) expiry was checked against: the server's today. */
  as_of: string;
  /** One per requested type, in the order the types were requested. */
  groups: SearchGroup[];
};

export type Option<T extends string> = { value: T; label: string };

/** Everything the pickers need, in display order. */
export type MetaResponse = {
  boroughs: Option<Borough>[];
  regions: Option<Region>[];
  types: (Option<OpportunityType> & { hint: string })[];
  /** `tags` are the snapshot tags each discipline matches (records tagged "all" match every discipline). */
  disciplines: (Option<Discipline> & { tags: string[] })[];
  /** Shortcuts the search expands to `members`. */
  place_groups: (Option<PlaceGroup> & { hint: string; members: Region[] })[];
  /** Labels for the other place keys a result can carry ("citywide", "unknown"). */
  other_places: Option<"citywide" | "unknown">[];
};

export type HealthResponse = { ok: true };

/**
 * bad_request (400), not_found (404), method_not_allowed (405),
 * rate_limited (429, see the Retry-After header), busy (503, retry shortly), no_snapshot (503),
 * internal (500).
 */
export type ErrorCode =
  | "bad_request" | "not_found" | "method_not_allowed" | "rate_limited" | "busy"
  | "no_snapshot" | "internal";

/** `message` is fixed text for display; it never contains request input or internal details. */
export type ErrorResponse = { error: ErrorCode; message: string };
