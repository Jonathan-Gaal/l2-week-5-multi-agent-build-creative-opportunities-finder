"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

type SavedRun = { name: string; savedAt: string; href: string; top: string[] };

/**
 * The "Demo mode" tag. Double-click it to open a drop-down of the saved runs (searches answered once with Claude Code acting as
 * the Ranker and Reviewer); picking one plays that run through the find flow and on to its results. There is nothing to open on
 * the live site, where no run is saved. On the pages where the tag is a link to Login, a single click still goes there, after
 * a moment, so a double-click can tell itself apart.
 */
function DemoBadge({ link }: { link: boolean }) {
  const router = useRouter();
  const [runs, setRuns] = useState<SavedRun[] | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const toggle = async () => {
    window.clearTimeout(timer.current);
    if (open) return setOpen(false);
    let list = runs;
    if (!list) {
      try {
        list = (await (await fetch("/api/demo-runs")).json()) as SavedRun[];
      } catch {
        list = [];
      }
      setRuns(list);
    }
    if (list.length) setOpen(true);
  };
  return (
    <span className="demo-wrap" ref={box} onDoubleClick={toggle}>
      {link ? (
        <Link
          href="/login"
          className="demo-user"
          aria-label="You are in demo mode. Log in or sign up"
          onClick={(e) => {
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => router.push("/login"), 300);
          }}
        >
          <span className="pill pill-lime">Demo mode</span>
        </Link>
      ) : (
        <span className="pill pill-lime" aria-label="You are in demo mode">
          Demo mode
        </span>
      )}
      {open && runs && (
        <ul className="demo-runs" aria-label="Saved runs to replay">
          <li className="demo-runs-head">Replay a saved run</li>
          {runs.map((r) => (
            <li key={r.href}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);     // the list goes away and the replay starts
                  router.push(r.href);
                }}
              >
                <strong>{r.name}</strong>
                <span>{r.top.join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/**
 * Login and Sign up in the top bar, tied to Jon's Firebase sign-in (src/lib/auth-context.tsx):
 *   signed out        -> Login, Sign up
 *   demo / guest      -> a "Demo mode" tag (on the results page: the tag, Login and Sign up), as if signed in (a link to Login, so a demo visitor can still make an account)
 *   signed in (email) -> the email and a Sign out button
 *   loading           -> an empty slot, so the bar does not jump or flash "Login" before Firebase settles
 */
export default function AuthButtons() {
  const { status, user, signOut } = useAuth();
  const pathname = usePathname();
  const onResults = pathname.startsWith("/results"); // the results page shows Login and Sign up (after the Demo mode tag, in demo mode)
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
  if (demo && !onResults) {
    return (
      <div className="auth-slot">
        <DemoBadge link />
      </div>
    );
  }
  return (
    <div className="auth-slot">
      {demo && <DemoBadge link={false} />}
      <Link href="/login" className="btn btn-ghost btn-small" aria-current={pathname === "/login" ? "page" : undefined}>
        Login
      </Link>
      <Link href="/signup" className="btn btn-small" aria-current={pathname === "/signup" ? "page" : undefined}>
        Sign up
      </Link>
    </div>
  );
}
