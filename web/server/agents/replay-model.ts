/**
 * A read-only Model that answers only from saved answers, keyed by the exact prompt (promptKey). It makes no network
 * call, needs no API key, and reads and writes no files: the answers are handed to it in memory. The production site
 * uses it for the three saved demo searches (src/lib/demoReplays.ts); the answers were recorded locally through
 * ClaudeCodeModel's queue (claude-code-model.ts), which keys them the same way.
 *
 * A prompt with no saved answer throws ReplayMiss. It is deliberately NOT a ModelError: the pipeline only turns a
 * ModelError into a failed attempt, so a miss fails the whole run instead of being served as a code-baseline result
 * that looks like a replay. The caller then serves the search the normal way.
 */
import { createHash } from "node:crypto";

import type { Model, Usage } from "./model.ts";

/** The key a saved answer is filed under: the whole prompt (system, user and reply schema). */
export const promptKey = (system: string, user: string, schema: Record<string, unknown>): string =>
  createHash("sha1").update(JSON.stringify([system, user, schema])).digest("hex");

export class ReplayMiss extends Error {
  override name = "ReplayMiss";
}

export class ReplayModel implements Model {
  private readonly answers: ReadonlyMap<string, unknown>;

  constructor(answers: Readonly<Record<string, unknown>>) {
    this.answers = new Map(Object.entries(answers));
  }

  async call(system: string, user: string, schema: Record<string, unknown>): Promise<[unknown, Usage]> {
    const key = promptKey(system, user, schema);
    if (!this.answers.has(key)) throw new ReplayMiss(`no saved answer for prompt ${key.slice(0, 12)}`);
    // A copy, so nothing downstream can change the saved answer for the next replay.
    return [structuredClone(this.answers.get(key)), { input_tokens: 0, output_tokens: 0 }];
  }
}
