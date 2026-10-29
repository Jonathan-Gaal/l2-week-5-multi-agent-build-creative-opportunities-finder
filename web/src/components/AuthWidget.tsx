"use client";

/**
 * Header account widget. Mirrors the convention of account controls top-right [Jakob]. One state at a time:
 *   loading   -> nothing (avoids a flash of "Sign in" before Firebase settles)
 *   signed-in -> the account email + a Sign out button
 *   guest     -> a "Demo mode" badge + a Sign in link (the demo gates nothing, so signing in is optional)
 *   signed-out-> a Sign in link
 * Sign out is a real <button> (it acts), Sign in is an <a> (it navigates) — never a div-with-handler. [Jakob/a11y]
 */

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function AuthWidget() {
  const { status, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (status === "loading") return null;

  if (status === "signed-in") {
    const handleSignOut = async () => {
      setSigningOut(true);
      try {
        await signOut();
      } catch {
        // signOut should not fail when signed-in; re-enable the button so the user can retry.
        setSigningOut(false);
      }
    };
    return (
      <span className="auth-widget">
        {user?.email && (
          <span className="auth-email" title={user.email}>
            {user.email}
          </span>
        )}
        <button type="button" className="btn btn-ghost btn-small" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </span>
    );
  }

  if (status === "guest") {
    return (
      <span className="auth-widget">
        <span className="pill pill-lime" aria-label="You are in demo mode">
          Demo mode
        </span>
        <Link href="/login">Sign in</Link>
      </span>
    );
  }

  // signed-out
  return <Link href="/login">Sign in</Link>;
}
