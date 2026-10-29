"use client";

/**
 * Login and Sign up (Jon's Firebase sign-in, on the find flow's board layout). Real sign-in (create account / sign in /
 * Google) when Firebase is configured, plus an equally prominent demo button, because the demo gates nothing and stays a
 * first-class path. When Firebase is unconfigured the form is withheld (it could only fail) and a note points at the demo.
 * Errors are shown next to the form in plain language. After any successful sign-in we go on to /find.
 * `mode` picks the page: /login is "signin", /signup is "signup"; the link under the form switches between them.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import DemoButton from "@/components/DemoButton";
import { useAuth } from "@/lib/auth-context";
import { firebaseEnabled } from "@/lib/firebase";
import f from "./find/FindFlow.module.css";
import a from "./Auth.module.css";

export type AuthMode = "signin" | "signup";

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
      return "An account with that email already exists. Try logging in instead.";
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

export default function LoginCard({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { signUpEmail, signInEmail, signInGoogle } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "credentials" | "google">(null);
  const submitting = busy !== null;
  const signup = mode === "signup";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy("credentials");
    try {
      if (signup) await signUpEmail(email, password);
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

  return (
    <div className={f.frame}>
      <div className={f.board}>
        <div className={f.left}>
          <h1 className={f.title}>{signup ? "Create your account" : "Welcome back"}</h1>
          <p className={f.sub}>
            {signup ? "Save your search and come back to it." : "Log in to pick up where you left off."} This sign-in is a demo: an
            account unlocks nothing the demo doesn&apos;t. It&apos;s here to show the flow works.
          </p>
          <div className={f.bottom}>
            <DemoButton plain className={f.cta} label="Explore the demo →" disabled={submitting} />
            <p className={a.demoNote}>No account needed. You get everything an account would.</p>
          </div>
        </div>

        <div className={f.panel}>
          <h2 className={a.title2}>{signup ? "Sign up" : "Login"}</h2>
          {firebaseEnabled ? (
            <>
              <form onSubmit={handleSubmit} noValidate>
                <div className={a.field}>
                  <label htmlFor="auth-email">Email</label>
                  <input id="auth-email" className={a.input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
                </div>
                <div className={a.field}>
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    className={a.input}
                    type="password"
                    autoComplete={signup ? "new-password" : "current-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                {error && (
                  <p className={a.error} role="alert">
                    {error}
                  </p>
                )}
                <button type="submit" className={a.submit} disabled={submitting}>
                  {busy === "credentials" ? (signup ? "Creating account…" : "Logging in…") : signup ? "Create account" : "Login"}
                </button>
              </form>
              <button type="button" className={a.google} onClick={handleGoogle} disabled={submitting}>
                {busy === "google" ? "Connecting…" : "Continue with Google"}
              </button>
              <p className={a.switch}>
                {signup ? "Already have an account?" : "New here?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "Login" : "Sign up"}</Link>
              </p>
            </>
          ) : (
            <p className={a.note}>Sign-in isn&apos;t set up in this environment yet, so use the demo button on the left.</p>
          )}
        </div>
      </div>
    </div>
  );
}
