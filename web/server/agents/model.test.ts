// classifyModelError: which API failures mean "the key can't be used now" (expected values from the task's table).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import Anthropic from "@anthropic-ai/sdk";

import { type ModelFailure, ModelError, classifyModelError } from "./model.ts";

/** An SDK error for this status and body, wrapped the way ClaudeModel.call wraps it. */
const apiError = (status: number, message: string, headers: Record<string, string> = {}) => {
  const e = Anthropic.APIError.generate(status, { type: "error", error: { type: "x", message } }, undefined, new Headers(headers));
  return new ModelError(`${e.name}: ${e.message}`, { cause: e });
};
const CREDIT = "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";
const USAGE = "You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.";

const ACCESS: ModelFailure = { kind: "unavailable", reason: "model credentials or access unavailable" };
const LIMIT: ModelFailure = { kind: "unavailable", reason: "model credit or usage limit reached" };
const SERVICE: ModelFailure = { kind: "transient", reason: "model service unavailable" };
const CONNECTION: ModelFailure = { kind: "transient", reason: "model connection unavailable" };

describe("classifyModelError", () => {
  const table: [string, unknown, ModelFailure | null][] = [
    ["401", apiError(401, "invalid x-api-key"), ACCESS],
    ["403", apiError(403, "permission denied"), ACCESS],
    ["402", apiError(402, "payment required"), { kind: "unavailable", reason: "model billing unavailable" }],
    ["429 without retry-after", apiError(429, "rate limited"), { kind: "unavailable", reason: "model usage or rate limit reached" }],
    ["429 retry-after 30", apiError(429, "rate limited", { "retry-after": "30" }),
      { kind: "unavailable", reason: "model usage or rate limit reached", retryAfterMs: 30_000 }],
    ["429 unparseable retry-after", apiError(429, "rate limited", { "retry-after": "soon" }),
      { kind: "unavailable", reason: "model usage or rate limit reached" }],
    ["400 credit balance too low", apiError(400, CREDIT), LIMIT],
    ["400 usage limits reached", apiError(400, USAGE), LIMIT],
    ["400 credit, upper case", apiError(400, CREDIT.toUpperCase()), LIMIT],
    ["400 plain (our bug)", apiError(400, "output_config.format.schema: invalid"), { kind: "rejected", reason: "model request rejected (400)" }],
    ["404", apiError(404, "model not found"), { kind: "rejected", reason: "model request rejected (404)" }],
    ["500", apiError(500, "internal"), SERVICE],
    ["529 overloaded", apiError(529, "Overloaded"), SERVICE],
    ["connection error", new ModelError("x", { cause: new Anthropic.APIConnectionError({ message: "ECONNRESET" }) }), CONNECTION],
    ["timeout", new ModelError("x", { cause: new Anthropic.APIConnectionTimeoutError() }), CONNECTION],
    ["aborted by our deadline", new ModelError("x", { cause: new Anthropic.APIUserAbortError() }), CONNECTION],
    ["bare SDK error, unwrapped", Anthropic.APIError.generate(401, undefined, "no", new Headers()), ACCESS],
    ["plain status object as cause", new ModelError("denied", { cause: { status: 403 } }), ACCESS],
    ["credit text in the wrapper only", new ModelError(`BadRequestError: 400 ${CREDIT}`, { cause: { status: 400 } }), LIMIT],
    ["refusal (no API status)", new ModelError("refused"), null],
    ["output not JSON", new ModelError("output was not JSON", { cause: new SyntaxError("Unexpected token") }), null],
    ["not an error", "oops", null],
  ];
  for (const [name, error, expected] of table) {
    it(name, () => assert.deepEqual(classifyModelError(error), expected));
  }
});
