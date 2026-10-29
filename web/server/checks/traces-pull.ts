/**
 * Export trace lines from Postgres (public.traces, written by TRACE_SINK=postgres on Vercel) to JSONL, so the tools
 * that read traces/<date>.jsonl work on deployed traffic too.
 *
 * A day is the request's as_of (line.request.as_of), the same key the file sink names its files by, so a day's
 * export holds the same lines a local server would have filed under that date. Lines go in `at` order, one per row.
 * Each day is written to traces/db-<date>.jsonl (git-ignored), replacing that file: running it twice gives the same
 * file, never duplicates, and the local server's own traces/<date>.jsonl is never touched. A day with no rows writes
 * nothing (rows past the 30-day retention are gone; an earlier export of that day is kept).
 * jsonb keeps the content but not the key order of each line.
 *
 * Usage:
 *   npm run traces:pull                        # today (this machine's date)
 *   npm run traces:pull -- --date 2026-10-28
 *   npm run traces:pull -- --since 2026-10-01  # every day from then on, one file per day
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { isIsoDate, today } from "../agents/filter.ts";
import { TRACE_DIR } from "../agents/pipeline.ts";
import { closePool, getPool } from "../db/pool.ts";

// The day is a parameter, never part of the text.
const QUERY = `select line->'request'->>'as_of' as day, line from public.traces
where line->'request'->>'as_of' >= $1 and line->'request'->>'as_of' <= $2
order by at, id`;

const main = async () => {
  const { values } = parseArgs({ options: { date: { type: "string" }, since: { type: "string" } } });
  if (values.date && values.since) throw new Error("give --date or --since, not both");
  const from = values.since ?? values.date ?? today();
  if (!isIsoDate(from)) throw new Error("dates are YYYY-MM-DD");
  const to = values.since ? "9999-12-31" : from;

  const { rows } = await getPool().query<{ day: string; line: unknown }>(QUERY, [from, to]);
  const days = new Map<string, string[]>();
  for (const { day, line } of rows) {
    if (!isIsoDate(day)) continue;        // the day names a file: only a real date may
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(JSON.stringify(line));
  }
  if (!days.size) return console.log(`no traces for ${values.since ? `${from} onward` : from}`);
  mkdirSync(TRACE_DIR, { recursive: true });
  for (const [day, lines] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    const path = `${TRACE_DIR}/db-${day}.jsonl`;
    writeFileSync(path, lines.join("\n") + "\n", "utf-8");
    console.log(`${lines.length} trace line${lines.length !== 1 ? "s" : ""} -> ${path}`);
  }
};

main()
  .catch((e: Error) => {
    console.error(e.message);
    process.exitCode = 2;
  })
  .finally(closePool);
