// readFirebaseConfig is the contract with the environment: it decides whether real sign-in is offered at all
// (firebaseEnabled). Tier 1 — a wrong "present" verdict would ship a form that can only fail; a wrong "missing"
// verdict would hide a working login. Known-answer assertions on the exact object, and null for each missing
// required key. Tests only the pure helper — the SDK is never initialized here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readFirebaseConfig } from "./firebase.ts";

const FULL = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIza-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "atlas.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "atlas",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:2:web:3",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "99",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "atlas.appspot.com",
};

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

describe("readFirebaseConfig", () => {
  it("maps a complete env to the exact config object, optional keys included", () => {
    assert.deepEqual(readFirebaseConfig(FULL), {
      apiKey: "AIza-key",
      authDomain: "atlas.firebaseapp.com",
      projectId: "atlas",
      appId: "1:2:web:3",
      messagingSenderId: "99",
      storageBucket: "atlas.appspot.com",
    });
  });

  it("omits optional keys (not present as undefined) when they're absent", () => {
    const { NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, ...required } = FULL;
    void NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
    void NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    assert.deepEqual(readFirebaseConfig(required), {
      apiKey: "AIza-key",
      authDomain: "atlas.firebaseapp.com",
      projectId: "atlas",
      appId: "1:2:web:3",
    });
  });

  for (const key of REQUIRED_KEYS) {
    it(`returns null when required key ${key} is missing`, () => {
      assert.equal(readFirebaseConfig({ ...FULL, [key]: undefined }), null);
    });
    it(`returns null when required key ${key} is empty string`, () => {
      assert.equal(readFirebaseConfig({ ...FULL, [key]: "" }), null);
    });
  }

  it("returns null for an entirely empty env", () => {
    assert.equal(readFirebaseConfig({}), null);
  });
});
