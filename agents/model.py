"""Claude client for the Ranker and Reviewer: one structured-output call per attempt.

Reads credentials the way the Anthropic SDK does (ANTHROPIC_API_KEY, or an `ant auth login` profile).
The SDK is imported only when a call is made, so the filter, checks and tests run without it.
"""

import json
import os

# Override with CLAUDE_MODEL, e.g. claude-sonnet-5-5 (half the price) or claude-haiku-5-5 (about 1/40).
MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")
# Server-side refusal fallback; Haiku has none, so the parameter is only sent to these models.
FALLBACK_MODELS = ("claude-opus-5-5", "claude-sonnet-5-5")
MAX_TOKENS = 16000


class ModelError(Exception):
    """The model call failed, was refused, or returned unusable output. The loop treats it as a failed attempt."""


class ClaudeModel:
    def __init__(self, model=MODEL, effort="medium"):
        self.model, self.effort, self._client = model, effort, None

    def _get_client(self):
        if self._client is None:
            try:
                import anthropic
            except ImportError as e:
                raise ModelError("anthropic SDK not installed (pip install anthropic)") from e
            self._client = anthropic.Anthropic()
        return self._client

    def call(self, system, user, schema):
        """Return (parsed JSON, usage dict)."""
        import anthropic
        client = self._get_client()
        try:
            extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"} if self.model in FALLBACK_MODELS else {}
            resp = client.beta.messages.create(
                model=self.model, max_tokens=MAX_TOKENS, system=system,
                messages=[{"role": "user", "content": user}],
                output_config={"effort": self.effort, "format": {"type": "json_schema", "schema": schema}},
                **extra,
            )
        except anthropic.APIError as e:
            raise ModelError(f"{type(e).__name__}: {e}") from e
        usage = {"input_tokens": resp.usage.input_tokens, "output_tokens": resp.usage.output_tokens}
        if resp.stop_reason == "refusal":
            raise ModelError("refused")
        if resp.stop_reason == "max_tokens":
            raise ModelError("output cut off at max_tokens")
        text = next((b.text for b in resp.content if b.type == "text"), "")
        try:
            return json.loads(text), usage
        except json.JSONDecodeError as e:
            raise ModelError("output was not JSON") from e
