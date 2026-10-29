import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MIN_SECRET_LENGTH, SHARED_NETWORK, VISITOR_COOKIE, mintVisitorCookie, readCookie, resetVisitorWarning,
  verifyVisitorCookie, visitorClient, visitorCookieOptions, visitorSecret, withCookie,
} from "./visitor.ts";

const SECRET = "s".repeat(MIN_SECRET_LENGTH);
const OTHER = "o".repeat(MIN_SECRET_LENGTH);
const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);

describe("visitor cookie sign/verify", () => {
  it("round trips: a minted value verifies to its id; ids are fresh each time", () => {
    const a = mintVisitorCookie(SECRET);
    const b = mintVisitorCookie(SECRET);
    assert.equal(verifyVisitorCookie(a.value, SECRET), a.id);
    assert.match(a.value, /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a.id, b.id);
  });

  it("rejects a tampered id, a tampered signature (any position, incl. the last char) and another secret", () => {
    const { value } = mintVisitorCookie(SECRET);
    const dot = value.indexOf(".");
    assert.equal(verifyVisitorCookie(flip(value, 0), SECRET), null);
    for (const i of [dot + 1, dot + 20, value.length - 1]) assert.equal(verifyVisitorCookie(flip(value, i), SECRET), null);
    assert.equal(verifyVisitorCookie(value, OTHER), null);
    const swapped = `${mintVisitorCookie(SECRET).id}${value.slice(dot)}`;     // another id with this signature
    assert.equal(verifyVisitorCookie(swapped, SECRET), null);
  });

  it("rejects malformed and empty values, and anything without a secret", () => {
    const { value, id } = mintVisitorCookie(SECRET);
    for (const bad of ["", ".", id, `${id}.`, `.${value.split(".")[1]}`, `${value}x`, ` ${value}`, `${value}.x`,
      value.replace(".", ":"), encodeURIComponent(`${id}+/.${value.split(".")[1]}`), undefined, null]) {
      assert.equal(verifyVisitorCookie(bad, SECRET), null, String(bad));
    }
    assert.equal(verifyVisitorCookie(value, null), null);
    assert.equal(verifyVisitorCookie(value, ""), null);
  });
});

describe("visitorSecret", () => {
  it("unset or shorter than the minimum is null, warns once, never throws", () => {
    resetVisitorWarning();
    const warnings: string[] = [];
    const warn = (m: string) => warnings.push(m);
    assert.equal(visitorSecret({}, warn), null);
    assert.equal(visitorSecret({ VISITOR_COOKIE_SECRET: "x".repeat(MIN_SECRET_LENGTH - 1) }, warn), null);
    assert.equal(warnings.length, 1);
    assert.equal(visitorSecret({ VISITOR_COOKIE_SECRET: SECRET }, warn), SECRET);
  });

  it("on Vercel the warning says so loudly and names the fix", () => {
    resetVisitorWarning();
    const warnings: string[] = [];
    visitorSecret({ VERCEL: "1" }, (m) => warnings.push(m));
    assert.match(warnings[0]!, /^WARNING: VISITOR_COOKIE_SECRET is not set.*Vercel/);
  });
});

describe("cookie header helpers", () => {
  it("readCookie finds the first copy by exact name", () => {
    assert.equal(readCookie("a=1; aa_visitor=x.y; aa_visitor=z", VISITOR_COOKIE), "x.y");
    assert.equal(readCookie("xaa_visitor=1; aa_visitorx=2", VISITOR_COOKIE), undefined);
    assert.equal(readCookie(null, VISITOR_COOKIE), undefined);
    assert.equal(readCookie("", VISITOR_COOKIE), undefined);
  });

  it("withCookie puts the new value first and drops every other copy", () => {
    const h = withCookie("aa_visitor=old; theme=dark; aa_visitor=older", VISITOR_COOKIE, "new.sig");
    assert.equal(h, "aa_visitor=new.sig; theme=dark");
    assert.equal(readCookie(h, VISITOR_COOKIE), "new.sig");
    assert.equal(withCookie(null, VISITOR_COOKIE, "v"), "aa_visitor=v");
  });

  it("cookie attributes: HttpOnly, SameSite=Lax, Path=/, 30 days, Secure only when asked", () => {
    assert.deepEqual(visitorCookieOptions(true), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2_592_000 });
    assert.equal(visitorCookieOptions(false).secure, false);
  });
});

describe("visitorClient (rate-limit key selection)", () => {
  const net = "203.0.113.7";

  it("a valid cookie keys by v:<id>, scoped apart from the network key", () => {
    const { id, value } = mintVisitorCookie(SECRET);
    assert.deepEqual(visitorClient(`theme=dark; ${VISITOR_COOKIE}=${value}`, net, SECRET), { key: `v:${id}`, network: net });
  });

  it("missing, forged or other-secret cookies key by the network, exactly as without cookies", () => {
    const { value } = mintVisitorCookie(OTHER);
    for (const header of [null, "", `${VISITOR_COOKIE}=`, `${VISITOR_COOKIE}=forged.value`, `${VISITOR_COOKIE}=${value}`]) {
      assert.deepEqual(visitorClient(header, net, SECRET), { key: net, network: net });
    }
    assert.deepEqual(visitorClient(null, SHARED_NETWORK, SECRET), { key: SHARED_NETWORK, network: SHARED_NETWORK });
  });

  it("no secret: a valid-looking cookie is ignored and the network is the key, no throw", () => {
    const { value } = mintVisitorCookie(SECRET);
    assert.deepEqual(visitorClient(`${VISITOR_COOKIE}=${value}`, net, null), { key: net, network: net });
  });

  it("only the signed cookie names an id: an unsigned id in a cookie of the same name doesn't", () => {
    const { id } = mintVisitorCookie(SECRET);
    assert.deepEqual(visitorClient(`${VISITOR_COOKIE}=${id}`, net, SECRET), { key: net, network: net });
  });
});
