import { mkdirSync, writeFileSync } from "node:fs";
import saved from "../data/demo-results.json" with { type: "json" };
import { demoKey, demoPreset } from "./demoPresets.ts";
import type { SearchOutput } from "./types.ts";

/**
 * The results of the three demo searches, saved exactly as the results service returned them (src/data/demo-results.json).
 * A replay (?replay=1) shows these instead of searching, so the deployed site replays a recorded run with no model,
 * no database and no local files. Server-only: it is imported by the results page.
 */
const FILE = `${process.cwd()}/src/data/demo-results.json`;

/** The saved results for a demo search, or null for any other search. */
export function frozenResults(url: string): SearchOutput | null {
  if (!demoPreset(url)) return null;
  return (saved as Record<string, SearchOutput>)[demoKey(url)] ?? null;
}

/** Saves the results of a demo search while Claude Code is the model on a dev machine; a no-op everywhere else. */
export function freezeResults(url: string, out: SearchOutput): void {
  if (process.env.CLAUDE_CODE_AS_MODEL !== "1" || process.env.NODE_ENV === "production" || !demoPreset(url)) return;
  try {
    mkdirSync(`${process.cwd()}/src/data`, { recursive: true });
    const next = { ...(saved as Record<string, SearchOutput>), [demoKey(url)]: out };
    writeFileSync(FILE, JSON.stringify(next, null, 1) + "\n", "utf-8");
  } catch {
    // a search that cannot be saved is simply not saved
  }
}
