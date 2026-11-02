/**
 * The bundled demo replays, end to end through the real API and pipeline, with the read-only ReplayModel. The answers were
 * recorded on the JSON snapshot; production reads Postgres, so the same searches are also run over a Postgres-shaped copy of
 * the snapshot: each record as scripts/load_supabase.py row() writes it, read back through the columns
 * server/db/opportunities.ts selects, in the database's dedupe_key order (and reversed, so collation cannot matter).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import { type OppRecord, REPO, matches } from "../../server/agents/filter.ts";
import { ReplayModel, promptKey } from "../../server/agents/replay-model.ts";
import { META, createApp } from "../../server/api/app.ts";
import type { SearchResponse } from "../../server/api/types.ts";
import { jsonSource } from "../../server/db/json-source.ts";
import { COLUMNS, type RecordSource } from "../../server/db/opportunities.ts";
import { BUNDLED_RUNS, REPLAY_ANSWERS, REPLAY_DAY, REPLAY_SNAPSHOT, type SavedRun, replayHolds, savedReplayFor } from "./demoReplays.ts";
import { listRuns } from "./savedRuns.ts";
import { searchQuery } from "./searchQuery.ts";
import { pickIds, pickerChoices } from "./taxonomy.ts";
import { TYPE_PILL_IDS, subtypeTokens } from "./typePills.ts";

const NAMES = ["Alex · Manhattan auditions", "Sam · Art & writing across the tri-state", "Jordan · Poetry on Staten Island"];

/** The /api/search query the results page builds for a saved run's address (results/page.tsx). */
const apiQuery = (url: string): string => {
  const q = new URL(url, "http://x").searchParams;
  const allowed = pickerChoices(META);
  return searchQuery({
    places: pickIds(q.get("p"), allowed.places), types: pickIds(q.get("t"), allowed.types),
    disciplines: pickIds(q.get("d"), allowed.disciplines), subtypes: subtypeTokens(pickIds(q.get("s"), TYPE_PILL_IDS)),
  });
};

/** records.json as Postgres would serve it after scripts/load_supabase.py: row()'s defaults, then the select's columns. */
const postgresShaped = (order: "dedupe_key" | "reversed"): RecordSource => {
  const raw = JSON.parse(readFileSync(`${REPO}data/snapshots/${REPLAY_SNAPSHOT}/records.json`, "utf-8")).records as OppRecord[];
  const selected = COLUMNS.split(",").map((c) => c.trim().split(/\s+as\s+|::/).at(-1)!);
  const rows = raw.map((rec) => {
    const loaded: Record<string, unknown> = {
      ...rec, snapshot_id: REPLAY_SNAPSHOT, eligibility: rec.eligibility || [], disciplines: rec.disciplines || [],
      also_subtypes: rec.also_subtypes || [], event_dates: rec.event_dates?.length ? rec.event_dates : null,
    };
    return Object.fromEntries(selected.map((c) => [c, loaded[c] ?? null])) as OppRecord;
  }).sort((a, b) => (a.dedupe_key < b.dedupe_key ? -1 : a.dedupe_key > b.dedupe_key ? 1 : 0));
  if (order === "reversed") rows.reverse();
  return {
    publishedSnapshotId: async () => REPLAY_SNAPSHOT,
    loadRecords: async (req, id) => rows.filter((r) => r.snapshot_id === id && matches(r, req)),
  };
};

/** The replay API as src/lib/backend.ts builds it, counting the saved answers it used and any it lacked. */
const replayApp = (source: RecordSource) => {
  const used: string[] = [];
  const inner = new ReplayModel(REPLAY_ANSWERS);
  const model = {
    call: async (system: string, user: string, schema: Record<string, unknown>) => {
      used.push(promptKey(system, user, schema));
      return inner.call(system, user, schema);
    },
  };
  const logs: string[] = [];
  const app = createApp({
    source, model, mode: "ranker_reviewer", trace: null, log: (l) => logs.push(l),
    now: () => new Date(`${REPLAY_DAY}T12:00:00`).getTime(),
  });
  const search = async (url: string) => {
    const res = await app(new Request(`http://api/api/search?${apiQuery(url)}`), "test");
    return { status: res.status, body: (await res.json()) as SearchResponse };
  };
  return { search, used, logs };
};

const run = (name: string): SavedRun => BUNDLED_RUNS.find((r) => r.name === name)!;
const topTitles = (body: SearchResponse) => body.groups.flatMap((g) => g.results.map((r) => r.title));

