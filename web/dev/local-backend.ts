/**
 * Dev only. Runs Jon's real API (backend/src/api/app.ts: validation, pipeline, cost controls) on this machine from the
 * snapshot JSON file (backend/src/db/json-source.ts, the same as DATA_SOURCE=json), so the front end can be tried
 * without DATABASE_URL.
 *
 *   npm run backend:local          (from web/)   -> http://localhost:8787, code ranker, no model calls, no tokens
 *
 * Nothing here is used in production.
 */
import { createServer } from "node:http";

import { createApp } from "../../backend/src/api/app.ts";
import { DEFAULT_LIMITS } from "../../backend/src/api/app.ts";
import { jsonSource } from "../../backend/src/db/json-source.ts";

const SNAPSHOT = process.env.SNAPSHOT_ID || "2026-10-27";
const PORT = Number(process.env.PORT || 8787);
const ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",");

const handler = createApp({
  source: jsonSource(SNAPSHOT), model: null, mode: "baseline", snapshotId: SNAPSHOT, allowedOrigins: ORIGINS, traceDir: null,
  limits: { ...DEFAULT_LIMITS }, log: (line) => console.error(line),
});

createServer((req, res) => void handler(req, res)).listen(PORT, () => {
  console.error(`local backend: http://localhost:${PORT} · snapshot ${SNAPSHOT} (from the JSON file) · code ranker, no model calls`);
});
