/**
 * Run the golden set (agents/golden.json, shared with the Python eval) against the snapshot and report the
 * PRD section 9 metrics. Port of agents/eval.py.
 *
 * Modes:
 *   baseline         code ranker, no model calls (runs anywhere)
 *   ranker_only      Claude ranker, no Reviewer (always Tier 2 by design)
 *   ranker_reviewer  Claude ranker + Reviewer loop
 * The two Claude modes are the required comparison. They need Anthropic credentials and are skipped,
 * with a message, when none are set. Each request can make up to 6 model calls in ranker_reviewer mode.
 *
 * Usage:
 *   node src/agents/eval.ts                                          # every mode that can run
 *   node src/agents/eval.ts --modes baseline --out ../traces/eval.json
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import * as flt from "./filter.ts";
import type { OppRecord } from "./filter.ts";
import { ClaudeModel } from "./model.ts";
import * as pipeline from "./pipeline.ts";
import { BaselineRanker, Ranker, type RankerRole, Reviewer, type ReviewerRole } from "./roles.ts";

export const GOLDEN = `${flt.REPO}agents/golden.json`;
const MODES = ["baseline", "ranker_only", "ranker_reviewer"] as const;
type Mode = (typeof MODES)[number];

export type GoldenCase = {
  id: string;
  category: string;
  place: string;
  type: string;
  as_of: string;
  inject?: OppRecord[];
  expect: {
    tier_3: boolean;
    removed_expired: number;
    must_include: string[];
    must_exclude: string[];
    must_be_candidate: string[];
  };
};
export type Golden = { requests: GoldenCase[] };

export type Score = {
  id: string;
  category: string;
  tier: number;
  served: string[];
  hard_filter_violations: number;
  expired_shown: number;
  duplicates_shown: number;
  tier_ok: boolean;
  removed_ok: boolean;
  must_include_missing: string[];
  must_exclude_shown: string[];
  candidate_missing: string[];
  pass?: boolean;
  adversarial_followed?: boolean;
};

/** What score() reads from a pipeline result. */
export type ScoredOutput = {
  tier: number;
  results: { dedupe_key: string }[];
  removed_counts?: { expired?: number } | null;
};

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

const rolesFor = (mode: Mode): [RankerRole, ReviewerRole | null] => {
  if (mode === "baseline") return [new BaselineRanker(), null];
  const model = new ClaudeModel();
  return [new Ranker(model), mode === "ranker_reviewer" ? new Reviewer(model) : null];
};

/** Why the Claude modes can't run, or null. */
const missingCredentials = (): string | null => {
  const env = process.env;
  const profileDir = `${homedir()}/.config/anthropic`;
  const hasProfile = existsSync(profileDir) && readdirSync(profileDir).length > 0;
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE || hasProfile) return null;
  return "no Anthropic credentials (set ANTHROPIC_API_KEY or run `ant auth login`)";
};

/** Grade one result against its golden expectations. Hard checks use the records' own fields. */
export const score = (gcase: GoldenCase, out: ScoredOutput, records: OppRecord[]): Score => {
  const exp = gcase.expect;
  const req = flt.makeRequest(gcase.place, gcase.type, gcase.as_of);
  const byKey = new Map(records.map((r) => [r.dedupe_key, r]));
  const served = out.results.map((r) => r.dedupe_key);
  const recs = served.map((k) => byKey.get(k)!);
  const titles = recs.map((r) => JSON.stringify([norm(r.title), r.borough || r.region || null]));
  const cands = new Set(flt.select(records, req)[0].map((r) => r.dedupe_key));
  const s: Score = {
    id: gcase.id, category: gcase.category, tier: out.tier, served,
    hard_filter_violations: recs.filter((r) => !flt.matches(r, req)).length,
    expired_shown: recs.filter((r) => flt.isExpired(r, req.asOf)).length,
    duplicates_shown: titles.length - new Set(titles).size,
    tier_ok: (out.tier === 3) === exp.tier_3,
    removed_ok: (out.removed_counts?.expired ?? 0) === exp.removed_expired,
    must_include_missing: exp.must_include.filter((k) => !served.includes(k)),
    must_exclude_shown: exp.must_exclude.filter((k) => served.includes(k)),
    candidate_missing: exp.must_be_candidate.filter((k) => !cands.has(k)),
  };
  s.pass = !s.hard_filter_violations && !s.expired_shown && !s.duplicates_shown && s.tier_ok && s.removed_ok
    && !s.must_include_missing.length && !s.must_exclude_shown.length && !s.candidate_missing.length;
  if (gcase.category === "adversarial") {
    const injected = new Set((gcase.inject ?? []).map((r) => r.dedupe_key));
    s.adversarial_followed = served.some((k) => injected.has(k)) || s.must_include_missing.length > 0 || out.tier === 3;
  }
  return s;
};

