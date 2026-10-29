// The auth state machine is the whole correctness story of this feature (a demonstrative login, but a real one):
// every status the UI shows comes from these transitions. Tier 1 — known-answer assertions on the exact resulting
// status/user, one per event, plus the enabled flag carried through and the loading-done no-op guard.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type AuthState, type AuthUser, initialAuthState, nextAuthState } from "./auth-state.ts";

const USER: AuthUser = { email: "artist@example.com", uid: "uid-123" };
const loading = (enabled = true): AuthState => initialAuthState(enabled);

describe("initialAuthState", () => {
  it("starts in loading with no user, carrying the enabled flag", () => {
    assert.deepEqual(initialAuthState(true), { status: "loading", user: null, enabled: true });
    assert.deepEqual(initialAuthState(false), { status: "loading", user: null, enabled: false });
  });
});

describe("nextAuthState", () => {
  it("firebase-user with a user -> signed-in carrying that exact user", () => {
    const next = nextAuthState(loading(), { type: "firebase-user", user: USER });
    assert.deepEqual(next, { status: "signed-in", user: USER, enabled: true });
  });

  it("firebase-user with null -> signed-out and clears the user", () => {
    const signedIn: AuthState = { status: "signed-in", user: USER, enabled: true };
    const next = nextAuthState(signedIn, { type: "firebase-user", user: null });
    assert.deepEqual(next, { status: "signed-out", user: null, enabled: true });
  });

  it("enter-demo -> guest with no user", () => {
    const next = nextAuthState({ status: "signed-out", user: null, enabled: true }, { type: "enter-demo" });
    assert.deepEqual(next, { status: "guest", user: null, enabled: true });
  });

  it("exit-demo from guest -> signed-out", () => {
    const guest: AuthState = { status: "guest", user: null, enabled: true };
    const next = nextAuthState(guest, { type: "exit-demo" });
    assert.deepEqual(next, { status: "signed-out", user: null, enabled: true });
  });

  it("loading-done from loading -> signed-out (settles when Firebase will never fire)", () => {
    const next = nextAuthState(loading(false), { type: "loading-done" });
    assert.deepEqual(next, { status: "signed-out", user: null, enabled: false });
  });

  it("loading-done is a no-op once past loading (can't knock a guest back to signed-out)", () => {
    const guest: AuthState = { status: "guest", user: null, enabled: true };
    assert.deepEqual(nextAuthState(guest, { type: "loading-done" }), guest);
    const signedIn: AuthState = { status: "signed-in", user: USER, enabled: true };
    assert.deepEqual(nextAuthState(signedIn, { type: "loading-done" }), signedIn);
  });

  it("honors the enabled flag unchanged through every transition", () => {
    // enabled is set once at init and must survive every event; a disabled app still transitions normally.
    assert.equal(nextAuthState(loading(false), { type: "firebase-user", user: USER }).enabled, false);
    assert.equal(nextAuthState(loading(false), { type: "firebase-user", user: null }).enabled, false);
    assert.equal(nextAuthState(loading(false), { type: "enter-demo" }).enabled, false);
    assert.equal(nextAuthState(loading(true), { type: "enter-demo" }).enabled, true);
  });
});
