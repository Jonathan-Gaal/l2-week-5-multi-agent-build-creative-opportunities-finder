// The demo entry is auth (Tier 1): it decides between a real Firebase anonymous sign-in and the guest
// fallback, and the fallback is what keeps the demo from ever breaking. These known-answer tests pin that
// decision by injecting stub effects (no SDK, no DOM) and asserting exactly which effect ran.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runDemoSignIn } from "./demo-action.ts";

/** A stub auth handle (runDemoSignIn is generic over the handle type, so any truthy object stands in). */
const LIVE_AUTH = { kind: "stub-auth" };

describe("runDemoSignIn", () => {
  it("Firebase enabled (live auth) -> calls signInAnonymously with that auth and does NOT set guest", async () => {
    const signInArgs: unknown[] = [];
    let guestSet = false;
    await runDemoSignIn({
      auth: LIVE_AUTH,
      signInAnonymously: async (a) => {
        signInArgs.push(a);
        return { user: { isAnonymous: true } };
      },
      enterGuest: () => {
        guestSet = true;
      },
    });
    assert.equal(signInArgs.length, 1);
    assert.equal(signInArgs[0], LIVE_AUTH); // signed in against the real auth handle
    assert.equal(guestSet, false); // onAuthStateChanged drives signed-in; we must not also set guest
  });

  it("Firebase disabled (auth is null) -> sets guest and never calls signInAnonymously", async () => {
    let signInCalls = 0;
    let guestSet = false;
    await runDemoSignIn({
      auth: null,
      signInAnonymously: async () => {
        signInCalls += 1;
        return {};
      },
      enterGuest: () => {
        guestSet = true;
      },
    });
    assert.equal(signInCalls, 0);
    assert.equal(guestSet, true);
  });

  it("signInAnonymously rejects -> falls back to guest so the demo never breaks", async () => {
    let guestSet = false;
    await runDemoSignIn({
      auth: LIVE_AUTH,
      signInAnonymously: async () => {
        throw new Error("auth/operation-not-allowed");
      },
      enterGuest: () => {
        guestSet = true;
      },
    });
    assert.equal(guestSet, true);
  });
});
