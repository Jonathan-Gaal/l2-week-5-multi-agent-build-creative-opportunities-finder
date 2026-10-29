"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Login and Sign up in the top bar, tied to Jon's Firebase sign-in (src/lib/auth-context.tsx):
 *   signed out        -> Login, Sign up
 *   demo / guest      -> a "Demo mode" tag, Login, Sign up (the demo gates nothing, so signing in is optional)
 *   signed in (email) -> the email and a Sign out button
 *   loading           -> an empty slot, so the bar does not jump or flash "Login" before Firebase settles
 */
export default function AuthButtons() {
  const { status, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (status === "loading") return <div className="auth-slot" />;

  if (status === "signed-in" && !user?.isAnonymous) {
    const out = async () => {
      setSigningOut(true);
      try {
        await signOut();
      } catch {
        setSigningOut(false); // let them try again
      }
    };
    return (
      <div className="auth-slot">
        {user?.email && (
          <span className="auth-email" title={user.email}>
            {user.email}
          </span>
        )}
        <button type="button" className="btn btn-ghost btn-small" onClick={out} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    );
  }

  const demo = status === "guest" || status === "signed-in"; // signed-in here means an anonymous (demo) session
  return (
    <div className="auth-slot">
      {demo && (
        <span className="pill pill-lime" aria-label="You are in demo mode">
          Demo mode
        </span>
      )}
      <Link href="/login" className="btn btn-ghost btn-small">
        Login
      </Link>
      <Link href="/signup" className="btn btn-small">
        Sign up
      </Link>
    </div>
  );
}
