/**
 * Where trace lines go (PRD section 10: one trace entry per request). A sink takes one trace object and stores it:
 * the JSONL file sinks here (local development and the CLI), or db/traces.ts's postgresSink (Vercel, whose disk is
 * read-only). Callers write through writeTrace, so a failed write is logged and never fails the request it describes.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { isIsoDate, today } from "./filter.ts";

export type TraceLine = Record<string, unknown>;
export type TraceSink = (line: TraceLine) => Promise<void>;

/** Append each line as JSON to `path` (a fixed file, or one picked per line), creating its directory. */
export const fileSink = (path: string | ((line: TraceLine) => string)): TraceSink => async (line) => {
  const file = typeof path === "string" ? path : path(line);
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(line) + "\n", "utf-8");
};

/** The line's request date (request.as_of), or today when it is missing or not a date (never a path fragment). */
export const lineDate = (line: TraceLine): string => {
  const asOf = (line.request as { as_of?: unknown } | undefined)?.as_of;
  return isIsoDate(asOf) ? asOf : today();
};

/** One file per request date under `dir`: `<dir>/<as_of>.jsonl`, the server's file layout. */
export const dailyFileSink = (dir: string): TraceSink => fileSink((line) => `${dir}/${lineDate(line)}.jsonl`);

/** Write one line; a failure is logged (request id and error only, never the line) and swallowed. */
export const writeTrace = async (
  sink: TraceSink, line: TraceLine, log: (line: string) => void = (l) => console.error(l),
): Promise<void> => {
  try {
    await sink(line);
  } catch (e) {
    log(`trace write failed for ${String(line.request_id)}: ${(e as Error).message}`);
  }
};
