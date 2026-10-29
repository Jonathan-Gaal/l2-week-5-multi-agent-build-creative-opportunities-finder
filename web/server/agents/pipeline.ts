/**
 * Request path: Filter -> Ranker -> code checks -> Reviewer -> Output, with the loop contract (PRD sections 7-8).
 * Port of agents/pipeline.py.
 *
 * - At most MAX_ATTEMPTS ranking attempts (1 initial, 2 retries); a rejected or failed attempt feeds its
 *   ranking and the critique back to the Ranker.
 * - Code checks run before the Reviewer on every attempt, so hard filters hold even if the model is wrong.
 * - Tier 0: an attempt passed the checks and the Reviewer accepted it.
 * - Records added without a recheck (isUnverified) are labeled "Not checked", and a result containing one is
 *   never Tier 0.
 * - Tier 2: best attempt that passed the checks without an accept (Reviewer rejected every time, errored,
 *   or was not run); if no attempt passed, the code baseline ranking. Labeled "not fully checked".
 * - Tier 3: no result, with the reason.
 * Each request writes one trace line to the given sink (agents/trace.ts; a path string appends to that JSONL file).
 *
 * Usage:
 *   node src/agents/pipeline.ts brooklyn open_call                 # Claude ranker + reviewer
 *   node src/agents/pipeline.ts brooklyn open_call --baseline      # code ranker only, no model calls
 */

import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import * as flt from "./filter.ts";
import type { OppRecord, RemovedCounts, Request } from "./filter.ts";
import { ClaudeModel, ModelError, type Usage } from "./model.ts";
import {
  BaselineRanker, type Candidate, type RankItem, Ranker, type RankerRole, Reviewer, type ReviewerRole, TOP_K,
  baselineOrder, looksLikeInstructions,
} from "./roles.ts";
import { type TraceSink, fileSink, writeTrace } from "./trace.ts";

export const MAX_ATTEMPTS = 3;
const MAX_CANDIDATES = 80;
export const TRACE_DIR = `${flt.REPO}traces`;

export type Tier = 0 | 2 | 3;

export type PresentedResult = ReturnType<typeof present>;

export type Result = {
  tier: Tier;
  results: PresentedResult[];
  reason?: string | null;
  removed: string | null;
  removed_counts: RemovedCounts | null;
  request_id?: string;
};

type Attempt = {
  n: number;
  ranking?: unknown[];
  ranker_error?: string;
  check_problems?: string[];
  review?: string;
  reviewer_error?: string;
  verdict?: string;
  critique?: string;
};

/** Code checks on one attempt. Returns a list of problems (empty means it passes). */
export const checkRanking = (ranking: RankItem[], byId: Map<string, OppRecord>, req: Request): string[] => {
  if (!ranking.length && byId.size) return ["ranking is empty but there are candidates"];
  const problems: string[] = [];
  const ids = new Set<string>();
  const keys = new Set<string>();
  if (ranking.length > TOP_K) problems.push(`more than ${TOP_K} results`);
  for (const item of ranking) {
    const id = item.id;
    const rec = typeof id === "string" ? byId.get(id) : undefined;
    if (typeof id !== "string" || rec === undefined) {
      // Never interpolate the raw id: a crafted object (e.g. one with a non-function toString) would throw here.
      problems.push(`${typeof id === "string" ? id.slice(0, 40) : "a non-text id"}: not one of the candidate ids`);
      continue;
    }
    if (ids.has(id) || keys.has(rec.dedupe_key)) problems.push(`${id}: listed twice`);
    ids.add(id);
    keys.add(rec.dedupe_key);
    if (!flt.matches(rec, req) || flt.isExpired(rec, req.asOf) || !flt.schemaOk(rec)) {
      problems.push(`${id}: fails the place, type, discipline or expiry filter`);
    }
  }
  return problems;
};

