"use client";

/**
 * Shared "enter the demo, then go to /find" button. The enter-demo logic lives once in auth-context's
 * startDemo (real Firebase anonymous sign-in, with a guest fallback that never breaks); this stays a thin
 * wrapper that calls it and routes. Reused verbatim by both the login card and the landing hero — one copy
 * of the logic, not two. [DRY] A local pending flag disables the button during the async sign-in so a
 * double-click can't fire two sign-ins. [Doherty]
 */

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

type DemoButtonProps = {
  /** Button copy. Defaults to the login card's existing wording so that call site is unchanged. */
  label?: string;
  /** Extra classes appended after the base `btn` (e.g. "btn-ghost", "auth-demo"). */
  className?: string;
  /** Disable from a parent flow (the login card passes its submitting state). */
  disabled?: boolean;
  /** Use `className` as the whole style instead of adding it to the base `btn` (the redesigned login page styles it itself). */
  plain?: boolean;
};

export default function DemoButton({ label = "Explore the demo →", className, disabled = false, plain = false }: DemoButtonProps) {
  const router = useRouter();
  const { startDemo } = useAuth();
  const [pending, setPending] = useState(false);
  const pathname = usePathname();

  // Next keeps the page you leave in memory, so without this the button would still be "pending" (greyed out) when you come back to it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the in-flight flag whenever this page is shown again
    setPending(false);
  }, [pathname]);

  async function handleDemo() {
    setPending(true);
    // startDemo never rejects: it runs the real anonymous sign-in and falls back to guest on any failure.
    await startDemo();
    router.push("/find");
  }

  return (
    <button
      type="button"
      className={plain ? className : className ? `btn ${className}` : "btn"}
      onClick={handleDemo}
      disabled={disabled || pending}
    >
      {label}
    </button>
  );
}
