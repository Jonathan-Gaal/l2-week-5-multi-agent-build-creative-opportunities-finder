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

test("a snapshot with no points of its own uses the newest bundled ones, matched by listing key", async () => {
  const bundled = await loadPoints("2026-11-01b");
  const borrowed = await loadPoints("a-later-snapshot-loaded-after-the-build");
  assert.deepEqual(borrowed, bundled);
});

test("a malformed snapshot id gets no pins", async () => {
  assert.deepEqual(await loadPoints("../2026-11-01b"), {});
  assert.deepEqual(await loadPoints("a/b"), {});
});