describe("bundled demo replays", () => {
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

  it("bundles the three presets, recorded on snapshot 2026-11-01b as of 2026-11-01", () => {
    assert.deepEqual(BUNDLED_RUNS.map((r) => r.name), NAMES);
    assert.equal(REPLAY_SNAPSHOT, "2026-11-01b");
    assert.equal(REPLAY_DAY, "2026-11-01");
  });

  for (const source of ["json", "postgres", "postgres-reversed"] as const) {
    it(`replays each saved run's top picks exactly from the ${source} records, from saved answers only`, async () => {
      const app = replayApp(source === "json" ? jsonSource(REPLAY_SNAPSHOT) : postgresShaped(source === "postgres" ? "dedupe_key" : "reversed"));
      for (const name of NAMES) {
        const saved = run(name);
        const { status, body } = await app.search(saved.url);
        assert.equal(status, 200, `${name}: ${app.logs.join(" | ")}`);
        assert.deepEqual(topTitles(body), saved.top.map((t) => t.title), name);
        assert.equal(body.as_of, "2026-11-01");
        assert.ok(replayHolds(body), name);
      }
      // Exactly the six recorded answers (Ranker then Reviewer, for Alex, Sam and Jordan), every one found.
      assert.deepEqual(app.used.map((k) => k.slice(0, 7)), ["d8a4541", "c97cf74", "cfab7f4", "84ae43a", "809ff36", "85e961f"]);
      assert.deepEqual(app.logs, []);
      assert.equal(fetches, 0);
    });
  }

  it("a search with no saved answers fails the replay (500, nothing cached) instead of serving a baseline as a replay", async () => {
    const app = replayApp(jsonSource(REPLAY_SNAPSHOT));
    const other = "/results?d=theater&t=open_call&p=brooklyn&s=auditions";
    for (let i = 0; i < 2; i++) {
      const { status } = await app.search(other);
      assert.equal(status, 500);
    }
    assert.equal(app.logs.filter((l) => l.includes("ReplayMiss")).length, 2);
    assert.equal(fetches, 0);
  });

  it("listRuns returns the three bundled demos in production with no model bridge", () => {
    const env = process.env as Record<string, string | undefined>;
    const saved = { NODE_ENV: env.NODE_ENV, CLAUDE_CODE_AS_MODEL: env.CLAUDE_CODE_AS_MODEL };
    try {
      env.NODE_ENV = "production";
      delete env.CLAUDE_CODE_AS_MODEL;
      assert.deepEqual(listRuns().map((r) => r.name), NAMES);
      assert.equal(listRuns()[0]!.top[0]!.title, "The Phantom of the Opera (Tour) - NYC EPA (11.04.26) (Box 5 Company, LLC)");
      env.CLAUDE_CODE_AS_MODEL = "1";     // still production: the bridge stays off, so still the bundled three
      assert.deepEqual(listRuns().map((r) => r.name), NAMES);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete env[k];
        else env[k] = v;
      }
    }
  });
});

describe("savedReplayFor", () => {
  const replayOf = (url: string) => savedReplayFor(new URL(url, "http://x").searchParams)?.name ?? null;

  it("picks a bundled run only for the replay flow's request for exactly that search", () => {
    for (const r of BUNDLED_RUNS) assert.equal(replayOf(`${r.url}&replay=1`), r.name);
    // Order, duplicates and page controls do not change the search.
    assert.equal(replayOf("/results?p=manhattan&s=auditions&t=open_call&d=theater&pg=2&replay=1"), NAMES[0]);
    assert.equal(replayOf("/results?d=poet&t=residency,open_call&p=staten_island&s=residencies,open_calls&replay=1"), NAMES[2]);
  });

  it("never picks one for any other request", () => {
    const alex = BUNDLED_RUNS[0]!.url;
    assert.equal(replayOf(alex), null);                                          // a visitor's own search, no replay flag
    assert.equal(replayOf(`${alex}&replay=0`), null);
    assert.equal(replayOf(alex.replace("manhattan", "manhattan,brooklyn") + "&replay=1"), null);   // one more place
    assert.equal(replayOf(alex.replace("t=open_call", "t=open_call,event") + "&replay=1"), null);   // one more type
    assert.equal(replayOf(alex.replace("d=theater", "d=music") + "&replay=1"), null);
    assert.equal(replayOf("/results?d=poet&t=residency&p=staten_island&s=residencies&replay=1"), null);   // Jordan, one type fewer
  });
});

describe("replayHolds", () => {
  const group = (tier: 0 | 2 | 3) => ({ type: "open_call", tier, results: [], removed: null, request_id: "x" }) as unknown as SearchResponse["groups"][number];
  const res = (snapshot: string, ...tiers: (0 | 2 | 3)[]): SearchResponse => ({ snapshot_id: snapshot, as_of: "2026-11-01", groups: tiers.map(group) });

  it("holds only for the recorded snapshot with every group accepted or empty", () => {
    assert.equal(replayHolds(res("2026-11-01b", 0)), true);
    assert.equal(replayHolds(res("2026-11-01b", 3, 0)), true);
    assert.equal(replayHolds(res("2026-11-01b", 0, 2)), false);     // a degraded group fell back to the code ranking
    assert.equal(replayHolds(res("2026-11-01b", 3)), false);        // nothing was replayed
    assert.equal(replayHolds(res("2026-10-27", 0)), false);         // another snapshot is published
  });
});
