import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import { BaselineRanker } from "../agents/roles.ts";
import * as flt from "../agents/filter.ts";
import * as pipeline from "../agents/pipeline.ts";
import { jsonSource, snapshotDir } from "./json-source.ts";

const snapshotFile = (records: unknown[]) => {
  const dir = mkdtempSync(`${tmpdir()}/json-source-`);
  writeFileSync(`${dir}/records.json`, JSON.stringify({ snapshot_id: "s1", count: records.length, records }));
  return dir;
};
const rec = (title: string, extra: Record<string, unknown> = {}) => ({
  title, dedupe_key: title, source: "s", source_url: "https://example.org", checked_at: "2026-10-27", snapshot_id: "s1",
  opportunity_type: "grant", borough: "brooklyn", region: "nyc", deadline: "2026-12-01", disciplines: ["music"], ...extra,
});

describe("jsonSource", () => {
  it("serves its own snapshot id as the published one", async () => {
    assert.equal(await jsonSource("s1", snapshotFile([])).publishedSnapshotId(), "s1");
  });

  it("returns only records of that snapshot that can match, in file order", async () => {
    const dir = snapshotFile([
      rec("B"), rec("A", { borough: "citywide" }), rec("Q", { borough: "queens" }), rec("NJ", { borough: null, region: "new_jersey" }),
      rec("Job", { opportunity_type: "job" }), rec("Other", { snapshot_id: "s0" }), rec("Dance", { disciplines: ["dance"] }),
    ]);
    const src = jsonSource("s1", dir);
    const titles = async (req: flt.Request, id = "s1") => (await src.loadRecords(req, id)).map((r) => r.title);
    assert.deepEqual(await titles(flt.makeRequest("brooklyn", "grant", "2026-11-01")), ["B", "A", "Dance"]);
    assert.deepEqual(await titles(flt.makeSearchRequest(["brooklyn", "new_jersey"], "grant", "2026-11-01", ["music"])), ["B", "A", "NJ"]);
    // Pinned to the id asked for, like the database reads.
    assert.deepEqual(await titles(flt.makeRequest("brooklyn", "grant", "2026-11-01"), "s0"), ["Other"]);
    assert.deepEqual(await titles(flt.makeRequest("brooklyn", "grant", "2026-11-01"), "s9"), []);
  });

  it("refuses a malformed id or a missing file at construction, without reading anything else", () => {
    for (const id of ["../etc", "a/b", ".hidden", "", "2026-10-27/../x"]) assert.throws(() => jsonSource(id), /SNAPSHOT_ID/, id);
    assert.throws(() => jsonSource("no-such-snapshot"), /no records.json/);
  });

  it("the real snapshot gives the same pipeline result as the whole records.json", async () => {
    const src = jsonSource("2026-10-27");
    const all = flt.load(snapshotDir("2026-10-27"));
    for (const req of [flt.makeRequest("brooklyn", "open_call", "2026-10-28"),
      flt.makeSearchRequest(["manhattan", "new_jersey", "dc"], "event", "2026-10-28", ["music", "comedy"])]) {
      const [a, b] = await Promise.all([
        pipeline.run(req, await src.loadRecords(req, "2026-10-27"), new BaselineRanker()),
        pipeline.run(req, all, new BaselineRanker()),
      ]);
      delete a.request_id;
      delete b.request_id;
      assert.deepEqual(a, b);
    }
  });
});
