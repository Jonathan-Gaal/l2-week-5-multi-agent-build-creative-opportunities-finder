"use client";

/**
 * Client boundary for app-wide context providers, rendered inside the server layout.tsx so the whole tree
 * (Header, main, footer) can read auth via useAuth(). Keeping this thin wrapper here lets layout.tsx stay a
 * server component.
 */

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";

export default function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
