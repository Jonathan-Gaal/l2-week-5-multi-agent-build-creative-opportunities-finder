import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEMO_PRESETS, demoPreset } from "./demoPresets.ts";

/**
 * Saved runs for the demo: the searches that went through the pipeline with Claude Code answering the Ranker and Reviewer
 * (CLAUDE_CODE_AS_MODEL=1, local development only). Each one is a small file in runs/claude-code-live-runs/ holding the picks, the
 * address of its results page and the top results. The model's answers themselves are in runs/claude-code-live-answers/ (see
 * server/agents/claude-code-model.ts), so opening a saved run's address replays it quickly through the real pipeline.
 */
const DIR = `${process.cwd()}/../runs/claude-code-live-runs`;

export type SavedRun = {
  name: string;
  url: string;
  savedAt: string;
  artists: string[];
  wants: string[];
  places: string[];
  top: { n: number; title: string }[];
};

/** Keeps a record of this search the first time it is seen. Only runs while Claude Code is the model; never in production. */
export function recordRun(run: Omit<SavedRun, "savedAt">): void {
  if (process.env.CLAUDE_CODE_AS_MODEL !== "1" || process.env.NODE_ENV === "production") return;
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

/** Every saved run, newest first. Empty when there are none (always the case in production). */
export function listRuns(): SavedRun[] {
  if (process.env.NODE_ENV === "production" || process.env.CLAUDE_CODE_AS_MODEL !== "1") return [];
  if (!existsSync(DIR)) return [];
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
