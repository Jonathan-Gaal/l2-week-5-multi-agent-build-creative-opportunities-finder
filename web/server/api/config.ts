/**
 * Server settings from the environment (see web/.env.example). Invalid settings throw ConfigError at
 * startup, naming the variable but never echoing its value.
 */

import { TRACE_DIR } from "../agents/pipeline.ts";
import { TYPES } from "../agents/taxonomy.ts";
import { SNAPSHOT_ID_PATTERN } from "../db/json-source.ts";
import { DEFAULT_LIMITS, type Limits, MODES, type Mode } from "./app.ts";

export class ConfigError extends Error {
  override name = "ConfigError";
}

export const DATA_SOURCES = ["postgres", "json"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export type Config = {
  mode: Mode;
  /** postgres (DATABASE_URL) or json (data/snapshots/<SNAPSHOT_ID>/records.json, local development). */
  dataSource: DataSource;
  snapshotId: string | undefined;
  traceDir: string | null;
  modelCallTimeoutMs: number;
  limits: Limits;
};

type Env = Record<string, string | undefined>;

const int = (env: Env, name: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number => {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new ConfigError(`${name} must be a whole number`);
  const n = Number(raw.trim());
  if (n < min || n > max) throw new ConfigError(`${name} is out of range`);
  return n;
};

export const readConfig = (env: Env): Config => {
  const mode = env.RANKER_MODE?.trim() || "ranker_reviewer";
  if (!(MODES as readonly string[]).includes(mode)) throw new ConfigError(`RANKER_MODE must be one of ${MODES.join(", ")}`);
  const snapshotId = env.SNAPSHOT_ID?.trim() || undefined;
  const dataSource = env.DATA_SOURCE?.trim() || "postgres";
  if (!(DATA_SOURCES as readonly string[]).includes(dataSource)) {
    throw new ConfigError(`DATA_SOURCE must be one of ${DATA_SOURCES.join(", ")}`);
  }
  if (dataSource === "json" && (snapshotId === undefined || !SNAPSHOT_ID_PATTERN.test(snapshotId))) {
    throw new ConfigError("the JSON data source needs SNAPSHOT_ID, a directory name under data/snapshots");
  }
  return {
    mode: mode as Mode,
    dataSource: dataSource as DataSource,
    snapshotId,
    // Unset: the repo's traces/ (git-ignored), or off on Vercel (read-only filesystem). Set but empty: tracing off.
    traceDir: env.TRACE_DIR === undefined ? (env.VERCEL === "1" ? null : TRACE_DIR) : env.TRACE_DIR.trim() || null,
    modelCallTimeoutMs: int(env, "MODEL_CALL_TIMEOUT_MS", 60_000, 1000),
    limits: {
      ...DEFAULT_LIMITS,
      // A search charges one per type, all at once, so a lower limit could never serve a search of every type.
      ratePerMinute: int(env, "RATE_LIMIT_PER_MINUTE", DEFAULT_LIMITS.ratePerMinute, TYPES.length),
      maxConcurrentRuns: int(env, "MAX_CONCURRENT_RUNS", DEFAULT_LIMITS.maxConcurrentRuns, 1),
      maxQueuedRuns: int(env, "MAX_QUEUED_RUNS", DEFAULT_LIMITS.maxQueuedRuns, 0),
      queueWaitMs: int(env, "QUEUE_WAIT_MS", DEFAULT_LIMITS.queueWaitMs, 0),
      dailyModelCalls: int(env, "DAILY_MODEL_CALLS", DEFAULT_LIMITS.dailyModelCalls, 0),
      requestDeadlineMs: int(env, "REQUEST_DEADLINE_MS", DEFAULT_LIMITS.requestDeadlineMs, 1000),
      cacheEntries: int(env, "CACHE_MAX_ENTRIES", DEFAULT_LIMITS.cacheEntries, 0),
    },
  };
};
