"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * "Find opportunities". A visitor who is not in yet (no demo, no account) is taken to Login, where "Explore the demo"
 * leads on to the first find step. Anyone already in demo mode or signed in goes straight to the find flow. The link
 * keeps href="/find" so the home page button looks (globals.css) and a new-tab click still work.
 */
export default function FindLink(props: Omit<ComponentProps<typeof Link>, "href">) {
  const router = useRouter();
  const { status } = useAuth();
  return (
    <Link
      {...props}
      href="/find"
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (status === "signed-out") {
          e.preventDefault();
          router.push("/login");
        }
      }}
    />
  );
}
