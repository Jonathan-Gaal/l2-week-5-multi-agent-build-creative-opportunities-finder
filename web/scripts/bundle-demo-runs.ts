/**
 * Copies the recorded demo runs (../runs/claude-code-live-runs/) into src/data/demo-runs.json, the list the deployed site
 * plays from. Only runs that match a demo in src/lib/demoPresets.ts are kept, in the same order.
 * Usage (from web/):  npm run demo:bundle      Run it after recording a demo, then commit the file.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEMO_PRESETS, demoPreset } from "../src/lib/demoPresets.ts";

const DIR = `${process.cwd()}/../runs/claude-code-live-runs`;
const OUT = `${process.cwd()}/src/data/demo-runs.json`;

type Run = { name: string; url: string };
const runs: Run[] = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf-8")) as Run)
  : [];
const kept = runs
  .filter((r) => demoPreset(r.url))
  .sort((a, b) => DEMO_PRESETS.findIndex((p) => p.name === demoPreset(a.url)?.name) - DEMO_PRESETS.findIndex((p) => p.name === demoPreset(b.url)?.name));
writeFileSync(OUT, JSON.stringify(kept, null, 1) + "\n", "utf-8");

const missing = DEMO_PRESETS.filter((p) => !kept.some((r) => demoPreset(r.url)?.name === p.name)).map((p) => p.name);
console.log(`Bundled ${kept.length} demo runs into src/data/demo-runs.json.`);
if (missing.length) console.log(`Not recorded yet: ${missing.join("; ")}`);
