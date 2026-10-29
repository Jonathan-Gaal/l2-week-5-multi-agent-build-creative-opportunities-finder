"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { MetaResponse } from "@api/types";
import { TYPE_PILLS } from "@/lib/typePills";
import { type Choice, queryFor } from "./find/FindStep";
import r from "./ResultsLive.module.css";

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
const WAIT_MS = 1000; // wait for the person to finish picking before searching again

/**
 * Your answers as chips you can change. The list on the right updates itself a moment after the last tap, so there is no
 * next button. The wait keeps a quick run of taps from asking the results service (and its rate limit) once per tap.
 */
export default function ResultsSidebar({ meta, initial }: { meta: MetaResponse; initial: Choice }) {
  const router = useRouter();
  const [c, setC] = useState<Choice>(initial);
  const [pending, startTransition] = useTransition();
  const [waiting, setWaiting] = useState(false);

  // After the last tap, wait a moment, then search again. Each tap changes `c`, which restarts the wait.
  useEffect(() => {
    if (!waiting) return;
    const t = window.setTimeout(() => {
      setWaiting(false);
      startTransition(() => router.replace(`/results?${queryFor(c)}`, { scroll: false }));
    }, WAIT_MS);
    return () => window.clearTimeout(t);
  }, [c, waiting, router]);

  const change = (next: Choice) => {
    setC(next);
    setWaiting(true);
  };

  const pill = (on: boolean, tone: "lime" | "pink" | "cream", label: string, onClick: () => void, extra = "") => (
    <button key={label} type="button" className={`${r.chip} ${r[tone]} ${extra}`} aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <aside className={r.side} aria-label="Your choices">
      <div>
        <h2 className={r.label}>I make</h2>
        <div className={r.chips} role="group" aria-label="Disciplines">
          {meta.disciplines.map((d) => pill(c.d.includes(d.value), "lime", d.label, () => change({ ...c, d: toggle(c.d, d.value) })))}
        </div>
      </div>
      <div>
        <h2 className={r.label}>I want</h2>
        <div className={r.chips} role="group" aria-label="Kinds of opportunity">
          {TYPE_PILLS.filter((p) => meta.types.some((t) => t.value === p.type)).map((p) =>
            pill(c.s.includes(p.id), "pink", p.label, () => change({ ...c, s: toggle(c.s, p.id) })),
          )}
        </div>
      </div>
      <div>
        <h2 className={r.label}>Where</h2>
        <div className={r.chips} role="group" aria-label="Places">
          {meta.boroughs.map((b) => pill(c.p.includes(b.value), "cream", b.label, () => change({ ...c, p: toggle(c.p, b.value) })))}
          {meta.place_groups.map((g) => pill(c.p.includes(g.value), "cream", g.label, () => change({ ...c, p: toggle(c.p, g.value) }), r.wider))}
        </div>
      </div>
      <p className={r.status} role="status" aria-live="polite">
        {waiting || pending ? <b>Updating your list…</b> : "Tap a chip to add or remove it. The list updates by itself."}
      </p>
    </aside>
  );
}
