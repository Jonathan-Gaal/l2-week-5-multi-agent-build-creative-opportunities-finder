/**
 * Dev only. Runs Jon's real API (backend/src/api/app.ts: validation, pipeline, cost controls) on this machine with the
 * snapshot JSON file standing in for Postgres, so the front end can be tried without DATABASE_URL.
 *
 *   npm run backend:local          (from web/)   -> http://localhost:8787, code ranker, no model calls, no tokens
 *
 * It only answers the three SQL shapes backend/src/db/opportunities.ts sends. Nothing here is used in production.
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "../../backend/src/api/app.ts";
import { DEFAULT_LIMITS } from "../../backend/src/api/app.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SNAPSHOT = process.env.SNAPSHOT_ID || "2026-10-27";
const PORT = Number(process.env.PORT || 8787);
const ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",");

const records: Record<string, any>[] = JSON.parse(
  readFileSync(join(root, "data/snapshots", SNAPSHOT, "records.json"), "utf-8"),
).records;

const db = {
  async query(text: string, values: unknown[]) {
    if (text.includes("from public.snapshots")) return { rows: [{ id: SNAPSHOT }] };
    const [id, type, place] = values as string[];
    const byBorough = text.includes("borough in");
    const rows = records
      .filter((r) => id === SNAPSHOT && r.opportunity_type === type)
      .filter((r) => (byBorough ? r.borough === place || r.borough === "citywide" : r.region === place))
      .sort((a, b) => (a.dedupe_key < b.dedupe_key ? -1 : 1));
    return { rows };
  },
};

const handler = createApp({
  db, model: null, mode: "baseline", snapshotId: SNAPSHOT, allowedOrigins: ORIGINS, traceDir: null,
  limits: { ...DEFAULT_LIMITS }, log: (line) => console.error(line),
});

createServer((req, res) => void handler(req, res)).listen(PORT, () => {
  console.error(`local backend: http://localhost:${PORT} · snapshot ${SNAPSHOT} (${records.length} records, from the JSON file) · code ranker, no model calls`);
});
