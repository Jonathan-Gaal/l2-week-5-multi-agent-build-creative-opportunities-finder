/**
 * HTTP server for the API (src/api/types.ts). Reads settings from the environment (backend/.env.example),
 * checks them, and listens on PORT (default 8787).
 *
 * Usage:
 *   npm start                                   # node --env-file-if-exists=.env src/server.ts
 *   RANKER_MODE=baseline npm start              # code ranker only, no model calls
 */

import { createServer } from "node:http";

import { ClaudeModel, missingCredentials } from "./agents/model.ts";
import { createApp } from "./api/app.ts";
import { readConfig } from "./api/config.ts";
import { closePool, getPool } from "./db/pool.ts";

// How long shutdown waits for in-flight requests before closing their connections.
const SHUTDOWN_GRACE_MS = 10_000;

const main = () => {
  const config = readConfig(process.env);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy backend/.env.example to backend/.env)");
  if (config.mode !== "baseline") {
    const missing = missingCredentials();
    if (missing) throw new Error(`RANKER_MODE=${config.mode} needs Claude: ${missing}. Or set RANKER_MODE=baseline.`);
  }

  const handler = createApp({
    db: getPool(),
    model: config.mode === "baseline" ? null : new ClaudeModel(undefined, "medium", config.modelCallTimeoutMs),
    mode: config.mode,
    snapshotId: config.snapshotId,
    allowedOrigins: config.allowedOrigins,
    traceDir: config.traceDir,
    limits: config.limits,
  });
  const server = createServer((req, res) => void handler(req, res));

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

  server.listen(config.port, () => {
    const snapshot = config.snapshotId ? `snapshot ${config.snapshotId} (SNAPSHOT_ID override)` : "published snapshot";
    console.error(`listening on http://localhost:${config.port} · mode ${config.mode} · ${snapshot}`);
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
