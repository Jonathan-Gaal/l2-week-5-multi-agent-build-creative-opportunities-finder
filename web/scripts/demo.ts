/** Cross-platform local presentation server. Uses committed answers, never a paid model API. */
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3010"], {
  stdio: "inherit",
  env: { ...process.env, DATA_SOURCE: "json", SNAPSHOT_ID: "2026-11-01b", RANKER_MODE: "ranker_reviewer",
    CLAUDE_CODE_AS_MODEL: "1", CLAUDE_CODE_FRESH: "0", CLAUDE_CODE_REPLAY_MS: "0", DEMO_AS_OF: "2026-11-01" },
});
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
