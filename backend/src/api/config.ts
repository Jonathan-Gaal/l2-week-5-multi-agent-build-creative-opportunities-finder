/**
 * Server settings from the environment (see backend/.env.example). Invalid settings throw ConfigError at
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

/** Shortest API_PROXY_SECRET accepted: long enough that it has to be generated, not typed. */
export const MIN_PROXY_SECRET_LENGTH = 32;

export type Config = {
  port: number;
  mode: Mode;
  /** postgres (DATABASE_URL) or json (data/snapshots/<SNAPSHOT_ID>/records.json, local development). */
  dataSource: DataSource;
  snapshotId: string | undefined;
  /** Shared secret for the trusted proxy's end-user header; undefined: proxy headers are ignored. */
  proxySecret: string | undefined;
  allowedOrigins: string[];
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

/** Comma-separated origins (scheme://host[:port]). '*' and anything that is not an exact origin is refused. */
const origins = (raw: string | undefined): string[] => {
  const list = (raw ?? "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean);
  for (const o of list) {
    let ok = false;
    try {
      ok = new URL(o).origin === o;
    } catch {
      ok = false;
    }
    if (!ok) throw new ConfigError("ALLOWED_ORIGINS must list exact origins like https://app.example.org (no wildcards)");
  }
  return list;
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
  // Not trimmed: the secret is compared exactly. Never echoed.
  const proxySecret = env.API_PROXY_SECRET || undefined;
  if (proxySecret !== undefined && proxySecret.length < MIN_PROXY_SECRET_LENGTH) {
    throw new ConfigError(`API_PROXY_SECRET must be at least ${MIN_PROXY_SECRET_LENGTH} characters (e.g. openssl rand -hex 32)`);
  }
  return {
    port: int(env, "PORT", 8787, 0, 65535),
    mode: mode as Mode,
    dataSource: dataSource as DataSource,
    snapshotId,
    proxySecret,
    allowedOrigins: origins(env.ALLOWED_ORIGINS),
    // Unset: the repo's traces/ (git-ignored). Set but empty: tracing off.
    traceDir: env.TRACE_DIR === undefined ? TRACE_DIR : env.TRACE_DIR.trim() || null,
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
