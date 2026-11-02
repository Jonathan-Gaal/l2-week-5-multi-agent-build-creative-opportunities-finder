/**
 * Claude Code plays the model while the site runs, no API key needed. Local development only: it is turned on with
 * CLAUDE_CODE_AS_MODEL=1 in web/.env.local and never in production.
 *
 * Each model call (the Ranker's or the Reviewer's) is written to <dir>/<id>.request.json, with a readable copy in
 * <dir>/<id>.prompt.txt, and then waits for <dir>/<id>.reply.json. The Claude Code session reads the prompt and writes
 * the reply. The site waits for it the way it waits for the API, so the Ranker -> Reviewer -> retry loop runs unchanged.
 *
 * Every answer is also saved, keyed by the exact prompt. When the same prompt comes up again, the saved answer is served
 * after a short pause (CLAUDE_CODE_REPLAY_MS, default 1200) instead of waiting for the session, so a search that was
 * answered once replays quickly through the real pipeline. CLAUDE_CODE_FRESH=1 ignores saved answers and asks again.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";

import { type CallOptions, type Model, ModelError, type Usage } from "./model.ts";
import { promptKey } from "./replay-model.ts";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ClaudeCodeModel implements Model {
  readonly dir: string;
  readonly savedDir: string;
  readonly pollMs: number;
  private n = 0;

  constructor(dir: string, savedDir: string, pollMs = 500) {
    this.dir = dir;
    this.savedDir = savedDir;
    this.pollMs = pollMs;
    mkdirSync(`${dir}/done`, { recursive: true });
    mkdirSync(savedDir, { recursive: true });
  }

  async call(system: string, user: string, schema: Record<string, unknown>, opts: CallOptions = {}): Promise<[unknown, Usage]> {
    const key = promptKey(system, user, schema);
    const savedPath = `${this.savedDir}/${key}.json`;
    if (existsSync(savedPath) && process.env.CLAUDE_CODE_FRESH !== "1") {
      try {
        const saved = JSON.parse(readFileSync(savedPath, "utf-8")) as { reply: unknown };
        await sleep(Number(process.env.CLAUDE_CODE_REPLAY_MS ?? 1200));
        return [saved.reply, { input_tokens: 0, output_tokens: 0 }];
      } catch {
        // an unreadable saved answer is asked for again below
      }
    }
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${(this.n += 1)}`;
    const base = `${this.dir}/${id}`;
    writeFileSync(`${base}.prompt.txt`,
      `SYSTEM:\n${system}\n\nUSER:\n${user}\n\nREPLY WITH JSON MATCHING:\n${JSON.stringify(schema, null, 1)}\n`, "utf-8");
    // The request file is written last and moved into place, so a watcher never sees a half-written one.
    writeFileSync(`${base}.request.tmp`, JSON.stringify({ id, schema }), "utf-8");
    renameSync(`${base}.request.tmp`, `${base}.request.json`);

    const finish = () => {
      for (const ext of ["request.json", "prompt.txt", "reply.json"]) {
        if (existsSync(`${base}.${ext}`)) renameSync(`${base}.${ext}`, `${this.dir}/done/${id}.${ext}`);
      }
    };
    for (;;) {
      if (opts.signal?.aborted) {
        finish();
        throw new ModelError("Claude Code did not answer before the request's deadline");
      }
      if (existsSync(`${base}.reply.json`)) {
        let reply: unknown;
        try {
          reply = JSON.parse(readFileSync(`${base}.reply.json`, "utf-8"));
        } catch {
          reply = undefined;                       // still being written; look again next time round
        }
        if (reply !== undefined) {
          writeFileSync(savedPath, JSON.stringify({ savedAt: new Date().toISOString(), request: user.slice(0, 120), reply }, null, 1), "utf-8");
          finish();
          return [reply, { input_tokens: 0, output_tokens: 0 }];
        }
      }
      await sleep(this.pollMs);
    }
  }
}
