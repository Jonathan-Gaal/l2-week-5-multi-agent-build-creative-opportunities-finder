/**
 * Cost and abuse controls for the model-backed request path. All in memory and per process: a restart
 * resets them, and running N processes multiplies every limit by N.
 *
 * - rateLimiter: fixed-window count per client key (requests that would call the model).
 * - dailyBudget: process-wide count of model calls per local day (PRD section 10's cap).
 * - concurrencyGate: at most N model-backed runs at once, a short bounded queue for the rest.
 * - lruCache: bounded result cache with a per-entry time to live.
 * - guardedModel: wraps the Claude model for one request, charging every call to the budget and passing the
 *   request's abort signal (its deadline) to the call.
 */

import { today } from "../agents/filter.ts";
import { type Model, ModelError } from "../agents/model.ts";

export type Clock = () => number;

export type RateDecision = { ok: true } | { ok: false; retryAfterSec: number };

/** At most `limit` takes per key per window. take(key, n) charges n at once, all or nothing: if fewer than n
 * remain, nothing is charged. When `maxKeys` distinct keys are live, new keys are refused until windows
 * expire, so memory stays bounded under a flood of addresses. */
export const rateLimiter = (limit: number, windowMs: number, now: Clock, maxKeys = 10_000) => {
  const windows = new Map<string, { start: number; count: number }>();
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const expired = (start: number, t: number) => t - start >= windowMs || t < start;   // t < start: clock went back
  const sweep = (t: number) => {
    for (const [key, w] of windows) if (expired(w.start, t)) windows.delete(key);
  };
  return {
    take(key: string, n = 1): RateDecision {
      const t = now();
      let w = windows.get(key);
      if (w === undefined || expired(w.start, t)) {
        if (w === undefined && windows.size >= maxKeys) {
          sweep(t);
          if (windows.size >= maxKeys) return { ok: false, retryAfterSec: windowSec };
        }
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      if (w.count + n > limit) {
        return { ok: false, retryAfterSec: Math.min(windowSec, Math.max(1, Math.ceil((w.start + windowMs - t) / 1000))) };
      }
      w.count += n;
      return { ok: true };
    },
    size: () => windows.size,
  };
};
export type RateLimiter = ReturnType<typeof rateLimiter>;

/** Model calls allowed per local calendar day. take() reserves one call; it is synchronous, so concurrent
 * runs can never overspend. */
export const dailyBudget = (perDay: number, now: Clock) => {
  let day = "";
  let used = 0;
  const roll = () => {
    const d = today(new Date(now()));
    if (d !== day) [day, used] = [d, 0];
  };
  return {
    take(): boolean {
      roll();
      if (used >= perDay) return false;
      used += 1;
      return true;
    },
    remaining(): number {
      roll();
      return Math.max(0, perDay - used);
    },
  };
};
export type DailyBudget = ReturnType<typeof dailyBudget>;

export type Release = () => void;

/** At most `max` holders at once. acquire() resolves to a release function, or null when the queue is full
 * (`maxQueued` waiting) or the wait passes `waitMs`. Release is idempotent and hands the slot to the next
 * waiter. */
export const concurrencyGate = (max: number, maxQueued: number) => {
  let active = 0;
  const queue: { grant: (r: Release | null) => void; timer: NodeJS.Timeout }[] = [];
  const makeRelease = (): Release => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = queue.shift();
      if (next) {
        clearTimeout(next.timer);
        next.grant(makeRelease());          // the slot passes straight to the waiter; active is unchanged
      } else {
        active -= 1;
      }
    };
  };
  return {
    acquire(waitMs: number): Promise<Release | null> {
      if (active < max) {
        active += 1;
        return Promise.resolve(makeRelease());
      }
      if (queue.length >= maxQueued || waitMs <= 0) return Promise.resolve(null);
      return new Promise((resolve) => {
        const entry = {
          grant: resolve,
          timer: setTimeout(() => {
            const i = queue.indexOf(entry);
            if (i >= 0) queue.splice(i, 1);
            resolve(null);
          }, waitMs),
        };
        queue.push(entry);
      });
    },
    active: () => active,
    queued: () => queue.length,
  };
};
export type ConcurrencyGate = ReturnType<typeof concurrencyGate>;

/** Least-recently-used map with at most `maxEntries` entries, each expiring `ttlMs` after it was set. */
export const lruCache = <V>(maxEntries: number, now: Clock) => {
  const entries = new Map<string, { value: V; expires: number }>();
  return {
    get(key: string): V | undefined {
      const e = entries.get(key);
      if (e === undefined) return undefined;
      entries.delete(key);
      if (now() >= e.expires) return undefined;
      entries.set(key, e);                  // move to most recent
      return e.value;
    },
    set(key: string, value: V, ttlMs: number) {
      if (maxEntries <= 0) return;
      entries.delete(key);
      entries.set(key, { value, expires: now() + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
    },
    size: () => entries.size,
  };
};

export const BUDGET_USED_UP = "daily model call budget used up";
export const DEADLINE_PASSED = "request deadline passed";
export const SERVER_BUSY = "no run slot free in time";

/** What happened to the model during one run; `degraded` means the result may be worse than a normal run
 * (budget, deadline or a failed call), so it is cached only briefly. */
export type RunEvents = { calls: number; degraded: boolean };

/** One request's view of the model: every call is charged to the daily budget before it is made and gets
 * the request's abort signal. When the budget is used up the request is aborted, so the pipeline stops
 * starting attempts and serves Tier 2. */
export const guardedModel = (inner: Model, budget: DailyBudget, ctl: AbortController, events: RunEvents): Model => ({
  async call(system, user, schema) {
    if (ctl.signal.aborted) {
      events.degraded = true;
      throw new ModelError(typeof ctl.signal.reason === "string" ? ctl.signal.reason : "aborted");
    }
    if (!budget.take()) {
      events.degraded = true;
      ctl.abort(BUDGET_USED_UP);
      throw new ModelError(BUDGET_USED_UP);
    }
    events.calls += 1;
    try {
      return await inner.call(system, user, schema, { signal: ctl.signal });
    } catch (e) {
      events.degraded = true;
      throw e;
    }
  },
});

/** Rate-limit key for a client address: IPv4 as is, IPv6 by its /64 network (one host usually holds a
 * whole /64, so per-address limits are trivial to dodge). IPv4-mapped IPv6 is treated as IPv4. */
export const clientKey = (address: string | undefined): string => {
  if (!address) return "unknown";
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1]!;
  if (!address.includes(":")) return address;
  const bare = address.split("%")[0]!;        // drop a zone id (fe80::1%en0)
  const [head = "", tail = ""] = bare.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = bare.includes("::") ? (tail ? tail.split(":") : []) : [];
  const groups = bare.includes("::")
    ? [...headParts, ...Array<string>(Math.max(0, 8 - headParts.length - tailParts.length)).fill("0"), ...tailParts]
    : headParts;
  return groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(":") + "::/64";
};
