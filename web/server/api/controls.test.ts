import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type Model, ModelError } from "../agents/model.ts";
import {
  BUDGET_USED_UP, NETWORK_CEILING_FACTOR, type RunEvents, asClient, clientKey, concurrencyGate, dailyBudget,
  guardedModel, lruCache, modelBreaker, rateLimiter, visitorRateLimiter,
} from "./controls.ts";

const clock = (start = new Date(2026, 9, 28, 12).getTime()) => {
  const c = { t: start, now: () => c.t };
  return c;
};

describe("rateLimiter", () => {
  it("allows the limit per window, then refuses with the seconds left", () => {
    const c = clock();
    const rl = rateLimiter(2, 60_000, c.now);
    assert.deepEqual([rl.take("a"), rl.take("a")], [{ ok: true }, { ok: true }]);
    c.t += 15_000;
    assert.deepEqual(rl.take("a"), { ok: false, retryAfterSec: 45 });
    assert.deepEqual(rl.take("b"), { ok: true });     // keys are independent
  });

  it("a refused take does not extend the window; a new window resets the count", () => {
    const c = clock();
    const rl = rateLimiter(1, 60_000, c.now);
    rl.take("a");
    c.t += 59_999;
    assert.equal(rl.take("a").ok, false);
    c.t += 1;
    assert.equal(rl.take("a").ok, true);
  });

  it("Retry-After is at least 1 and at most the window, even if the clock goes back", () => {
    const c = clock();
    const rl = rateLimiter(1, 60_000, c.now);
    rl.take("a");
    c.t += 59_900;
    assert.deepEqual(rl.take("a"), { ok: false, retryAfterSec: 1 });
    const back = rateLimiter(1, 60_000, c.now);
    back.take("b");
    c.t -= 3600_000;                                   // clock moved back an hour: start a new window
    assert.deepEqual(back.take("b"), { ok: true });
  });

  it("a limit of 0 refuses everything", () => {
    assert.equal(rateLimiter(0, 60_000, clock().now).take("a").ok, false);
  });

  it("stays bounded: at maxKeys, new keys are refused until old windows expire", () => {
    const c = clock();
    const rl = rateLimiter(5, 60_000, c.now, 2);
    rl.take("a");
    rl.take("b");
    assert.deepEqual(rl.take("c"), { ok: false, retryAfterSec: 60, full: true });
    assert.equal(rl.take("a").ok, true);               // existing keys still work
    c.t += 60_000;
    assert.equal(rl.take("c").ok, true);               // expired windows swept
    assert.equal(rl.size(), 1);
  });
});

describe("rateLimiter.refund", () => {
  it("gives back a charge in the current window, never below zero, and is a no-op once it expired", () => {
    const c = clock();
    const rl = rateLimiter(2, 60_000, c.now);
    rl.take("a", 2);
    rl.refund("a");
    assert.equal(rl.take("a").ok, true);
    assert.equal(rl.take("a").ok, false);
    rl.refund("a", 99);
    assert.equal(rl.take("a", 2).ok, true);
    rl.refund("nobody");                                // unknown key: nothing happens, nothing is created
    assert.equal(rl.size(), 1);
    c.t += 60_000;
    rl.refund("a", 2);
    assert.equal(rl.take("a", 2).ok, true);
  });
});

