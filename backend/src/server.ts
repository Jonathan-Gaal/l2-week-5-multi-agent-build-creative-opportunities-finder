/**
 * HTTP server for the API (src/api/types.ts). Reads settings from the environment (backend/.env.example),
 * checks them, and listens on PORT (default 8787).
 *
 * Usage:
 *   npm start                                   # node --env-file-if-exists=.env src/server.ts
 *   RANKER_MODE=baseline npm start              # code ranker only, no model calls
 *   npm run start:local                         # JSON snapshot 2026-10-27, code ranker: no database, no model
 */

import { createServer } from "node:http";

import { ClaudeModel, missingCredentials } from "./agents/model.ts";
import { createApp } from "./api/app.ts";
import { readConfig } from "./api/config.ts";
import { jsonSource } from "./db/json-source.ts";
import { postgresSource } from "./db/opportunities.ts";
import { closePool, getPool } from "./db/pool.ts";

// How long shutdown waits for in-flight requests before closing their connections.
const SHUTDOWN_GRACE_MS = 10_000;
// Slow-client limits: every route is a GET with no body, so a request that takes longer than this to arrive
// (headers included) is a slowloris-style attack holding a socket open. Responses may still take minutes.
const REQUEST_RECEIVE_MS = 10_000;
const MAX_HEADER_BYTES = 8 * 1024;

const main = () => {
  const config = readConfig(process.env);
  const useJson = config.dataSource === "json";
  if (!useJson && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (copy backend/.env.example to backend/.env, or set DATA_SOURCE=json)");
  }
  if (config.mode !== "baseline") {
    const missing = missingCredentials();
    if (missing) throw new Error(`RANKER_MODE=${config.mode} needs Claude: ${missing}. Or set RANKER_MODE=baseline.`);
  }

  // The JSON file is read here, once, so a missing snapshot fails at startup rather than on the first search.
  const source = useJson ? jsonSource(config.snapshotId!) : postgresSource(getPool());
  const handler = createApp({
    source,
    model: config.mode === "baseline" ? null : new ClaudeModel(undefined, "medium", config.modelCallTimeoutMs),
    mode: config.mode,
    snapshotId: config.snapshotId,
    allowedOrigins: config.allowedOrigins,
    traceDir: config.traceDir,
    limits: config.limits,
    proxySecret: config.proxySecret,
  });
  const server = createServer(
    { requestTimeout: REQUEST_RECEIVE_MS, headersTimeout: REQUEST_RECEIVE_MS, maxHeaderSize: MAX_HEADER_BYTES,
      connectionsCheckingInterval: 1000 },
    (req, res) => void handler(req, res),
  );
  server.maxConnections = 256;

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) process.exit(1);          // second Ctrl-C: quit now
    stopping = true;
    console.error(`${signal}: shutting down`);
    const force = setTimeout(() => server.closeAllConnections(), SHUTDOWN_GRACE_MS);
    force.unref();
    server.close(() => {
      closePool().then(() => process.exit(0), (e: Error) => {
        console.error(`closing the database pool failed: ${e.message}`);
        process.exit(1);
      });
    });
    server.closeIdleConnections();
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  server.listen(config.port, config.host, () => {
    const snapshot = useJson
      ? `snapshot ${config.snapshotId} from records.json (DATA_SOURCE=json)`
      : config.snapshotId ? `snapshot ${config.snapshotId} (SNAPSHOT_ID override)` : "published snapshot";
    const proxy = config.proxySecret ? " · trusted proxy secret set" : "";
    console.error(`listening on http://${config.host}:${config.port} · mode ${config.mode} · ${snapshot}${proxy}`);
  });
};

if (import.meta.main) {
  try {
    main();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
}
