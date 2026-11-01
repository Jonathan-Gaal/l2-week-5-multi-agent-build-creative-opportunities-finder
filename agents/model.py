"""Claude client for the Ranker and Reviewer: one structured-output call per attempt.

Reads credentials the way the Anthropic SDK does (ANTHROPIC_API_KEY, or an `ant auth login` profile).
The SDK is imported only when a call is made, so the filter, checks and tests run without it.
"""

import json
import os
import re
from collections import namedtuple
from pathlib import Path

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
            # Let the caller fall back on API failure instead of retrying inside the SDK.
            self._client = anthropic.Anthropic(max_retries=0)
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


# Why a model call failed at the API (port of web/server/agents/model.ts classifyModelError):
#   unavailable  the key can't be used for now (credentials, access, billing, credit or usage limit): stop calling
#                Claude and use the code ranker. retry_after_s: the API's retry-after, when it sent one.
#   transient    the service or connection failed: fall back for this request only.
#   rejected     the API refused this request (our bug, e.g. a bad schema): fall back, and look into it.
ModelFailure = namedtuple("ModelFailure", "kind reason retry_after_s", defaults=(None,))

# Anthropic reports used-up credit and workspace spend limits as 400 invalid_request_error, not 402 or 429.
_CREDIT_OR_USAGE = re.compile(r"credit balance|usage limit", re.I)


def _retry_after(err):
    headers = getattr(getattr(err, "response", None), "headers", None) or getattr(err, "headers", None) or {}
    raw = str(headers.get("retry-after") or "").strip()
    return float(raw) if re.fullmatch(r"\d+(\.\d+)?", raw) else None


def classify_model_error(e):
    """Classify an API failure: a ModelError raised from the SDK's APIError (or that error itself). None when the
    error didn't come from the API (refusal, cut-off or unparseable output), which keeps its bounded retries."""
    err = e.__cause__ if isinstance(e, ModelError) and e.__cause__ is not None else e
    if not isinstance(err, BaseException):
        return None
    status = getattr(err, "status_code", getattr(err, "status", None))
    if not isinstance(status, int):
        # The SDK's APITimeoutError subclasses APIConnectionError. By name: the SDK is imported only when calling.
        names = {c.__name__ for c in type(err).__mro__}
        return ModelFailure("transient", "model connection unavailable") if "APIConnectionError" in names else None
    message = f"{err} {'' if err is e else e}"
    if status in (401, 403):
        return ModelFailure("unavailable", "model credentials or access unavailable")
    if status == 402:
        return ModelFailure("unavailable", "model billing unavailable")
    if status == 429:
        return ModelFailure("unavailable", "model usage or rate limit reached", _retry_after(err))
    if status == 400 and _CREDIT_OR_USAGE.search(message):
        return ModelFailure("unavailable", "model credit or usage limit reached")
    if status >= 500:
        return ModelFailure("transient", "model service unavailable")
    if status >= 400:
        return ModelFailure("rejected", f"model request rejected ({status})")
    return None


def unavailable_reason(e):
    """The reason when `e` says the key can't be used now (classify_model_error kind "unavailable"), else None."""
    f = classify_model_error(e)
    return f.reason if f is not None and f.kind == "unavailable" else None


def missing_credentials():
    """Why Claude can't be called here, or None. Shared by the pipeline, the eval and the extractor."""
    env = os.environ
    if not (env.get("ANTHROPIC_API_KEY") or env.get("ANTHROPIC_AUTH_TOKEN") or env.get("ANTHROPIC_PROFILE")
            or any(Path.home().joinpath(".config/anthropic").glob("*"))):
        return "no Anthropic credentials (set ANTHROPIC_API_KEY or run `ant auth login`)"
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return "anthropic SDK not installed (pip install anthropic)"
    return None