describe("visitorRateLimiter", () => {
  const net = "203.0.113.7";
  const v = (id: string, network = net) => ({ key: `v:${id}`, network });

  it("two cookie visitors on one address get separate buckets; one using theirs up doesn't touch the other", () => {
    const rl = visitorRateLimiter(3, 60_000, clock().now);
    for (let i = 0; i < 3; i++) assert.equal(rl.take(v("a")).ok, true);
    assert.equal(rl.take(v("a")).ok, false);
    for (let i = 0; i < 3; i++) assert.equal(rl.take(v("b")).ok, true);
    assert.equal(rl.take(v("b")).ok, false);
  });

  it("without a cookie, everyone on the address shares one bucket (as before), separate from cookie buckets", () => {
    const rl = visitorRateLimiter(2, 60_000, clock().now);
    assert.deepEqual([rl.take(asClient(net)).ok, rl.take(asClient(net)).ok, rl.take(asClient(net)).ok], [true, true, false]);
    assert.equal(rl.take(v("a")).ok, true);             // a cookie visitor isn't in the exhausted address bucket
    assert.equal(rl.take(asClient("198.51.100.1")).ok, true);
  });

  it("a cookie farm on one address is capped at limit x ceiling factor; other addresses are unaffected", () => {
    const rl = visitorRateLimiter(2, 60_000, clock().now);
    let ok = 0;
    for (let i = 0; i < 100; i++) if (rl.take(v(`farm${i}`)).ok) ok += 1;
    assert.equal(ok, 2 * NETWORK_CEILING_FACTOR);
    assert.equal(rl.take(v("classmate")).ok, false);    // the address's ceiling is spent, for cookie visitors too
    assert.equal(rl.take(v("elsewhere", "198.51.100.1")).ok, true);
  });

  it("a visitor refused their own bucket gets the ceiling charge back (doesn't spend classmates' share)", () => {
    const rl = visitorRateLimiter(2, 60_000, clock().now, 2);   // ceiling 4
    for (let i = 0; i < 50; i++) rl.take(v("spammer"));          // 2 accepted, 48 refused
    assert.deepEqual([rl.take(v("b")).ok, rl.take(v("b")).ok, rl.take(v("b")).ok], [true, true, false]);
  });

  it("charges n all or nothing in both the visitor bucket and the ceiling", () => {
    const rl = visitorRateLimiter(3, 60_000, clock().now, 2);   // ceiling 6
    assert.equal(rl.take(v("a"), 4).ok, false);
    assert.equal(rl.take(v("a"), 3).ok, true);
    assert.equal(rl.take(v("b"), 3).ok, true);
    assert.equal(rl.take(v("c"), 1).ok, false);                  // ceiling 6 spent
  });

  it("once the window passes, the ceiling and visitor buckets reset", () => {
    const c = clock();
    const rl = visitorRateLimiter(1, 60_000, c.now, 1);
    assert.equal(rl.take(v("a")).ok, true);
    assert.equal(rl.take(v("b")).ok, false);
    c.t += 60_000;
    assert.equal(rl.take(v("b")).ok, true);
  });

  it("a full cookie table falls back to the visitor's address bucket rather than refusing them outright", () => {
    const rl = visitorRateLimiter(2, 60_000, clock().now, 100, 3);   // maxKeys 3 per table
    for (const id of ["x", "y", "z"]) rl.take(v(id, "10.0.0.1"));     // fills the cookie table, not the ceiling's
    assert.equal(rl.take(v("late")).ok, true);                        // served from net's address bucket
    assert.equal(rl.take(asClient(net)).ok, true);                    // ...which it shares with that address
    assert.equal(rl.take(v("late2")).ok, false);                      // address bucket (2) now spent
  });
});

describe("rateLimiter.take(key, n)", () => {
  it("charges n at once, all or nothing", () => {
    const rl = rateLimiter(5, 60_000, clock().now);
    assert.deepEqual(rl.take("a", 3), { ok: true });
    assert.equal(rl.take("a", 3).ok, false);           // only 2 left: nothing is charged
    assert.deepEqual(rl.take("a", 2), { ok: true });    // so both remaining still go through
    assert.equal(rl.take("a").ok, false);
  });

  it("more than the limit is refused even on a fresh key", () => {
    const rl = rateLimiter(2, 60_000, clock().now);
    assert.equal(rl.take("a", 3).ok, false);
    assert.deepEqual(rl.take("a", 2), { ok: true });
  });
});

describe("dailyBudget", () => {
  it("allows exactly perDay takes, then none", () => {
    const b = dailyBudget(3, clock().now);
    assert.deepEqual([b.take(), b.take(), b.take(), b.take()], [true, true, true, false]);
    assert.equal(b.remaining(), 0);
  });

  it("resets at local midnight, not before", () => {
    const c = clock(new Date(2026, 9, 28, 23, 59, 59).getTime());
    const b = dailyBudget(1, c.now);
    assert.equal(b.take(), true);
    assert.equal(b.take(), false);
    c.t += 1000;
    assert.equal(b.remaining(), 1);
    assert.equal(b.take(), true);
  });

  it("a budget of 0 never allows a call", () => {
    const b = dailyBudget(0, clock().now);
    assert.deepEqual([b.remaining(), b.take()], [0, false]);
  });
});

