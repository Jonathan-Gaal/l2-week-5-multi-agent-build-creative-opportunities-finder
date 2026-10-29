import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import { today } from "./filter.ts";
import { dailyFileSink, lineDate, writeTrace } from "./trace.ts";

describe("trace sinks", () => {
  it("dailyFileSink appends one JSON line per write to <dir>/<as_of>.jsonl", async () => {
    const dir = `${mkdtempSync(`${tmpdir()}/trace-`)}/nested`;
    const sink = dailyFileSink(dir);
    await sink({ request_id: "a", request: { as_of: "2026-10-28" } });
    await sink({ request_id: "b", request: { as_of: "2026-10-28" } });
    await sink({ request_id: "c", request: { as_of: "2026-10-29" } });
    const lines = readFileSync(`${dir}/2026-10-28.jsonl`, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => l.request_id), ["a", "b"]);
    assert.deepEqual(readdirSync(dir).sort(), ["2026-10-28.jsonl", "2026-10-29.jsonl"]);
  });

  it("a missing or non-date as_of files under today, never as a path", () => {
    assert.equal(lineDate({ request: { as_of: "../../etc/passwd" } }), today());
    assert.equal(lineDate({ request: { as_of: "2026-02-30" } }), today());
    assert.equal(lineDate({}), today());
  });

  it("writeTrace logs a failed write (id and error only) and resolves", async () => {
    const logs: string[] = [];
    await writeTrace(async () => { throw new Error("disk full"); }, { request_id: "abc", request: { place: "brooklyn" } },
      (l) => logs.push(l));
    assert.deepEqual(logs, ["trace write failed for abc: disk full"]);
  });
});
