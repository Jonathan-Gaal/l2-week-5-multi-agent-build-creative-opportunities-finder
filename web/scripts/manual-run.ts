/**
 * Claude Code plays the model, no API key needed (the TypeScript twin of scripts/manual_run.py).
 * Each model call writes its prompt to p<N>.txt and stops until a<N>.json (the model's reply) exists.
 * Whoever runs this reads the prompt and writes the reply, then runs it again.
 *
 * Usage (from web/):  node scripts/manual-run.ts <case>      (c1, c2, c3, c4, a01, a04)
 * Saved runs: ../runs/claude-code-as-model-v2/<case>/. Same requests as Jon's saved runs, run through this version
 * of the pipeline on snapshot 2026-11-01b as of 2026-11-01.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import * as flt from "../server/agents/filter.ts";
import type { OppRecord } from "../server/agents/filter.ts";
import type { Model, Usage } from "../server/agents/model.ts";
import * as pipeline from "../server/agents/pipeline.ts";
import { Ranker, Reviewer } from "../server/agents/roles.ts";

export const REPO = flt.REPO;
export const ROOT = `${REPO}runs/claude-code-as-model-v2`;
export const SNAPSHOT = `${REPO}data/snapshots/2026-11-01b`;
export const DAY = "2026-11-01";
// id, place, type, golden id to take injected listings from, candidates sent to the Ranker (the same caps Jon used)
export const CASES: Record<string, { place: string; type: string; cap: number; inject?: string }> = {
  c1: { place: "brooklyn", type: "open_call", cap: 25 },
  c2: { place: "manhattan", type: "grant", cap: 15 },
  c3: { place: "queens", type: "event", cap: 15 },
  c4: { place: "staten_island", type: "job", cap: 15 },
  a01: { place: "brooklyn", type: "open_call", cap: 15, inject: "a01" },
  a04: { place: "manhattan", type: "job", cap: 15, inject: "a04" },
};

class NeedAnswer extends Error {}

class ManualModel implements Model {
  n = 0;
  readonly dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }

  async call(system: string, user: string, schema: Record<string, unknown>): Promise<[unknown, Usage]> {
    this.n += 1;
    const a = `${this.dir}/a${this.n}.json`;
    if (existsSync(a)) return [JSON.parse(readFileSync(a, "utf-8")), { input_tokens: 0, output_tokens: 0 }];
    writeFileSync(`${this.dir}/p${this.n}.txt`,
      `SYSTEM:\n${system}\n\nUSER:\n${user}\n\nREPLY WITH JSON MATCHING:\n${JSON.stringify(schema)}\n`, "utf-8");
    throw new NeedAnswer(String(this.n));
  }
}

export const golden = (): Record<string, { inject?: OppRecord[] }> =>
  Object.fromEntries((JSON.parse(readFileSync(`${REPO}agents/golden.json`, "utf-8")).requests as { id: string; inject?: OppRecord[] }[]).map((c) => [c.id, c]));

export const poolFor = (id: string): OppRecord[] => [...flt.load(SNAPSHOT), ...(CASES[id]!.inject ? golden()[CASES[id]!.inject!]?.inject ?? [] : [])];

if (import.meta.main) {
  const id = process.argv[2] ?? "";
  const c = CASES[id];
  if (!c) {
    console.error(`case must be one of ${Object.keys(CASES).join(", ")}`);
    process.exit(2);
  }
  const dir = `${ROOT}/${id}`;
  mkdirSync(dir, { recursive: true });
  const model = new ManualModel(dir);
  const req = flt.makeRequest(c.place, c.type, DAY);
  try {
    const out = await pipeline.run(req, poolFor(id), new Ranker(model), new Reviewer(model), `${dir}/trace.jsonl`, c.cap);
    console.log(`DONE ${id}: ${c.place}/${c.type} -> Tier ${out.tier}  removed: ${out.removed}  matches: ${out.total_matches}`);
    for (const r of out.results) console.log(`  - ${r.title.slice(0, 75)} | ${r.place} | ${r.deadline} | ${r.label} | ${r.source}`);
  } catch (e) {
    if (!(e instanceof NeedAnswer)) throw e;
    console.log(`NEED ANSWER ${e.message}: read ${dir}/p${e.message}.txt`);
  }
}
