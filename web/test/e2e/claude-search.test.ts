// ONE real search through the real Ranker + Reviewer (Claude) and the real Postgres. COSTS MONEY.
// Opt-in only: runs when DATABASE_URL is set, Anthropic credentials are available, and RUN_PAID_TESTS=1.
// DAILY_MODEL_CALLS caps the spend at 6 model calls (the loop's own maximum: 3 Ranker + 3 Reviewer).
//   RUN_PAID_TESTS=1 npm run test:e2e:claude
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import * as flt from "../../server/agents/filter.ts";
import { missingCredentials } from "../../server/agents/model.ts";
import { isUnverified } from "../../server/agents/pipeline.ts";
import type { OpportunitiesResponse } from "../../server/api/types.ts";
import { loadRecords } from "../../server/db/opportunities.ts";
import { type Started, TEST_SNAPSHOT, closePool, getPool, opp, startApp } from "../helpers.ts";

const MAX_MODEL_CALLS = 6;
const PLACE = "brooklyn";
const TYPE = "open_call";

const skipReason = (): string | false => {
  const missing: string[] = [];
  if (process.env.RUN_PAID_TESTS !== "1") missing.push("RUN_PAID_TESTS=1 is not set (this suite makes paid Claude calls)");
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL is not set");
  const creds = missingCredentials();
  if (creds) missing.push(creds);
  return missing.length ? `paid Claude e2e skipped: ${missing.join("; ")}` : false;
};
const SKIP = skipReason();
if (SKIP) console.log(`# ${SKIP}`);

describe("one real search through Ranker + Reviewer", { skip: SKIP }, () => {
  let app: Started;
  after(async () => {
    if (app) {
      console.log(`# spend: ${app.model?.calls ?? 0} model calls (cap ${MAX_MODEL_CALLS})`);
      await app.close();
    }
    await closePool();
  });
  before(async () => {
    app = await startApp({
      RANKER_MODE: "ranker_reviewer", SNAPSHOT_ID: TEST_SNAPSHOT,
      DAILY_MODEL_CALLS: String(MAX_MODEL_CALLS),
    });
  });

  it(`${PLACE} ${TYPE}: tier 0 or 2, hard filters hold, labels follow PRD section 8, cached on repeat`, { timeout: 10 * 60_000 }, async () => {
    const r = await app.get(opp(PLACE, TYPE));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const body = r.body as OpportunitiesResponse;
    assert.equal(body.snapshot_id, TEST_SNAPSHOT);
    assert.ok(body.tier === 0 || body.tier === 2, `tier ${body.tier}`);
    assert.ok(body.results.length >= 1 && body.results.length <= 5, `${body.results.length} results`);

    // Hard filters, checked against the database rows the server read.
    const req = flt.makeRequest(PLACE, TYPE, body.as_of);
    const { records } = await loadRecords(getPool(), req, TEST_SNAPSHOT);
    const byKey = new Map(records.map((rec) => [rec.dedupe_key, rec]));
    const keys = body.results.map((x) => x.dedupe_key);
    assert.equal(new Set(keys).size, keys.length, "no duplicates");
    let unverified = 0;
    for (const x of body.results) {
      const rec = byKey.get(x.dedupe_key);
      assert.ok(rec, `${x.dedupe_key} is a ${PLACE} ${TYPE} record in the snapshot`);
      assert.ok(flt.matches(rec, req), `${x.dedupe_key} matches place and type`);
      assert.ok(flt.schemaOk(rec), `${x.dedupe_key} passes the schema check`);
      assert.ok(!flt.isExpired(rec, body.as_of), `${x.dedupe_key} is not expired as of ${body.as_of}`);
      // PRD section 8 labels.
      if (isUnverified(rec)) {
        unverified += 1;
        assert.match(x.label, /^Not checked/);
      } else if (body.tier === 0) {
        assert.equal(x.label, `Checked ${rec.checked_at}`);
      } else {
        assert.equal(x.label, `Checked ${rec.checked_at} · not fully checked`);
      }
    }
    if (unverified) assert.equal(body.tier, 2, "a result with an unchecked record is never tier 0");

    // The trace line for the run: at least one attempt and real token counts.
    const run = app.trace(body.as_of).find((l) => l.request_id === body.request_id);
    assert.ok(run, "trace line for the run");
    assert.ok(Array.isArray(run.attempts) && run.attempts.length >= 1, "at least one attempt");
    assert.ok(run.tokens.input_tokens > 0 && run.tokens.output_tokens > 0, "nonzero token counts");
    const calls = app.model!.calls;
    assert.ok(calls >= 1 && calls <= MAX_MODEL_CALLS);
    console.log(`# run: tier ${body.tier}, ${run.attempts.length} attempt(s), ${calls} model calls, `
      + `${run.tokens.input_tokens} input + ${run.tokens.output_tokens} output tokens`);

    // Same request again: served from the cache, no further model calls.
    const again = await app.get(opp(PLACE, TYPE));
    assert.equal(again.status, 200);
    const second = again.body as OpportunitiesResponse;
    assert.deepEqual({ ...second, request_id: "" }, { ...body, request_id: "" });
    assert.equal(app.model!.calls, calls, "no model call for the repeat");
    const hit = app.trace(body.as_of).find((l) => l.request_id === second.request_id);
    assert.ok(hit, "trace line for the repeat");
    assert.deepEqual([hit.served_from, hit.run_request_id, hit.model_calls], ["cache", body.request_id, 0]);
  });
});
