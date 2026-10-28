// pipeline.run's optional signal (the server's deadline and budget stop) and trace-write failures.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import { type OppRecord, makeRequest } from "./filter.ts";
import * as pipeline from "./pipeline.ts";
import type { RankItem, RankerRole, ReviewerRole, Verdict } from "./roles.ts";

const rec = (title: string): OppRecord => ({
  title, dedupe_key: title.toLowerCase(), source: "s", source_url: `https://example.org/${title}`,
  checked_at: "2026-10-27", snapshot_id: "x", opportunity_type: "open_call", borough: "brooklyn", deadline: "2026-12-01",
});
const RECORDS = [rec("A"), rec("B"), rec("C")];
const req = () => makeRequest("brooklyn", "open_call", "2026-10-28");
const usage = { input_tokens: 1, output_tokens: 1 };

const ranker = (onRank: () => void = () => {}): RankerRole & { calls: number } => ({
  calls: 0,
  async rank(): Promise<[RankItem[], typeof usage]> {
    this.calls += 1;
    onRank();
    return [[{ id: "r2", reason: "x" }], usage];
  },
});
const reviewer = (): ReviewerRole & { calls: number } => ({
  calls: 0,
  async review(): Promise<[Verdict, typeof usage]> {
    this.calls += 1;
    return [{ verdict: "accept", critique: "" }, usage];
  },
});

describe("run with a signal", () => {
  it("already aborted: no model call, code baseline, Tier 2, reason in the trace", async () => {
    const path = `${mkdtempSync(`${tmpdir()}/trace-`)}/t.jsonl`;
    const ctl = new AbortController();
    ctl.abort("daily model call budget used up");
    const rk = ranker();
    const out = await pipeline.run(req(), RECORDS, rk, reviewer(), path, undefined, { signal: ctl.signal });
    assert.equal(rk.calls, 0);
    assert.equal(out.tier, 2);
    assert.ok(out.results.every((r) => r.label.endsWith("not fully checked")));
    const t = JSON.parse(readFileSync(path, "utf-8"));
    assert.deepEqual([t.stopped, t.fallback, t.attempts.length], ["daily model call budget used up", "code baseline", 0]);
  });

  it("aborted after a passing ranking: the Reviewer is not called and the ranking is served as Tier 2", async () => {
    const ctl = new AbortController();
    const rv = reviewer();
    const out = await pipeline.run(req(), RECORDS, ranker(() => ctl.abort("request deadline passed")), rv, null,
      undefined, { signal: ctl.signal });
    assert.equal(rv.calls, 0);
    assert.equal(out.tier, 2);
    assert.deepEqual(out.results.map((r) => r.title), ["B"]);
  });

  it("no signal: unchanged (Tier 0 on accept)", async () => {
    const out = await pipeline.run(req(), RECORDS, ranker(), reviewer());
    assert.equal(out.tier, 0);
  });
});

describe("trace write failure", () => {
  it("does not fail the request", async () => {
    const dir = mkdtempSync(`${tmpdir()}/trace-`);
    writeFileSync(`${dir}/file`, "");
    const out = await pipeline.run(req(), RECORDS, ranker(), reviewer(), `${dir}/file/t.jsonl`);
    assert.equal(out.tier, 0);
    assert.ok(out.request_id);
  });
});
