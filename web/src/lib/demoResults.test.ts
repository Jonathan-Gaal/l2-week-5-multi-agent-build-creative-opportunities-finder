import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_PRESETS } from "./demoPresets.ts";
import { frozenResults } from "./demoResults.ts";
import { listRuns } from "./savedRuns.ts";

const urlOf = (p: (typeof DEMO_PRESETS)[number]) => `/results?${new URLSearchParams({ d: p.d.join(","), s: p.s.join(","), p: p.p.join(",") })}`;

test("each demo has its recorded results bundled, so a deployed replay needs no model or database", () => {
  for (const preset of DEMO_PRESETS) {
    const out = frozenResults(urlOf(preset));
    assert.ok(out, `${preset.name} has no recorded results`);
    assert.ok(out.groups.length > 0 && out.snapshotId, `${preset.name} results look empty`);
  }
});

test("a search that is not one of the demos has no recorded results", () => {
  assert.equal(frozenResults("/results?d=music&t=event&p=brooklyn"), null);
});

test("the replay list is the three demos, in order, from bundled data", () => {
  const model = process.env.CLAUDE_CODE_AS_MODEL;
  try {
    process.env.CLAUDE_CODE_AS_MODEL = "0";
    assert.deepEqual(listRuns().map((r) => r.name), DEMO_PRESETS.map((p) => p.name));
  } finally {
    if (model === undefined) delete process.env.CLAUDE_CODE_AS_MODEL; else process.env.CLAUDE_CODE_AS_MODEL = model;
  }
});
