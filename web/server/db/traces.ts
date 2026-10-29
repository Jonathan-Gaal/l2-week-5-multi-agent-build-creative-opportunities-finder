/**
 * Trace lines in Postgres (public.traces, supabase/traces.sql), for Vercel, whose disk is read-only. One row per
 * trace line: the whole line as jsonb, exactly as the file sink writes it, plus a few columns pulled out of it for
 * lookups. `npm run traces:pull` (checks/traces-pull.ts) exports them back to JSONL for the tools that read files.
 *
 * Never breaks a search: each write is bounded (WRITE_TIMEOUT_MS covers waiting for a pooled connection and the
 * insert), and any failure is logged (request id and error message, never the line) and swallowed. A write that
 * times out is abandoned, not cancelled: it may still land later, or stop at the pool's statement timeout.
 * Retention: after an insert, at most once per PRUNE_EVERY_MS per process, rows older than RETENTION_DAYS go.
 */

import type { TraceLine, TraceSink } from "../agents/trace.ts";
import type { Queryable } from "./opportunities.ts";

export const RETENTION_DAYS = 30;
export const PRUNE_EVERY_MS = 3600_000;
export const WRITE_TIMEOUT_MS = 2000;

export const INSERT = `insert into public.traces (request_id, search_id, run_request_id, snapshot_id, tier, served_from, line)
values ($1, $2, $3, $4, $5, $6, $7::jsonb)`;
// RETENTION_DAYS is a code constant, never input, so it is safe in the text.
export const PRUNE = `delete from public.traces where at < now() - interval '${RETENTION_DAYS} days'`;

const text = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** The INSERT's values for one line. A fresh run's line has no served_from or run_request_id (null); a cache or
 * shared line points at the run that produced its result. The line is stored whole, as JSON text. */
export const traceValues = (line: TraceLine): unknown[] => [
  text(line.request_id), text(line.search_id), text(line.run_request_id), text(line.snapshot_id),
  Number.isInteger(line.tier) ? line.tier : null, text(line.served_from), JSON.stringify(line),
];

/** `p`, or a rejection after `ms`; the timer never outlives the race. */
const within = async <T>(p: Promise<T>, ms: number, what: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

export type PostgresSinkOptions = { now?: () => number; log?: (line: string) => void; timeoutMs?: number };

/** A sink inserting into public.traces through `db` (the app's pool). Resolves once the write and any due prune
 * have finished, failed or timed out; it never rejects. */
export const postgresSink = (db: Queryable, opts: PostgresSinkOptions = {}): TraceSink => {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((l: string) => console.error(l));
  const ms = opts.timeoutMs ?? WRITE_TIMEOUT_MS;
  let lastPrune = -Infinity;
  return async (line) => {
    try {
      await within(db.query(INSERT, traceValues(line)), ms, "trace insert");
    } catch (e) {
      log(`trace write failed for ${String(line.request_id)}: ${(e as Error).message}`);
      return;
    }
    if (now() - lastPrune < PRUNE_EVERY_MS) return;
    lastPrune = now();       // claimed before the await, so concurrent writes don't prune twice; a failure waits too
    try {
      await within(db.query(PRUNE, []), ms, "trace prune");
    } catch (e) {
      log(`trace prune failed: ${(e as Error).message}`);
    }
  };
};
