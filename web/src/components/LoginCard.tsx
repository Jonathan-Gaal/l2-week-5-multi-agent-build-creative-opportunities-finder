"use client";

/**
 * The auth card. Real sign-in (create account / sign in / Google) when Firebase is configured, plus an equally
 * prominent demo bypass. The demo gates nothing, so it stays a first-class path, not a fallback: it sits under a
 * clear "or" divider and is given the same weight as the form submit. [laws-of-ux: primary task over one-CTA]
 *
 * When Firebase is unconfigured the credential form is withheld (it could only fail) and a muted note points at
 * the demo, which still works. Errors are shown inline next to the form in plain language, never blaming the
 * user. [Postel] Submit buttons show a loading state. After any successful sign-in we route to /find.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { firebaseEnabled } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

type Mode = "signin" | "signup";

/** Map Firebase auth error codes to plain, actionable copy; fall back to the message, then a generic line. */
function friendlyError(err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
  switch (code) {
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/email-already-in-use":
      return "An account with that email already exists — try signing in instead.";
    case "auth/weak-password":
      return "Choose a password of at least 6 characters.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    default:
      return err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.";
  }
}

export default function LoginCard() {
  const router = useRouter();
  const { signUpEmail, signInEmail, signInGoogle, enterDemo } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "credentials" | "google">(null);

  const submitting = busy !== null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy("credentials");
    try {
      if (mode === "signup") await signUpEmail(email, password);
      else await signInEmail(email, password);
      router.push("/find");
    } catch (err) {
      setError(friendlyError(err));
      setBusy(null);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy("google");
    try {
      await signInGoogle();
      router.push("/find");
    } catch (err) {
      setError(friendlyError(err));
      setBusy(null);
    }
  }

  function handleDemo() {
    enterDemo();
    router.push("/find");
  }

  return (
    <div className="auth-card panel">
      <span className="eyebrow">Artist Atlas</span>
      <h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
      <p className="muted-dk auth-intro">
        This sign-in is a demo — your account unlocks nothing the demo doesn&apos;t. It&apos;s here to show the flow works.
      </p>

      {firebaseEnabled ? (
        <>
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                className="auth-input"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn auth-submit" disabled={submitting}>
              {busy === "credentials"
                ? mode === "signup"
                  ? "Creating account…"
                  : "Signing in…"
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <button type="button" className="btn btn-ghost auth-google" onClick={handleGoogle} disabled={submitting}>
            {busy === "google" ? "Connecting…" : "Continue with Google"}
          </button>

          <p className="auth-toggle">
            {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError(null);
              }}
              disabled={submitting}
            >
              {mode === "signup" ? "Sign in" : "Create an account"}
            </button>
          </p>
        </>
      ) : (
        <p className="auth-note muted-dk">Sign-in isn&apos;t configured in this environment — jump into the demo.</p>
      )}

      <div className="auth-divider" role="separator" aria-label="or">
        <span>or</span>
      </div>

      <button type="button" className="btn auth-demo" onClick={handleDemo} disabled={submitting}>
        Explore the demo →
      </button>
    </div>
  );
}