describe("concurrencyGate", () => {
  it("admits up to max, queues the next and hands the slot over on release", async () => {
    const g = concurrencyGate(1, 1);
    const r1 = await g.acquire(1000);
    assert.ok(r1);
    const waiting = g.acquire(1000);
    assert.equal(g.queued(), 1);
    r1();
    const r2 = await waiting;
    assert.ok(r2);
    assert.equal(g.active(), 1);
    r2();
    assert.equal(g.active(), 0);
  });

  it("refuses at once when the queue is full or there is no wait", async () => {
    const g = concurrencyGate(1, 1);
    await g.acquire(1000);
    void g.acquire(1000);
    assert.equal(await g.acquire(1000), null);
    assert.equal(await concurrencyGate(1, 5).acquire(0).then(() => null), null);
  });

  it("a waiter that times out is removed from the queue and gets null", async () => {
    const g = concurrencyGate(1, 2);
    const r1 = (await g.acquire(1000))!;
    assert.equal(await g.acquire(10), null);
    assert.equal(g.queued(), 0);
    r1();
    assert.equal(g.active(), 0);
  });

  it("releasing twice frees one slot only", async () => {
    const g = concurrencyGate(2, 0);
    const r1 = (await g.acquire(0))!;
    await g.acquire(0);
    r1();
    r1();
    assert.equal(g.active(), 1);
  });
});

describe("lruCache", () => {
  it("evicts the least recently used past maxEntries", () => {
    const c = lruCache<number>(2, clock().now);
    c.set("a", 1, 1000);
    c.set("b", 2, 1000);
    c.get("a");
    c.set("c", 3, 1000);
    assert.deepEqual([c.get("a"), c.get("b"), c.get("c")], [1, undefined, 3]);
  });

  it("expires entries after their own ttl", () => {
    const k = clock();
    const c = lruCache<number>(5, k.now);
    c.set("short", 1, 100);
    c.set("long", 2, 10_000);
    k.t += 100;
    assert.deepEqual([c.get("short"), c.get("long"), c.size()], [undefined, 2, 1]);
  });

  it("0 entries caches nothing", () => {
    const c = lruCache<number>(0, clock().now);
    c.set("a", 1, 1000);
    assert.equal(c.get("a"), undefined);
  });
});

describe("guardedModel", () => {
  const counting = () => {
    const seen: (AbortSignal | undefined)[] = [];
    const model: Model = { call: async (_s, _u, _sc, opts) => (seen.push(opts?.signal), [{}, { input_tokens: 1, output_tokens: 1 }]) };
    return { model, seen };
  };

  it("charges each call to the budget and passes the request's signal", async () => {
    const { model, seen } = counting();
    const ctl = new AbortController();
    const ev: RunEvents = { calls: 0, degraded: false };
    const b = dailyBudget(5, clock().now);
    const g = guardedModel(model, b, ctl, ev);
    await g.call("s", "u", {});
    await g.call("s", "u", {});
    assert.deepEqual([ev, b.remaining(), seen[0] === ctl.signal], [{ calls: 2, degraded: false }, 3, true]);
  });

  it("budget used up: no call, ModelError, the request is aborted and marked degraded", async () => {
    const { model, seen } = counting();
    const ctl = new AbortController();
    const ev: RunEvents = { calls: 0, degraded: false };
    const g = guardedModel(model, dailyBudget(0, clock().now), ctl, ev);
    await assert.rejects(g.call("s", "u", {}), ModelError);
    assert.deepEqual([seen.length, ctl.signal.reason, ev.degraded], [0, BUDGET_USED_UP, true]);
  });

  it("an aborted request makes no call and spends no budget", async () => {
    const { model, seen } = counting();
    const ctl = new AbortController();
    ctl.abort("request deadline passed");
    const b = dailyBudget(5, clock().now);
    await assert.rejects(guardedModel(model, b, ctl, { calls: 0, degraded: false }).call("s", "u", {}), /deadline/);
    assert.deepEqual([seen.length, b.remaining()], [0, 5]);
  });

  it("a failed call still counts against the budget and marks the run degraded", async () => {
    const ev: RunEvents = { calls: 0, degraded: false };
    const b = dailyBudget(5, clock().now);
    const bad: Model = { call: async () => { throw new ModelError("APIError: overloaded"); } };
    await assert.rejects(guardedModel(bad, b, new AbortController(), ev).call("s", "u", {}), ModelError);
    assert.deepEqual([ev, b.remaining()], [{ calls: 1, degraded: true }, 4]);
  });
});

