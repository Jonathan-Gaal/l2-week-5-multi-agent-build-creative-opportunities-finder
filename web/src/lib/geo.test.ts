import assert from "node:assert/strict";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { loadPoints } from "./geo.ts";

test("deployed map coordinates work without the repository data directory", async () => {
  const previous = process.cwd();
  try {
    process.chdir(tmpdir());
    const points = await loadPoints("2026-11-01b");
    assert.ok(Object.keys(points).length > 1000);
    for (const p of Object.values(points)) {
      assert.ok(Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90);
      assert.ok(Number.isFinite(p.lng) && p.lng >= -180 && p.lng <= 180);
    }
  } finally {
    process.chdir(previous);
  }
});

test("a missing snapshot never borrows another snapshot's map pins", async () => {
  assert.deepEqual(await loadPoints("missing-demo-snapshot"), {});
  assert.deepEqual(await loadPoints("../2026-11-01b"), {});
});
