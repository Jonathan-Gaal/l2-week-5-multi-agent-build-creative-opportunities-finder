"use client";

/**
 * React wiring around the pure state machine in auth-state.ts. The AuthProvider subscribes to Firebase's
 * onAuthStateChanged and dispatches into nextAuthState; useAuth() exposes the current state plus the action
 * methods. Real sign-in only works when Firebase is configured (firebaseEnabled); startDemo always works —
 * a real Firebase anonymous sign-in when enabled, a client-side guest fallback otherwise — and grants full
 * parity with the signed-in state (this is a demonstrative login that gates nothing exclusive).
 */

import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { firebaseEnabled, getFirebaseAuth } from "./firebase";
import { type AuthState, initialAuthState, nextAuthState } from "./auth-state";
import { runDemoSignIn } from "./demo-action";

const NOT_CONFIGURED = "Sign-in isn't configured in this environment";

type AuthActions = {
  signUpEmail: (email: string, password: string) => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Enter the demo: a real Firebase anonymous sign-in when Firebase is enabled, falling back to the
   * client-side guest state when it's disabled or the sign-in fails. Never rejects. See demo-action.ts.
   */
  startDemo: () => Promise<void>;
  exitDemo: () => void;
};

type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(nextAuthState, firebaseEnabled, initialAuthState);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      // No Firebase in this environment: leave loading for signed-out so the UI settles.
      dispatch({ type: "loading-done" });
      return;
    }
    // Fires immediately with the current user (or null), then on every sign-in/out/token refresh.
    return onAuthStateChanged(auth, (fbUser) => {
      dispatch({
        type: "firebase-user",
        user: fbUser ? { email: fbUser.email, uid: fbUser.uid, isAnonymous: fbUser.isAnonymous } : null,
      });
    });
  }, []);

  // Real sign-in requires a live Auth instance; reject with a friendly message when it's absent.
  const requireAuth = () => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error(NOT_CONFIGURED);
    return auth;
  };

  const value: AuthContextValue = {
    ...state,
    signUpEmail: async (email, password) => {
      await createUserWithEmailAndPassword(requireAuth(), email, password);
    },
    signInEmail: async (email, password) => {
      await signInWithEmailAndPassword(requireAuth(), email, password);
    },
    signInGoogle: async () => {
      await signInWithPopup(requireAuth(), new GoogleAuthProvider());
    },
    // signOut(auth) invalidates the refresh token server-side; onAuthStateChanged then drives us to signed-out.
    signOut: async () => {
      await firebaseSignOut(requireAuth());
    },
    // Real anonymous sign-in when possible, guest fallback otherwise. The decision + fallback logic is the
    // pure runDemoSignIn; here we just hand it the live SDK boundary and the guest dispatch.
    startDemo: () =>
      runDemoSignIn({
        auth: getFirebaseAuth(),
        signInAnonymously,
        enterGuest: () => dispatch({ type: "enter-demo" }),
      }),
    exitDemo: () => dispatch({ type: "exit-demo" }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
