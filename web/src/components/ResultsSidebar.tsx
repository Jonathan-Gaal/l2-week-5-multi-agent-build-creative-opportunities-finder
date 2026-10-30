"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { MetaResponse } from "@api/types";
import { capital, chipList, chipsFor, idsOf } from "@/lib/disciplineWords";
import { TRI_IDS, WIDE_IDS, groupState, placeOn, spellOut, toggleGroup, togglePlace } from "@/lib/places";
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
  const [c, setC] = useState<Choice>({ ...initial, p: spellOut(initial.p) });
  const [pending, startTransition] = useTransition();
  const [waiting, setWaiting] = useState(false);
  // Which chips are lit. A split discipline (writer / poet) lights both of its chips when it arrives from the address.
  const [keys, setKeys] = useState<string[]>(() => initial.d.flatMap((id) => chipsFor(id).map((x) => x.key)));

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
        <h2 className={r.label}>I&apos;m a</h2>
        <div className={r.chips} role="group" aria-label="Disciplines">
          {chipList(meta.disciplines.map((d) => d.value)).map((x) =>
            pill(keys.includes(x.key), "lime", capital(x.word), () => {
              const next = keys.includes(x.key) ? keys.filter((k) => k !== x.key) : [...keys, x.key];
              setKeys(next);
              change({ ...c, d: idsOf(next) });
            }),
          )}
        </div>
      </div>
      <div>
        <h2 className={r.label}>I want</h2>
        <div className={r.chips} role="group" aria-label="Kinds of opportunity">
          {TYPE_PILLS.filter((p) => meta.types.some((t) => p.types.includes(t.value))).map((p) =>
            pill(c.s.includes(p.id), "pink", p.label, () => change({ ...c, s: toggle(c.s, p.id) })),
          )}
        </div>
      </div>
      <div>
        <h2 className={r.label}>Where</h2>
        <div className={r.chips} role="group" aria-label="Places">
          {pill(groupState(c.p, "nyc") === "true", "cream", "Anywhere in NYC", () => change({ ...c, p: toggleGroup(c.p, "nyc") }))}
          {meta.boroughs.map((b) => pill(placeOn(c.p, b.value), "cream", b.label, () => change({ ...c, p: togglePlace(c.p, b.value) })))}
          {[...TRI_IDS, ...WIDE_IDS].map((id) =>
            pill(c.p.includes(id), "cream", meta.regions.find((x) => x.value === id)?.label ?? id, () => change({ ...c, p: togglePlace(c.p, id) }), r.wider),
          )}
        </div>
      </div>
      <p className={r.status} role="status" aria-live="polite">
        {waiting || pending ? <b>Updating your list…</b> : "Tap a chip to add or remove it. The list updates by itself."}
      </p>
    </aside>
  );
}
