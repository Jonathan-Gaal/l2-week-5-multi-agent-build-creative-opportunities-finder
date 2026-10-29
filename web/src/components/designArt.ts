"use client";

import { useSyncExternalStore } from "react";

/** Dev only: which picture the Graphic section has chosen for the main graphic ("default" = each layout's own). */
export const ART_SRC: Record<string, { src: string; w: number; h: number }> = {
  globe: { src: "/brand/figure-clean.png", w: 800, h: 1218 },
  "globe-nyc": { src: "/brand/figure-nyc.png", w: 800, h: 1042 },
  whole: { src: "/brand/logo-whole.png", w: 800, h: 1203 },
  wordmark: { src: "/brand/wordmark-lg.png", w: 900, h: 492 },
  fade: { src: "/brand/figure-echo.png", w: 900, h: 866 },
};

const EVENT = "design-art";
const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};
export const announceArt = () => window.dispatchEvent(new Event(EVENT));
export const useArt = () => useSyncExternalStore(subscribe, () => document.documentElement.dataset.art ?? "default", () => "default");
