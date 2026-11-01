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
    // Let the request fall back on API failure instead of retrying inside the SDK.
    this.client ??= new Anthropic({ timeout: this.timeoutMs, maxRetries: 0 });
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
      if (e instanceof Anthropic.APIError) throw new ModelError(`${e.constructor.name}: ${e.message}`, { cause: e });
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

/**
 * Why a model call failed at the API, for deciding what to do next:
 *   unavailable  the key can't be used for now (credentials, access, billing, credit or usage limit): stop
 *                calling Claude for a while and serve the code ranker. retryAfterMs: the API's retry-after.
 *   transient    the service or connection failed: fall back for this request only.
 *   rejected     the API refused this request (our bug, e.g. a bad schema): fall back, and look into it.
 */
export type ModelFailure = { kind: "unavailable" | "transient" | "rejected"; reason: string; retryAfterMs?: number };

// Anthropic reports used-up credit and workspace spend limits as 400 invalid_request_error, not 402 or 429.
const CREDIT_OR_USAGE = /credit balance|usage limit/i;

/** retry-after in seconds (what the API sends), from SDK Headers or a plain object; undefined if absent or bad. */
const retryAfterMs = (headers: unknown): number | undefined => {
  if (!headers || typeof headers !== "object") return undefined;
  const raw = typeof (headers as Headers).get === "function"
    ? (headers as Headers).get("retry-after")
    : (headers as Record<string, unknown>)["retry-after"];
  const sec = typeof raw === "string" && /^\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw) : NaN;
  return Number.isFinite(sec) ? Math.round(sec * 1000) : undefined;
};

const messageOf = (x: unknown): string => (x && typeof x === "object" && "message" in x ? String(x.message) : "");

/**
 * Classify an API failure: a ModelError wrapping the SDK's APIError (or that error itself). null when the
 * error didn't come from the API (refusal, cut-off or unparseable output), which keeps its bounded retries.
 * The one place status codes are read: the server, the eval and the e2e test all call this.
 */
export const classifyModelError = (e: unknown): ModelFailure | null => {
  const err = e instanceof ModelError && e.cause !== undefined ? e.cause : e;
  if (!err || typeof err !== "object") return null;
  const status = "status" in err && typeof err.status === "number" ? err.status : null;
  // The SDK's message carries the response body ("400 {...credit balance is too low...}"); check the wrapper's too.
  const message = `${messageOf(err)} ${err === e ? "" : messageOf(e)}`;
  if (status === null) {
    // instanceof, not .name: the SDK's errors are all named "Error". The timeout is a connection error subclass.
    return err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.APIUserAbortError
      ? { kind: "transient", reason: "model connection unavailable" } : null;
  }
  if (status === 401 || status === 403) return { kind: "unavailable", reason: "model credentials or access unavailable" };
  if (status === 402) return { kind: "unavailable", reason: "model billing unavailable" };
  if (status === 429) {
    const after = retryAfterMs("headers" in err ? err.headers : undefined);
    return { kind: "unavailable", reason: "model usage or rate limit reached", ...(after === undefined ? {} : { retryAfterMs: after }) };
  }
  if (status === 400 && CREDIT_OR_USAGE.test(message)) return { kind: "unavailable", reason: "model credit or usage limit reached" };
  if (status >= 500) return { kind: "transient", reason: "model service unavailable" };
  if (status >= 400) return { kind: "rejected", reason: `model request rejected (${status})` };
  return null;
};

/** Why Claude can't be called here, or null. Shared by the eval and the server's startup check. */
export const missingCredentials = (): string | null => {
  const env = process.env;
  const profileDir = `${homedir()}/.config/anthropic`;
  const hasProfile = existsSync(profileDir) && readdirSync(profileDir).length > 0;
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE || hasProfile) return null;
  return "no Anthropic credentials (set ANTHROPIC_API_KEY or run `ant auth login`)";
};
