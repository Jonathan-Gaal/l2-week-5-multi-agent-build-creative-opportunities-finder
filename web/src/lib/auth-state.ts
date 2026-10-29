/**
 * Pure auth state machine, split out of auth-context.tsx so it can be unit-tested with node:test
 * (which strips types from .ts, but we keep the reducer free of React/JSX so the test never touches
 * the SDK or the DOM). auth-context.tsx imports nextAuthState + the types from here and only adds
 * the React wiring (onAuthStateChanged -> dispatch) and the Firebase calls around it.
 *
 * `enabled` records whether Firebase web config was present at init (see firebase.ts). It never
 * changes after init; the reducer carries it through every transition unchanged so the UI can keep
 * offering/﻿withholding the real sign-in methods regardless of which auth state we're in.
 */

/**
 * The minimal slice of a Firebase user we surface to the UI. `email` can be null (e.g. some providers,
 * and always for the anonymous demo user). `isAnonymous` is true for a Firebase Anonymous Auth session —
 * the real-sign-in path of the demo — so the UI shows "Demo mode" instead of an empty email. It rides the
 * same `firebase-user` event through the reducer, so no extra transition is needed to carry it.
 */
export type AuthUser = { email: string | null; uid: string; isAnonymous: boolean };

export type AuthStatus = "loading" | "signed-out" | "guest" | "signed-in";

export type AuthState = { status: AuthStatus; user: AuthUser | null; enabled: boolean };

export type AuthEvent =
  | { type: "firebase-user"; user: AuthUser | null }
  | { type: "enter-demo" }
  | { type: "exit-demo" }
  | { type: "loading-done" };

/** Start in `loading` until either onAuthStateChanged fires (enabled) or loading-done settles it (disabled). */
export function initialAuthState(enabled: boolean): AuthState {
  return { status: "loading", user: null, enabled };
}

export function nextAuthState(prev: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    // Firebase is the source of truth for real auth: a user means signed-in, null means signed-out.
    // signOut(auth) triggers onAuthStateChanged(null), so logout flows through here too.
    case "firebase-user":
      return event.user
        ? { status: "signed-in", user: event.user, enabled: prev.enabled }
        : { status: "signed-out", user: null, enabled: prev.enabled };
    // The demo bypass: full parity with signed-in, no credentials. Always reachable, even when disabled.
    case "enter-demo":
      return { status: "guest", user: null, enabled: prev.enabled };
    case "exit-demo":
      return { status: "signed-out", user: null, enabled: prev.enabled };
    // Only settles the initial wait (when Firebase is disabled and will never fire). A no-op otherwise,
    // so a late loading-done can't knock a signed-in user or a guest back to signed-out.
    case "loading-done":
      return prev.status === "loading" ? { status: "signed-out", user: null, enabled: prev.enabled } : prev;
  }
}
