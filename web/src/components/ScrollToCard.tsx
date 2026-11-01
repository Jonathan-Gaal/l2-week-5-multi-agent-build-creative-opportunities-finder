"use client";

import { useEffect } from "react";

/**
 * A link from a map pin ends in #card-<listing>. The browser's own jump to it can fire before the card is on the page,
 * so once the page is up this scrolls to the card and flashes it.
 */
export default function ScrollToCard() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id.startsWith("card-")) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      el.classList.add("rcard-flash");
      window.setTimeout(() => el.classList.remove("rcard-flash"), 3100);
    }, 400);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
