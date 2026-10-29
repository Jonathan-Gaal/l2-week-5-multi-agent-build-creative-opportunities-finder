"use client";

/**
 * Header account widget. Mirrors the convention of account controls top-right [Jakob]. One state at a time:
 *   loading              -> nothing (avoids a flash of "Sign in" before Firebase settles)
 *   signed-in (email)    -> the account email + a Sign out button
 *   demo (see below)     -> a "Demo mode" badge + a Sign in link to upgrade (the demo gates nothing)
 *   signed-out           -> a Sign in link
 * "Demo mode" covers both ways into the demo and renders identically for them, so the user can't tell
 * which path they got (the point of the graceful fallback): a real Firebase anonymous session
 * (status "signed-in" with isAnonymous — no email to show) and the client-side guest fallback (status
 * "guest"). Sign out is a real <button> (it acts), Sign in is an <a> (it navigates). [Jakob/a11y]
 */

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function AuthWidget() {
  const { status, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (status === "loading") return null;

  // A real, non-anonymous signed-in account: show the email + a Sign out button.
  if (status === "signed-in" && !user?.isAnonymous) {
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

  // Demo mode: a real anonymous Firebase session (signed-in + isAnonymous, no email) or the guest fallback.
  // Both render identically — a "Demo mode" badge + a Sign in link to upgrade (signing in is optional).
  if (status === "guest" || status === "signed-in") {
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
