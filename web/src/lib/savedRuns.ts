import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEMO_PRESETS, demoPreset } from "./demoPresets.ts";
import { BUNDLED_RUNS, type SavedRun } from "./demoReplays.ts";

export type { SavedRun } from "./demoReplays.ts";

/**
 * Saved runs for the demo: the three searches that went through the pipeline with their Ranker and Reviewer answers saved
 * (answered by Codex through the local model bridge, CLAUDE_CODE_AS_MODEL=1). Each one is a small file in
 * runs/claude-code-live-runs/ holding the picks, the address of its results page and the top results; the answers are in
 * runs/claude-code-live-answers/. Both are bundled into src/data/demo-replays/ (scripts/bundle-demo-replays.ts), so the
 * deployed site lists and replays them too, read-only (src/lib/demoReplays.ts).
 */
const DIR = `${process.cwd()}/../runs/claude-code-live-runs`;

/** Local recording: the model bridge is on outside production, so new runs are written to, and listed from, runs/. */
const recording = () => process.env.CLAUDE_CODE_AS_MODEL === "1" && process.env.NODE_ENV !== "production";

/** Keeps a record of this search the first time it is seen. Only while recording locally; never in production. */
export function recordRun(run: Omit<SavedRun, "savedAt">): void {
  if (!recording()) return;
  try {
    mkdirSync(DIR, { recursive: true });
    const file = `${DIR}/${createHash("sha1").update(run.url).digest("hex").slice(0, 16)}.json`;
    // The first time a search is seen fixes its date; seeing it again refreshes its picks (the ranking may have changed since).
    const previous = existsSync(file) ? readFileSync(file, "utf-8") : null;
    const savedAt = previous ? (JSON.parse(previous) as SavedRun).savedAt : new Date().toISOString();
    const next = JSON.stringify({ ...run, name: demoPreset(run.url)?.name ?? run.name, savedAt }, null, 1);
    // Replaying unchanged results must not rewrite a watched file and trigger a refresh cycle.
    if (next !== previous) writeFileSync(file, next, "utf-8");
  } catch {
    // a run that cannot be recorded is simply not listed
  }
}

/** Every saved demo run, in preset order: the three bundled ones, or while recording locally, what runs/ holds now. */
export function listRuns(): SavedRun[] {
  if (!recording() || !existsSync(DIR)) return [...BUNDLED_RUNS];
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      try {
        return [JSON.parse(readFileSync(`${DIR}/${f}`, "utf-8")) as SavedRun];
      } catch {
        return [];
      }
    })
    .filter((r) => demoPreset(r.url))
    .sort((a, b) => DEMO_PRESETS.findIndex((p) => p.name === demoPreset(a.url)?.name) - DEMO_PRESETS.findIndex((p) => p.name === demoPreset(b.url)?.name));
}

/** The find flow's first step, set to play this run's picks: the replay carries them (rd, rs, rp) from step to step. */
export const replayHref = (url: string): string => {
  const q = new URL(url, "http://run").searchParams;
  return `/find/discipline?${new URLSearchParams({ replay: "1", rd: q.get("d") ?? "", rs: q.get("s") ?? "", rp: q.get("p") ?? "" })}`;
};
