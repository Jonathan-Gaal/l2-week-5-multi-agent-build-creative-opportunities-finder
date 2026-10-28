/**
 * Claude client for the Ranker and Reviewer: one structured-output call per attempt. Port of agents/model.py.
 *
 * Reads credentials the way the Anthropic SDK does (ANTHROPIC_API_KEY, or an `ant auth login` profile).
 * The client is created only when a call is made, so the filter, checks and tests run without credentials.
 */

import Anthropic from "@anthropic-ai/sdk";

// Override with CLAUDE_MODEL, e.g. claude-sonnet-5-5 (half the price) or claude-haiku-5-5 (about 1/40).
export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
// Server-side refusal fallback; Haiku has none, so the parameter is only sent to these models.
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5"];
const MAX_TOKENS = 16000;

export type Usage = { input_tokens: number; output_tokens: number };
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Anything that answers one system + user prompt with JSON matching a schema. Tests pass fakes. */
export type Model = {
  call(system: string, user: string, schema: Record<string, unknown>): Promise<[unknown, Usage]>;
};

/** The model call failed, was refused, or returned unusable output. The loop treats it as a failed attempt. */
export class ModelError extends Error {
  override name = "ModelError";
}

export class ClaudeModel implements Model {
  readonly model: string;
  readonly effort: Effort;
  private client: Anthropic | null = null;

  constructor(model: string = MODEL, effort: Effort = "medium") {
    this.model = model;
    this.effort = effort;
  }

  private getClient(): Anthropic {
    this.client ??= new Anthropic();
    return this.client;
  }

  async call(system: string, user: string, schema: Record<string, unknown>): Promise<[unknown, Usage]> {
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
      });
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
