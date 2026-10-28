/**
 * Shared setup for the opt-in suites in test/integration and test/e2e: the real app factory, wired the way
 * src/server.ts wires it (readConfig, the real pg pool, ClaudeModel unless baseline), on an ephemeral port.
 * The database and model are wrapped only to count calls; every call still goes to the real thing.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ClaudeModel, type Model } from "../src/agents/model.ts";
import { createApp } from "../src/api/app.ts";
import { type Config, readConfig } from "../src/api/config.ts";
import { type Queryable, postgresSource } from "../src/db/opportunities.ts";
import { closePool, getPool } from "../src/db/pool.ts";

/** Staged (not published) snapshot both suites read. */
export const TEST_SNAPSHOT = "2026-10-27";
export const ALLOWED_ORIGIN = "http://localhost:5173";

type CountingDb = Queryable & { queries: number };
type CountingModel = Model & { calls: number };

export type Started = {
  base: string;
  config: Config;
  db: CountingDb;
  model: CountingModel | null;
  traceDir: string;
  get: (path: string, init?: RequestInit) => Promise<{ status: number; headers: Headers; body: any }>;
  /** Trace lines (JSONL) written for the given as_of date so far. */
  trace: (asOf: string) => Record<string, any>[];
  close: () => Promise<void>;
};

const countingDb = (inner: Queryable): CountingDb => ({
  queries: 0,
  query(text, values) {
    this.queries += 1;
    return inner.query(text, values);
  },
});

const countingModel = (inner: Model): CountingModel => ({
  calls: 0,
  call(...args) {
    this.calls += 1;
    return inner.call(...args);
  },
});

/** Start the app with these settings (as in backend/.env; DATABASE_URL still comes from process.env). The
 * trace always goes to a fresh temp dir, removed on close. Call close() so the pool and server shut down. */
export const startApp = async (env: Record<string, string | undefined>): Promise<Started> => {
  const traceDir = mkdtempSync(join(tmpdir(), "cof-trace-"));
  const config = readConfig({ ...env, TRACE_DIR: traceDir, PORT: "0" });
  const db = countingDb(getPool());
  const model = config.mode === "baseline"
    ? null
    : countingModel(new ClaudeModel(undefined, "medium", config.modelCallTimeoutMs));
  const handler = createApp({
    source: postgresSource(db), model, mode: config.mode, snapshotId: config.snapshotId,
    allowedOrigins: config.allowedOrigins, traceDir: config.traceDir, limits: config.limits,
  });
  const server: Server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const get: Started["get"] = async (path, init = {}) => {
    const res = await fetch(base + path, init);
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text === "" ? null : JSON.parse(text) };
  };
  const trace = (asOf: string) => {
    let text = "";
    try {
      text = readFileSync(join(traceDir, `${asOf}.jsonl`), "utf-8");
    } catch {
      return [];
    }
    return text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, any>);
  };
  const close = async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(traceDir, { recursive: true, force: true });
  };
  return { base, config, db, model, traceDir, get, trace, close };
};

export { closePool, getPool };

export const opp = (place: string, type: string) => `/api/opportunities?place=${place}&type=${type}`;