describe("modelBreaker", () => {
  const KEY = { kind: "unavailable", reason: "model billing unavailable" } as const;

  it("closed until tripped; open for the default cooldown; closed again after it", () => {
    const c = clock();
    const b = modelBreaker(1000, c.now);
    assert.equal(b.openReason(), null);
    b.trip(KEY);
    c.t += 999;
    assert.equal(b.openReason(), "model billing unavailable");
    c.t += 1;
    assert.equal(b.openReason(), null);
  });

  it("retry-after wins over the default cooldown, shorter or longer", () => {
    const c = clock();
    const b = modelBreaker(1000, c.now);
    b.trip({ ...KEY, retryAfterMs: 5000 });
    c.t += 4999;
    assert.notEqual(b.openReason(), null);
    c.t += 1;
    assert.equal(b.openReason(), null);
    b.trip({ ...KEY, retryAfterMs: 10 });
    c.t += 10;
    assert.equal(b.openReason(), null);
  });

  it("close() closes at once and logs the recovery only when it had been tripped", () => {
    const c = clock();
    const logs: string[] = [];
    const b = modelBreaker(60_000, c.now, (l) => logs.push(l));
    b.close();
    b.trip(KEY);
    b.close();
    assert.deepEqual([b.openReason(), logs], [null, [
      "model unavailable (model billing unavailable); serving Tier 2 without model calls for 60s",
      "model calls succeeding again",
    ]]);
  });
});

describe("guardedModel and the breaker", () => {
  const failing = (cause: unknown): Model & { n: number } => ({
    n: 0,
    async call() {
      this.n += 1;
      throw new ModelError("API failure", { cause });
    },
  });
  const run = async (model: Model, b: ReturnType<typeof modelBreaker>) => {
    const ctl = new AbortController();
    const ev: RunEvents = { calls: 0, degraded: false };
    await guardedModel(model, dailyBudget(5, clock().now), ctl, ev, b).call("s", "u", {}).catch(() => {});
    return { reason: ctl.signal.reason as unknown, ev };
  };

  it("an unavailable key aborts the request with the reason and trips the breaker", async () => {
    const b = modelBreaker(1000, clock().now);
    const out = await run(failing({ status: 401 }), b);
    assert.deepEqual([out.reason, out.ev, b.openReason()],
      ["model credentials or access unavailable", { calls: 1, degraded: true }, "model credentials or access unavailable"]);
  });

  it("a transient failure aborts this request only: the breaker stays closed", async () => {
    const b = modelBreaker(1000, clock().now);
    const out = await run(failing({ status: 529 }), b);
    assert.deepEqual([out.reason, b.openReason()], ["model service unavailable", null]);
  });

  it("a rejected request aborts as a bug-type reason, breaker closed", async () => {
    const b = modelBreaker(1000, clock().now);
    const out = await run(failing({ status: 400 }), b);
    assert.deepEqual([out.reason, b.openReason()], ["model request rejected (400)", null]);
  });

  it("an output error (no API status) neither aborts nor trips: the loop may retry", async () => {
    const b = modelBreaker(1000, clock().now);
    const out = await run(failing(new SyntaxError("bad json")), b);
    assert.deepEqual([out.reason, b.openReason()], [undefined, null]);
  });

  it("a successful call closes an open breaker", async () => {
    const b = modelBreaker(60_000, clock().now);
    b.trip({ kind: "unavailable", reason: "x" });
    const ok: Model = { call: async () => [{}, { input_tokens: 1, output_tokens: 1 }] };
    await run(ok, b);
    assert.equal(b.openReason(), null);
  });
});

describe("clientKey", () => {
  it("keeps IPv4, unwraps IPv4-mapped IPv6, groups IPv6 by /64", () => {
    assert.equal(clientKey("203.0.113.9"), "203.0.113.9");
    assert.equal(clientKey("::ffff:203.0.113.9"), "203.0.113.9");
    assert.equal(clientKey("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64");
    assert.equal(clientKey("2001:db8:1:2:bbbb:cccc:dddd:eeee"), "2001:db8:1:2::/64");
    assert.equal(clientKey("2001:db8::1"), "2001:db8:0:0::/64");
    assert.equal(clientKey("::1"), "0:0:0:0::/64");
    assert.equal(clientKey("fe80::1%en0"), "fe80:0:0:0::/64");
    assert.equal(clientKey(undefined), "unknown");
  });
});
