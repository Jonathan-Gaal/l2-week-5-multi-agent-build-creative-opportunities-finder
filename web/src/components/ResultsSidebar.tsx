"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MetaResponse } from "@api/types";
import { chipList, chipText, chipsFor } from "@/lib/disciplineWords";
import { TRI_IDS, WIDE_IDS, placeOn, spellOut } from "@/lib/places";
import { TYPE_PILLS } from "@/lib/typePills";
import type { Choice } from "./find/FindStep";
import r from "./ResultsLive.module.css";
import DemoReplays from "./DemoReplays";

const WIGGLE_MS = 700;

/**
 * Your answers, set in place. Every chip is shown, with the ones you picked outlined in colour. They cannot be changed
 * here, because a change means ranking the results again: tapping one makes Start over wiggle, which is the way to
 * change them (it goes back through the three steps with your picks kept).
 */
export default function ResultsSidebar({ meta, initial, startOverHref }: { meta: MetaResponse; initial: Choice; startOverHref: string }) {
  const picked = { ...initial, p: spellOut(initial.p) };
  const keys = initial.d.flatMap((id) => chipsFor(id).map((x) => x.key));
  const [wiggle, setWiggle] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const nudge = () => {
    window.clearTimeout(timer.current);
    setWiggle(false);
    // Restart the animation even when a second tap comes while the first is still wiggling.
    window.requestAnimationFrame(() => {
      setWiggle(true);
      timer.current = window.setTimeout(() => setWiggle(false), WIGGLE_MS);
    });
  };

  const pill = (on: boolean, tone: "lime" | "pink" | "cream", label: string) => (
    <button key={label} type="button" className={`${r.chip} ${r[tone]}`} aria-pressed={on} onClick={nudge}>
      {label}
    </button>
  );

  return (
    <div className={r.sideColumn}>
    <aside className={r.side} aria-label="Your choices">
      <div>
        <h2 className={r.label}>I&apos;m a</h2>
        <div className={r.chips} role="group" aria-label="Disciplines">
          {chipList(meta.disciplines.map((d) => d.value)).map((x) => pill(keys.includes(x.key), "lime", chipText(x)))}
        </div>
      </div>
      <div>
        <h2 className={r.label}>I want</h2>
        <div className={r.chips} role="group" aria-label="Kinds of opportunity">
          {TYPE_PILLS.filter((p) => meta.types.some((t) => p.types.includes(t.value))).map((p) => pill(picked.s.includes(p.id), "pink", p.label))}
        </div>
      </div>
      <div>
        <h2 className={r.label}>Where</h2>
        <div className={r.chips} role="group" aria-label="Places">
          {meta.boroughs.map((b) => pill(placeOn(picked.p, b.value), "cream", b.label))}
          {[...TRI_IDS, ...WIDE_IDS].map((id) => pill(picked.p.includes(id), "cream", meta.regions.find((x) => x.value === id)?.label ?? id))}
        </div>
      </div>
      <div className={r.sideActions}>
        <Link className={`${r.startOver} ${wiggle ? r.wiggle : ""}`} href={startOverHref}>
          <span aria-hidden="true">&larr;</span> Start over
        </Link>
      </div>
    </aside>
    <DemoReplays panel />
    </div>
  );
}
