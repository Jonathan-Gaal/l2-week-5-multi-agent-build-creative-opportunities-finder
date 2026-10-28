/**
 * Server settings from the environment (see backend/.env.example). Invalid settings throw ConfigError at
 * startup, naming the variable but never echoing its value.
 */

import { TRACE_DIR } from "../agents/pipeline.ts";
import { DEFAULT_LIMITS, type Limits, MODES, type Mode } from "./app.ts";

export class ConfigError extends Error {
  override name = "ConfigError";
}

export type Config = {
  port: number;
  mode: Mode;
  snapshotId: string | undefined;
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
  return {
    port: int(env, "PORT", 8787, 0, 65535),
    mode: mode as Mode,
    snapshotId,
    allowedOrigins: origins(env.ALLOWED_ORIGINS),
    // Unset: the repo's traces/ (git-ignored). Set but empty: tracing off.
    traceDir: env.TRACE_DIR === undefined ? TRACE_DIR : env.TRACE_DIR.trim() || null,
    modelCallTimeoutMs: int(env, "MODEL_CALL_TIMEOUT_MS", 60_000, 1000),
    limits: {
      ...DEFAULT_LIMITS,
      ratePerMinute: int(env, "RATE_LIMIT_PER_MINUTE", DEFAULT_LIMITS.ratePerMinute, 1),
      maxConcurrentRuns: int(env, "MAX_CONCURRENT_RUNS", DEFAULT_LIMITS.maxConcurrentRuns, 1),
      maxQueuedRuns: int(env, "MAX_QUEUED_RUNS", DEFAULT_LIMITS.maxQueuedRuns, 0),
      queueWaitMs: int(env, "QUEUE_WAIT_MS", DEFAULT_LIMITS.queueWaitMs, 0),
      dailyModelCalls: int(env, "DAILY_MODEL_CALLS", DEFAULT_LIMITS.dailyModelCalls, 0),
      requestDeadlineMs: int(env, "REQUEST_DEADLINE_MS", DEFAULT_LIMITS.requestDeadlineMs, 1000),
      cacheEntries: int(env, "CACHE_MAX_ENTRIES", DEFAULT_LIMITS.cacheEntries, 0),
    },
  };
};
