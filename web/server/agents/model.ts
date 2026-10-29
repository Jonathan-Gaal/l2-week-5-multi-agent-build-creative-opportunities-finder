/**
 * Claude client for the Ranker and Reviewer: one structured-output call per attempt. Port of agents/model.py.
 *
 * Reads credentials the way the Anthropic SDK does (ANTHROPIC_API_KEY, or an `ant auth login` profile).
 * The client is created only when a call is made, so the filter, checks and tests run without credentials.
 */

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

import Anthropic from "@anthropic-ai/sdk";

// Override with CLAUDE_MODEL, e.g. claude-sonnet-5-5 (half the price) or claude-haiku-5-5 (about 1/40).
export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
// Server-side refusal fallback; Haiku has none, so the parameter is only sent to these models.
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5"];
const MAX_TOKENS = 16000;
// Per-call HTTP timeout (the SDK default is 10 minutes). The server passes a shorter one.
export const CALL_TIMEOUT_MS = 10 * 60_000;

export type Usage = { input_tokens: number; output_tokens: number };
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Per-call options. `signal` aborts the call (the server's per-request deadline). */
export type CallOptions = { signal?: AbortSignal };

/** Anything that answers one system + user prompt with JSON matching a schema. Tests pass fakes. */
export type Model = {
  call(system: string, user: string, schema: Record<string, unknown>, opts?: CallOptions): Promise<[unknown, Usage]>;
};

/** The model call failed, was refused, or returned unusable output. The loop treats it as a failed attempt. */
export class ModelError extends Error {
  override name = "ModelError";
}

export class ClaudeModel implements Model {
  readonly model: string;
  readonly effort: Effort;
  readonly timeoutMs: number;
  private client: Anthropic | null = null;

  constructor(model: string = MODEL, effort: Effort = "medium", timeoutMs: number = CALL_TIMEOUT_MS) {
    this.model = model;
    this.effort = effort;
    this.timeoutMs = timeoutMs;
  }

  private getClient(): Anthropic {
    this.client ??= new Anthropic({ timeout: this.timeoutMs });
    return this.client;
  }

  async call(system: string, user: string, schema: Record<string, unknown>, opts: CallOptions = {}): Promise<[unknown, Usage]> {
    const fallback = FALLBACK_MODELS.includes(this.model)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {};
    let resp;
    try {
      resp = await this.getClient().beta.messages.create({
        model: this.model, max_tokens: MAX_TOKENS, system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: this.effort, format: { type: "json_schema", schema } },
        ...fallback,
      }, { signal: opts.signal ?? null });
    } catch (e) {
      if (e instanceof Anthropic.APIError) throw new ModelError(`${e.name}: ${e.message}`, { cause: e });
      throw e;
    }
    const usage = { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens };
    if (resp.stop_reason === "refusal") throw new ModelError("refused");
    if (resp.stop_reason === "max_tokens") throw new ModelError("output cut off at max_tokens");
    const text = resp.content.find((b) => b.type === "text")?.text ?? "";
    try {
      return [JSON.parse(text), usage];
    } catch (e) {
      throw new ModelError("output was not JSON", { cause: e });
    }
  }
}

/** Why Claude can't be called here, or null. Shared by the eval and the server's startup check. */
export const missingCredentials = (): string | null => {
  const env = process.env;
  const profileDir = `${homedir()}/.config/anthropic`;
  const hasProfile = existsSync(profileDir) && readdirSync(profileDir).length > 0;
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE || hasProfile) return null;
  return "no Anthropic credentials (set ANTHROPIC_API_KEY or run `ant auth login`)";
};
