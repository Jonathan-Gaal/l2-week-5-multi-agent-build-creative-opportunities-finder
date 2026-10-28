import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type Model, ModelError } from "../agents/model.ts";
import {
  BUDGET_USED_UP, type RunEvents, clientKey, concurrencyGate, dailyBudget, guardedModel, lruCache, rateLimiter,
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
    assert.deepEqual(rl.take("c"), { ok: false, retryAfterSec: 60 });
    assert.equal(rl.take("a").ok, true);               // existing keys still work
    c.t += 60_000;
    assert.equal(rl.take("c").ok, true);               // expired windows swept
    assert.equal(rl.size(), 1);
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
