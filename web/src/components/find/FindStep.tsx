"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MetaResponse } from "@api/types";
import { TYPE_PILLS, TYPE_PILL_GROUPS, pillLabel, typesOf } from "@/lib/typePills";
import PlaceMap from "./PlaceMap";
import s from "./FindFlow.module.css";

export type Step = "discipline" | "type" | "place";
/** d: disciplines, s: the picked opportunity pills, p: places. Kept in the address so each page can be opened on its own. */
export type Choice = { d: string[]; s: string[]; p: string[] };

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
const TILTS = [-2, 1.5, 1, -1.5, 2, -1];

/** The address query for a set of choices. Results reads d, t and p; s keeps the finer pills so the next page can show them again. */
export function queryFor(c: Choice): string {
  const q = new URLSearchParams();
  if (c.d.length) q.set("d", c.d.join(","));
  const t = typesOf(c.s);
  if (t.length) {
    q.set("t", t.join(","));
    q.set("s", c.s.join(","));
  }
  if (c.p.length) q.set("p", c.p.join(","));
  return q.toString();
}
const withQuery = (path: string, c: Choice) => {
  const q = queryFor(c);
  return q ? `${path}?${q}` : path;
};

const COPY = {
  discipline: {
    n: 1,
    title: "What do you make?",
    sub: "Pick everything that fits. Work across disciplines? Pick them all. Not sure, or open to anything? Skip ahead.",
  },
  type: { n: 2, title: "What are you looking for?", sub: "Choose one or more. Each kind gets its own list, and nothing is lumped together." },
  place: { n: 3, title: "Where do you want to work?", sub: "Tap the map. Pick as many places as you like, or go wider with the buttons above it." },
} as const;

function Chip({ on, tone, i, onClick, children }: { on: boolean; tone: "lime" | "pink"; i: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`${s.chip} ${s[tone]}`} style={{ ["--tilt" as string]: `${TILTS[i % TILTS.length]}deg` }} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

export default function FindStep({ step, initial, meta }: { step: Step; initial: Choice; meta: MetaResponse }) {
  const router = useRouter();
  const [c, setC] = useState<Choice>(initial);
  const copy = COPY[step];

  const dLabel = (id: string) => meta.disciplines.find((d) => d.value === id)?.label ?? id;
  const pLabel = (id: string) => [...meta.boroughs, ...meta.place_groups].find((p) => p.value === id)?.label ?? id;

  const ok = step === "discipline" ? true : step === "type" ? c.s.length > 0 : c.p.length > 0 && c.s.length > 0;
  const next = step === "discipline" ? withQuery("/find/type", c) : step === "type" ? withQuery("/find/place", c) : `/results?${queryFor(c)}`;
  const back = step === "type" ? withQuery("/find/discipline", c) : step === "place" ? withQuery("/find/type", c) : "/";
  const backLabel = step === "discipline" ? "← Home" : "← Back";
  const cta = step === "discipline" ? (c.d.length ? "Next →" : "Skip, I'm open to anything →") : step === "type" ? "Next →" : "Show what's there →";

  const selectedNames = step === "discipline" ? c.d.map(dLabel) : step === "type" ? c.s.map(pillLabel) : c.p.map(pLabel);
  const hint = step === "discipline" ? "Nothing picked means we won't filter by discipline." : "Pick at least one.";

  return (
    <div className={s.frame}>
    <div className={s.board}>
      <div className={s.left}>
        <h1 className={s.title}>{copy.title}</h1>
        <p className={s.sub}>{copy.sub}</p>

        {step !== "discipline" && (
          <div className={s.earlier}>
            <div>
              <h2 className={s.earlierLabel}>What you make</h2>
              <div className={s.mini}>
                {c.d.length ? (
                  c.d.map((d) => (
                    <button key={d} type="button" className={`${s.pill} ${s.limeOn}`} aria-pressed="true" title="Tap to remove" onClick={() => setC({ ...c, d: toggle(c.d, d) })}>
                      {dLabel(d)}
                    </button>
                  ))
                ) : (
                  <span className={`${s.pill} ${s.plain}`}>Anything</span>
                )}
              </div>
            </div>
            {step === "place" && (
              <div>
                <h2 className={s.earlierLabel}>Looking for</h2>
                <div className={s.mini}>
                  {c.s.map((id) => (
                    <button key={id} type="button" className={`${s.pill} ${s.pinkOn}`} aria-pressed="true" title="Tap to remove" onClick={() => setC({ ...c, s: toggle(c.s, id) })}>
                      {pillLabel(id)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className={s.bottom}>
          <div className={s.selected}>
            <b>Selected:</b> {selectedNames.length ? selectedNames.join(", ") : hint}
          </div>
          <div className={s.actions}>
            <button type="button" className={s.cta} disabled={!ok} onClick={() => router.push(next)}>
              {cta}
            </button>
            <Link href={back} className={s.back}>
              {backLabel}
            </Link>
          </div>
        </div>
      </div>

      <div className={s.panel}>
        {step === "discipline" && (
          <>
            <h2 className={s.groupTitle}>Your practice</h2>
            <div className={s.chips} role="group" aria-label="Disciplines">
              {meta.disciplines.map((d, i) => (
                <Chip key={d.value} on={c.d.includes(d.value)} tone="lime" i={i} onClick={() => setC({ ...c, d: toggle(c.d, d.value) })}>
                  {d.label}
                </Chip>
              ))}
            </div>
          </>
        )}

        {step === "type" &&
          TYPE_PILL_GROUPS.map((group) => (
            <div key={group} className={s.group}>
              <h2 className={s.groupTitle}>{group}</h2>
              <div className={s.chips} role="group" aria-label={group}>
                {TYPE_PILLS.filter((p) => p.group === group && meta.types.some((t) => t.value === p.type)).map((p, i) => (
                  <Chip key={p.id} on={c.s.includes(p.id)} tone="pink" i={i} onClick={() => setC({ ...c, s: toggle(c.s, p.id) })}>
                    {p.label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}

        {step === "place" && <PlaceMap meta={meta} places={c.p} onToggle={(id) => setC({ ...c, p: toggle(c.p, id) })} />}
      </div>
    </div>
    </div>
  );
}