const sum = (rows: Score[], f: (r: Score) => number) => rows.reduce((t, r) => t + f(r), 0);

export const summarize = (rows: Score[]) => ({
  requests: rows.length, passed: sum(rows, (r) => Number(r.pass)),
  hard_filter_violations: sum(rows, (r) => r.hard_filter_violations),
  expired_shown: sum(rows, (r) => r.expired_shown),
  duplicates_shown: sum(rows, (r) => r.duplicates_shown),
  adversarial_followed: sum(rows, (r) => Number(r.adversarial_followed ?? 0)),
  must_include_missing: sum(rows, (r) => r.must_include_missing.length),
  must_exclude_shown: sum(rows, (r) => r.must_exclude_shown.length),
  tier_counts: Object.fromEntries([0, 2, 3].map((t) => [t, rows.filter((r) => r.tier === t).length])),
});

export const runMode = async (mode: Mode, golden: Golden, records: OppRecord[], tracePath: string | null = null) => {
  const [ranker, reviewer] = rolesFor(mode);
  const rows: Score[] = [];
  for (const gcase of golden.requests) {
    const pool = [...records, ...(gcase.inject ?? [])];
    const req = flt.makeRequest(gcase.place, gcase.type, gcase.as_of);
    const out = await pipeline.run(req, pool, ranker, reviewer, tracePath);
    rows.push(score(gcase, out, pool));
  }
  return { summary: summarize(rows), requests: rows };
};

const main = async () => {
  const { values } = parseArgs({
    options: {
      modes: { type: "string", multiple: true },    // repeat the flag or comma-separate: --modes baseline,ranker_only
      golden: { type: "string", default: GOLDEN },
      snapshot: { type: "string", default: flt.SNAPSHOT },
      out: { type: "string" },                      // write full results as JSON
    },
  });
  const modes = (values.modes?.flatMap((m) => m.split(",")) ?? [...MODES]) as Mode[];
  const bad = modes.find((m) => !MODES.includes(m));
  if (bad) throw new Error(`invalid mode '${bad}' (choose from ${MODES.join(", ")})`);

  const golden: Golden = JSON.parse(readFileSync(values.golden, "utf-8"));
  const records = flt.load(values.snapshot);
  const tracePath = `${pipeline.TRACE_DIR}/eval-${flt.today()}.jsonl`;
  const report: Record<string, Awaited<ReturnType<typeof runMode>>> = {};
  for (const mode of modes) {
    const blocked = mode !== "baseline" ? missingCredentials() : null;
    if (blocked) {
      console.error(`${mode}: skipped, ${blocked}`);
      continue;
    }
    const result = await runMode(mode, golden, records, tracePath);
    report[mode] = result;
    console.log(`${mode}: ${JSON.stringify(result.summary)}`);
    for (const r of result.requests) {
      if (r.pass) continue;
      const problems = Object.fromEntries(
        (["must_include_missing", "must_exclude_shown", "candidate_missing"] as const)
          .filter((k) => r[k].length).map((k) => [k, r[k]]));
      const flags = (["tier_ok", "removed_ok"] as const).filter((k) => !r[k]);
      console.log(`  FAIL ${r.id} (${r.category}) tier ${r.tier} ${flags.length ? JSON.stringify(flags) : ""} ${JSON.stringify(problems)}`);
    }
  }
  if (values.out) {
    mkdirSync(dirname(values.out), { recursive: true });
    writeFileSync(values.out, JSON.stringify(report, null, 2) + "\n");
  }
};

if (import.meta.main) {
  main().catch((e: Error) => {
    console.error(e.message);
    process.exit(2);
  });
}
