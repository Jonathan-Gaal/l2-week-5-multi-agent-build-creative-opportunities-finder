/**
 * Signed visitor cookie: the per-visitor rate-limit identity, so classmates behind one public address (a school
 * Wi-Fi) each get their own limit instead of sharing one. It is an identity for rate limits only, never auth: it
 * unlocks nothing but a separate bucket, and a visitor without a valid one is keyed by their address exactly as
 * before (controls.visitorRateLimiter), so clearing or forging it never gains more than that shared bucket.
 *
 * Value: `<id>.<sig>`, id = 16 random bytes and sig = HMAC-SHA256(VISITOR_COOKIE_SECRET, "visitor.v1." + id),
 * both base64url. Minted by src/proxy.ts (which runs on the Node.js runtime in Next 16, so node:crypto is there)
 * and verified again by the page that reads it (src/lib/backend.ts visitorClient): nothing downstream trusts a
 * header or cookie it hasn't checked itself.
 *
 * Choices:
 * - SameSite=Lax, not Strict. A classmate opening the shared link from Slack or another site would arrive without
 *   a Strict cookie and be minted a second one (the old one still exists, just not sent cross-site), splitting
 *   their limit and growing the limiter's key table. Lax sends it on top-level GET navigations, which is all a
 *   rate-limit identity needs; the search pages change nothing, so there is no CSRF surface for Strict to cover.
 * - HttpOnly (no script reads it), Secure on https (not on http://localhost in dev), Path=/, 30 days.
 * - First request: the proxy also writes a freshly minted cookie into the request it forwards, so the page
 *   rendering that same request already sees (and verifies) the new id; a first visit straight to /results is
 *   keyed by its cookie, not the shared address bucket.
 * - No VISITOR_COOKIE_SECRET (or one shorter than MIN_SECRET_LENGTH): no cookie is set and every visitor is keyed
 *   by address, as before. Logged once per process; never thrown, so a missing setting can't take the site down.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Type only: the proxy bundles this file, and controls.ts pulls in the agents.
import type { Client } from "./controls.ts";

export const VISITOR_COOKIE = "aa_visitor";
export const VISITOR_MAX_AGE_SEC = 30 * 24 * 3600;
export const MIN_SECRET_LENGTH = 32;
/** Network key for visitors whose address is unknown (no trusted proxy): they all share one bucket. */
export const SHARED_NETWORK = "shared";

const ID_BYTES = 16;
const VALUE = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;   // 16-byte id, 32-byte HMAC, base64url unpadded

let warned = false;

/** The signing secret, or null when unset or too short (then visitors are keyed by address). Warns once. */
export function visitorSecret(env: Record<string, string | undefined> = process.env, warn = console.warn): string | null {
  const secret = env.VISITOR_COOKIE_SECRET ?? "";
  if (secret.length >= MIN_SECRET_LENGTH) return secret;
  if (!warned) {
    warned = true;
    const why = secret ? `shorter than ${MIN_SECRET_LENGTH} characters` : "not set";
    warn(env.VERCEL === "1"
      ? `WARNING: VISITOR_COOKIE_SECRET is ${why}. Rate limits fall back to one bucket per address, so everyone on a shared network (a classroom) shares one limit. Set it in the Vercel project's Environment Variables (openssl rand -hex 32).`
      : `VISITOR_COOKIE_SECRET is ${why}: rate limits are per address (no visitor cookie). See web/.env.example.`);
  }
  return null;
}

const sign = (id: string, secret: string) => createHmac("sha256", secret).update(`visitor.v1.${id}`).digest("base64url");

/** A new cookie value for a fresh random id. */
export function mintVisitorCookie(secret: string): { id: string; value: string } {
  const id = randomBytes(ID_BYTES).toString("base64url");
  return { id, value: `${id}.${sign(id, secret)}` };
}

/** The id in a cookie value signed with `secret`, or null for anything else (malformed, tampered, other secret).
 * Compares the canonical base64url text in constant time, so a re-encoded signature doesn't pass either. */
export function verifyVisitorCookie(value: string | undefined | null, secret: string | null): string | null {
  if (!secret || typeof value !== "string") return null;
  const m = VALUE.exec(value);
  if (!m) return null;
  const expected = Buffer.from(sign(m[1]!, secret));
  const given = Buffer.from(m[2]!);
  return given.length === expected.length && timingSafeEqual(given, expected) ? m[1]! : null;
}

/** One cookie from a Cookie header (the first with that name), undecoded. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** A Cookie header with `name=value` first and every other copy of `name` dropped (the proxy forwards a freshly
 * minted cookie this way, so the page parses the same value readCookie would). */
export function withCookie(header: string | null | undefined, name: string, value: string): string {
  const rest = (header ?? "").split(";").map((p) => p.trim())
    .filter((p) => p && p.slice(0, Math.max(0, p.indexOf("="))).trim() !== name);
  return [`${name}=${value}`, ...rest].join("; ");
}

/** Response cookie attributes. `secure`: the request came over https (always on Vercel). */
export const visitorCookieOptions = (secure: boolean) => ({
  httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: VISITOR_MAX_AGE_SEC,
});

/**
 * The rate-limit identity for one request: `v:<id>` from a valid visitor cookie in `cookieHeader`, else `network`
 * (controls.clientKey of the visitor's address, or SHARED_NETWORK when unknown). No header but Cookie is
 * consulted, so a client can't name its own id any other way.
 */
export function visitorClient(cookieHeader: string | null | undefined, network: string, secret: string | null): Client {
  const id = verifyVisitorCookie(readCookie(cookieHeader, VISITOR_COOKIE), secret);
  return { key: id ? `v:${id}` : network, network };
}

/** For tests: forget that the missing-secret warning was logged. */
export const resetVisitorWarning = () => { warned = false; };
