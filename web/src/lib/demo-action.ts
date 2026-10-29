/**
 * Pure decision + effect runner for "enter the demo", split out of auth-context.tsx (which holds the
 * React/SDK wiring) so it's unit-testable with node:test without ever loading Firebase or touching the DOM
 * — the same split that keeps auth-state.ts pure. Both effects are injected, and it is generic over the
 * auth handle type so the test can pass a stub while auth-context passes a real Firebase `Auth`; this file
 * imports nothing from the SDK.
 *
 * Decision:
 *  - A live auth handle present -> run the real Firebase anonymous sign-in. The AuthProvider's
 *    onAuthStateChanged subscription then drives the signed-in state, so we deliberately do NOT also set
 *    guest here (that would double-fire and could flip a real session to guest).
 *  - No auth handle (Firebase disabled or not in a browser) OR the sign-in rejects (offline, provider off,
 *    quota) -> fall back to the client-side guest state, so the demo never breaks. [graceful degradation]
 */

export type DemoSignInDeps<A> = {
  /** getFirebaseAuth() result: a live auth handle, or null when Firebase is disabled / not in a browser. */
  auth: A | null;
  /** firebase/auth's signInAnonymously, injected so this module and its test never load the SDK. */
  signInAnonymously: (auth: A) => Promise<unknown>;
  /** Set the client-side guest state (dispatch enter-demo). The always-available fallback. */
  enterGuest: () => void;
};

export async function runDemoSignIn<A>({ auth, signInAnonymously, enterGuest }: DemoSignInDeps<A>): Promise<void> {
  if (auth) {
    try {
      await signInAnonymously(auth);
      return;
    } catch {
      // Real sign-in failed; fall through to the guest fallback below so the demo still works.
    }
  }
  enterGuest();
}
