import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import { ModelError } from "./model.ts";
import { ReplayMiss, ReplayModel, promptKey } from "./replay-model.ts";

const SCHEMA = { type: "object" };

describe("ReplayModel", () => {
  let fetches = 0;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    fetches = 0;
    globalThis.fetch = (async () => {
      fetches += 1;
      throw new Error("no network in a replay");
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("files answers under sha1 of [system, user, schema], the key ClaudeCodeModel saves them under", () => {
    // Hand-computed: printf '%s' '["S","U",{"type":"object"}]' | shasum -a 1
    assert.equal(promptKey("S", "U", SCHEMA), "2e01e1af75efed41ca5d440623ea9fb3645998d7");
  });

  it("returns the saved answer for a known prompt, with zero usage and no network", async () => {
    const reply = { ranking: [{ id: "r2", reason: "saved" }] };
    const model = new ReplayModel({ [promptKey("sys", "user", SCHEMA)]: reply });
    const [out, usage] = await model.call("sys", "user", SCHEMA);
    assert.deepEqual(out, { ranking: [{ id: "r2", reason: "saved" }] });
    assert.deepEqual(usage, { input_tokens: 0, output_tokens: 0 });
    // A copy: changing what came back does not change the next replay.
    (out as { ranking: unknown[] }).ranking.length = 0;
    assert.deepEqual((await model.call("sys", "user", SCHEMA))[0], reply);
    assert.equal(fetches, 0);
  });

  it("an unknown prompt is a ReplayMiss (not a ModelError, so the pipeline cannot turn it into a baseline result)", async () => {
    const model = new ReplayModel({ [promptKey("sys", "user", SCHEMA)]: { ranking: [] } });
    const miss = await model.call("sys", "user changed by one character.", SCHEMA).then(() => null, (e: unknown) => e);
    assert.ok(miss instanceof ReplayMiss);
    assert.ok(!(miss instanceof ModelError));
    await assert.rejects(model.call("sys", "user", { type: "array" }), ReplayMiss);
    assert.equal(fetches, 0);
  });

  it("can write no file and reach no network: its only runtime import is node:crypto", () => {
    const src = readFileSync(new URL("./replay-model.ts", import.meta.url), "utf-8");
    const imports = [...src.matchAll(/^import\s+(type\s+)?.*?from\s+"([^"]+)"/gm)].map((m) => `${m[1] ? "type " : ""}${m[2]}`);
    assert.deepEqual(imports, ["node:crypto", "type ./model.ts"]);
  });
});
