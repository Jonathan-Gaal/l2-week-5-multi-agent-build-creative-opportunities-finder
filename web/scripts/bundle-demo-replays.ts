/**
 * Copies the saved demo searches (../runs/claude-code-live-runs) and their saved answers (../runs/claude-code-live-answers)
 * into src/data/demo-replays/replays.json, which the server imports, so the deployed site can replay them (Vercel only
 * ships web/). Run from web/ after re-recording a demo locally: node scripts/bundle-demo-replays.ts
 * The demo-replays test then checks every prompt of the three searches has an answer in the bundle.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

import { DEMO_PRESETS, demoPreset } from "../src/lib/demoPresets.ts";

const RUNS = "../runs/claude-code-live-runs";
const ANSWERS = "../runs/claude-code-live-answers";
const read = (file: string) => JSON.parse(readFileSync(file, "utf-8"));
const order = (url: string) => DEMO_PRESETS.findIndex((p) => p.name === demoPreset(url)?.name);

const runs = readdirSync(RUNS).filter((f) => f.endsWith(".json")).map((f) => read(`${RUNS}/${f}`))
  .filter((r) => demoPreset(r.url)).sort((a, b) => order(a.url) - order(b.url));
const answers = Object.fromEntries(readdirSync(ANSWERS).filter((f) => f.endsWith(".json")).sort()
  .map((f) => [f.replace(/\.json$/, ""), read(`${ANSWERS}/${f}`).reply]));

writeFileSync("src/data/demo-replays/replays.json", `${JSON.stringify({
  snapshot: "2026-11-01b", asOf: "2026-11-01", answeredBy: "Codex", runs, answers,
}, null, 1)}\n`, "utf-8");
console.log(`bundled ${runs.length} runs and ${Object.keys(answers).length} saved answers`);