export const removedNote = (removed: RemovedCounts): string | null => {
  const words: Record<keyof RemovedCounts, string> = { expired: "expired", failed_schema: "incomplete", duplicate: "duplicate" };
  const parts = (Object.entries(removed) as [keyof RemovedCounts, number][])
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${words[k]} listing${n !== 1 ? "s" : ""} removed`);
  return parts.length ? parts.join("; ") + "." : null;
};

/** Records added without a recheck (extraction ending in _unverified, e.g. mara_backfill_unverified). */
export const isUnverified = (rec: OppRecord): boolean => String(rec.extraction || "").endsWith("_unverified");

export const present = (rec: OppRecord, tier: Tier) => {
  const elig = rec.eligibility ?? [];
  const fee = rec.fee;
  return {
    title: rec.title, org: rec.org ?? null, type: rec.opportunity_type, subtype: rec.subtype ?? null,
    place: rec.borough || rec.region || null, location: rec.location ?? null,
    deadline: rec.deadline || "Deadline not listed",
    event_dates: rec.event_dates?.length ? rec.event_dates : null, recurrence: rec.recurrence ?? null,
    fee: fee == null || fee === "unknown" ? "Fee unknown" : fee, award: rec.award ?? null,
    eligibility: elig.length
      ? elig.map((e) => ({ requirement: e.requirement, quote: e.quote ?? null }))
      : "Eligibility not stated" as const,
    source: rec.source, source_url: rec.source_url,
    label: isUnverified(rec)
      ? "Not checked · added without a recheck"
      : `Checked ${rec.checked_at}` + (tier === 0 ? "" : " · not fully checked"),
    caveat: rec.caveat ?? null, dedupe_key: rec.dedupe_key,
  };
};

const addUsage = (total: Usage, usage: Usage) => {
  total.input_tokens += usage.input_tokens;
  total.output_tokens += usage.output_tokens;
};

/** Local time (now, or `d`) without a zone, to the second (matches Python's datetime.now().isoformat(timespec="seconds")). */
export const localTimestamp = (d: Date = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${flt.today(d)}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** A short id for one request's trace entry. */
export const newRequestId = () => randomUUID().replaceAll("-", "").slice(0, 12);

/** Optional controls for a run. Once `signal` is aborted the loop starts no new model call and serves the best
 * tier reached so far (Tier 2: the best passing attempt, or the code baseline); `signal.reason` (a string)
 * goes in the trace as `stopped`. Aborting never upgrades a result: an unreviewed ranking stays Tier 2.
 * `traceFields` are added to the run's trace entry (e.g. the search_id linking the runs of one API search). */
export type RunOptions = { signal?: AbortSignal; traceFields?: Record<string, unknown> };

const stopReason = (signal: AbortSignal) => (typeof signal.reason === "string" ? signal.reason : "aborted");

export const run = async (
  req: Request, records: OppRecord[], ranker: RankerRole, reviewer: ReviewerRole | null = null,
  traceTo: TraceSink | string | null = null, maxCandidates: number = MAX_CANDIDATES, opts: RunOptions = {},
): Promise<Result> => {
  const { signal } = opts;
  const trace: Record<string, unknown> & { attempts: Attempt[]; tokens: Usage } = {
    request_id: newRequestId(), at: localTimestamp(), ...opts.traceFields,
    request: flt.traceRequest(req),
    attempts: [], tokens: { input_tokens: 0, output_tokens: 0 },
  };

  const finish = async (result: Result): Promise<Result> => {
    Object.assign(trace, { tier: result.tier, served: result.results.map((r) => r.dedupe_key), reason: result.reason ?? null });
    // The trace is a log: failing to write it must not fail the request it describes (writeTrace swallows).
    if (traceTo) await writeTrace(typeof traceTo === "string" ? fileSink(traceTo) : traceTo, trace);
    result.request_id = trace.request_id as string;
    return result;
  };

  const problem = flt.requestProblem(req);
  if (problem) return finish({ tier: 3, results: [], reason: problem, removed: null, removed_counts: null });

  const [cands, removed] = flt.select(records, req);
  const filterTrace: Record<string, unknown> = { matched: cands.length, removed };
  trace.filter = filterTrace;
  const note = removedNote(removed);
  if (!cands.length) {
    return finish({ tier: 3, results: [], reason: `no records match ${flt.requestLabel(req)}`, removed: note,
                    removed_counts: removed });
  }

  const ordered = baselineOrder(cands.map((r): [null, OppRecord] => [null, r]));
  filterTrace.sent_to_ranker = Math.min(ordered.length, maxCandidates);
  const shown: Candidate[] = ordered.slice(0, maxCandidates).map(([, r], i) => [`r${i + 1}`, r]);
  const byId = new Map(shown);

  let best: RankItem[] | null = null;
  let tier: Tier = 2;
  let previous: RankItem[] | null = null;
  let critique: string | null = null;
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    if (signal?.aborted) {
      trace.stopped = stopReason(signal);
      break;
    }
    const attempt: Attempt = { n: n + 1 };
    trace.attempts.push(attempt);
    let ranking: RankItem[];
    try {
      let usage: Usage;
      [ranking, usage] = await ranker.rank(req, shown, previous, critique);
      addUsage(trace.tokens, usage);
    } catch (e) {
      if (!(e instanceof ModelError)) throw e;
      attempt.ranker_error = e.message;
      continue;
    }
    attempt.ranking = ranking.map((i) => i.id);
    const problems = checkRanking(ranking, byId, req);
    if (problems.length) {
      attempt.check_problems = problems;
      [previous, critique] = [ranking, "Code checks failed: " + problems.join("; ")];
      continue;
    }
    best = ranking;
    if (reviewer === null) {
      attempt.review = "not run";
      break;
    }
    if (signal?.aborted) {
      attempt.review = "not run";
      trace.stopped = stopReason(signal);
      break;
    }
    let verdict;
    try {
      let usage: Usage;
      [verdict, usage] = await reviewer.review(req, shown, ranking);
      addUsage(trace.tokens, usage);
    } catch (e) {
      if (!(e instanceof ModelError)) throw e;
      attempt.reviewer_error = e.message;
      break;
    }
    [attempt.verdict, attempt.critique] = [verdict.verdict, verdict.critique];
    if (verdict.verdict === "accept") {
      tier = 0;
      break;
    }
    [previous, critique] = [ranking, verdict.critique];
  }

  if (best === null) {
    [best] = await new BaselineRanker().rank(req, shown);
    trace.fallback = "code baseline";
  }
  // Every id in best passed checkRanking (or came from the baseline), so byId has it.
  const served = best.map((i) => byId.get(i.id as string)!);
  if (tier === 0 && served.some(isUnverified)) {
    tier = 2;       // a result that was never checked cannot be served as verified
    trace.downgraded = "unverified records in the result";
  }
  const suspicious = served.filter(looksLikeInstructions);
  if (suspicious.length) {
    // A listing that talks to the model may have steered the Ranker or Reviewer: never serve it as verified.
    trace.suspicious_listings = suspicious.map((r) => r.dedupe_key);
    if (tier === 0) {
      tier = 2;
      trace.downgraded = "listing text reads like instructions to the model";
    }
  }
  // The model read every listing in the pool, not only the ones served. A listing that talks to the model may have
  // steered the ranking even if it was not served, so the whole result is "not fully checked".
  const steering = shown.map(([, r]) => r).filter(looksLikeInstructions);
  if (steering.length) {
    trace.suspicious_in_pool = steering.map((r) => r.dedupe_key);
    if (tier === 0) {
      tier = 2;
      trace.downgraded = "a listing the model was shown reads like instructions to it";
    }
  }
  const results = served.map((r) => present(r, tier));
  return finish({ tier, results, removed: note, removed_counts: removed });
};

const main = async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "as-of": { type: "string", default: flt.today() },
      baseline: { type: "boolean", default: false },       // code ranker only, no model calls
      "no-review": { type: "boolean", default: false },    // Claude ranker without the Reviewer
      snapshot: { type: "string", default: flt.SNAPSHOT },
    },
  });
  const [place, type] = positionals;
  const usage = `usage: pipeline.ts <place> <${flt.TYPES.join("|")}> [--as-of YYYY-MM-DD] [--baseline] [--no-review] [--snapshot DIR]`;
  if (!place || !type || positionals.length > 2) throw new Error(usage);
  if (!(flt.TYPES as readonly string[]).includes(type)) throw new Error(`invalid type '${type}'\n${usage}`);
  if (!flt.isIsoDate(values["as-of"])) throw new Error(`invalid --as-of '${values["as-of"]}'`);

  const req = flt.makeRequest(place, type, values["as-of"]);
  let ranker: RankerRole;
  let reviewer: ReviewerRole | null = null;
  if (values.baseline) {
    ranker = new BaselineRanker();
  } else {
    const model = new ClaudeModel();
    ranker = new Ranker(model);
    if (!values["no-review"]) reviewer = new Reviewer(model);
  }
  const tracePath = `${TRACE_DIR}/${flt.today()}.jsonl`;
  const out = await run(req, flt.load(values.snapshot), ranker, reviewer, tracePath);
  console.log(JSON.stringify(out, null, 2));
};

if (import.meta.main) {
  main().catch((e: Error) => {
    console.error(e.message);
    process.exit(2);
  });
}
