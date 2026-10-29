// postgresSink against the real Supabase Postgres: one line in, read back, deleted. The only integration test that
// writes, so it needs RUN_WRITE_TESTS=1 as well as DATABASE_URL, and supabase/traces.sql applied. Run with
// `RUN_WRITE_TESTS=1 npm run test:integration`; skips otherwise.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { newRequestId } from "../../server/agents/pipeline.ts";
import { postgresSink } from "../../server/db/traces.ts";
import { closePool, getPool } from "../helpers.ts";

const SKIP = !process.env.DATABASE_URL
  ? "DATABASE_URL is not set; trace insert test skipped"
  : process.env.RUN_WRITE_TESTS !== "1" ? "RUN_WRITE_TESTS is not 1; trace insert test skipped" : false;
if (SKIP) console.log(`# ${SKIP}`);

describe("public.traces", { skip: SKIP }, () => {
  const requestId = `it${newRequestId().slice(2)}`;
  after(async () => {
    await getPool().query("delete from public.traces where request_id = $1", [requestId]);
    await closePool();
  });

  it("postgresSink inserts the line whole, with its columns filled", async () => {
    const line = {
      request_id: requestId, at: "2026-10-29T12:00:00", request: { place: "brooklyn", type: "grant", as_of: "2026-10-29" },
      served_from: "cache", run_request_id: "aaaaaaaaaaaa", snapshot_id: "2026-10-27", tier: 2, served: ["k1"], model_calls: 0,
    };
    const logs: string[] = [];
    await postgresSink(getPool(), { log: (l) => logs.push(l), timeoutMs: 10_000 })(line);
    assert.deepEqual(logs, []);
    const { rows } = await getPool().query(
      "select request_id, search_id, run_request_id, snapshot_id, tier, served_from, line from public.traces where request_id = $1",
      [requestId]);
    assert.deepEqual(rows, [{
      request_id: requestId, search_id: null, run_request_id: "aaaaaaaaaaaa", snapshot_id: "2026-10-27", tier: 2,
      served_from: "cache", line,
    }]);
  });
});
