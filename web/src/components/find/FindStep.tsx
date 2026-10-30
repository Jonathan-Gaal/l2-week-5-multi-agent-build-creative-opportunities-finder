"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MetaResponse } from "@api/types";
import { TYPE_PILLS, typesOf } from "@/lib/typePills";
import { chipList, chipsFor, idsOf, sayList, capital } from "@/lib/disciplineWords";
import { spellOut, toggleGroup, togglePlace } from "@/lib/places";
import PlaceMap, { PlaceChips } from "./PlaceMap";
import s from "./FindFlow.module.css";

export type Step = "discipline" | "type" | "place";
/** d: disciplines, s: the picked opportunity pills, p: places. Kept in the address so each page can be opened on its own. */
export type Choice = { d: string[]; s: string[]; p: string[] };

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
/** How long the "pick something" reminder stays on screen. */
const ALERT_MS = 4000;
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
    title: "What kind of artist are you?",
    sub: "Pick at least one. Work across disciplines? Add more!",
  },
  type: { n: 2, title: "What opportunities are you after?", sub: "Pick at least one. Not sure what they mean? Read description." },
  place: { n: 3, title: "Where do you want to work?", sub: "Tap the map or the buttons." },
} as const;

function Chip({ on, tone, i, onClick, describedBy, children }: { on: boolean; tone: "lime" | "pink"; i: number; onClick: () => void; describedBy?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={`${s.chip} ${s[tone]} ${s.chipSmall}`} style={{ ["--tilt" as string]: `${TILTS[i % TILTS.length]}deg` }} aria-pressed={on} aria-describedby={describedBy} onClick={onClick}>
      {children}
    </button>
  );
}

export default function FindStep({ step, initial, meta }: { step: Step; initial: Choice; meta: MetaResponse }) {
  const router = useRouter();
  const [c, setC] = useState<Choice>({ ...initial, p: spellOut(initial.p) });
  const [tried, setTried] = useState(false);
  const [nudge, setNudge] = useState(0); // each early press restarts the wiggle
  const alertTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(alertTimer.current), []);
  const copy = COPY[step];
  // Which chips are lit on the first step. A split discipline lights both of its chips when it arrives from the address.
  const [keys, setKeys] = useState<string[]>(() => initial.d.flatMap((id) => chipsFor(id).map((x) => x.key)));
  const pickKey = (key: string) => {
    const next = toggle(keys, key);
    setKeys(next);
    setC({ ...c, d: idsOf(next) });
  };

  const ok = step === "discipline" ? c.d.length > 0 : step === "type" ? c.s.length > 0 : c.p.length > 0 && c.s.length > 0;
  const next = step === "discipline" ? withQuery("/find/type", c) : step === "type" ? withQuery("/find/place", c) : `/results?${queryFor(c)}`;
  const back = step === "type" ? withQuery("/find/discipline", c) : step === "place" ? withQuery("/find/type", c) : "/";

  const go = () => {
    if (!ok) {
      // turn the directions bold pink for a few seconds, then let them fade back
      setTried(true);
      setNudge((n) => n + 1);
      window.clearTimeout(alertTimer.current);
      alertTimer.current = window.setTimeout(() => setTried(false), ALERT_MS);
      return;
    }
    router.push(next);
  };

  return (
    <div className={s.frame}>
    <div className={`${s.board} ${step === "type" ? s.boardSolo : ""}`}>
      <div className={s.left}>
        <h1 className={s.title}>{copy.title}</h1>
        {copy.sub && (
          <p key={nudge} className={`${s.sub} ${tried && !ok ? s.subAlert : ""}`} role={tried && !ok ? "alert" : undefined}>
            {copy.sub}
          </p>
        )}

        {step === "discipline" && (
          <p className={s.sentence} aria-live="polite">
            I&apos;m a{" "}
            {c.d.length ? (
              <span className={s.fill}>{sayList(chipList(meta.disciplines.map((d) => d.value)).filter((x) => keys.includes(x.key)).map((x) => x.word))}.</span>
            ) : (
              <span className={s.blank} aria-label="blank, pick the kind of artist you are">
                artist
              </span>
            )}
          </p>
        )}

        {step === "type" && (
          <div className={s.explainGrid} role="group" aria-label="Kinds of opportunity">
            {TYPE_PILLS.filter((p) => meta.types.some((t) => p.types.includes(t.value))).map((p, i) => (
              <div key={p.id} className={s.explainItem}>
                <Chip on={c.s.includes(p.id)} tone="pink" i={i} describedBy={`why-${p.id}`} onClick={() => setC({ ...c, s: toggle(c.s, p.id) })}>
                  {p.label}
                </Chip>
                <p id={`why-${p.id}`} className={s.explain}>
                  {p.explain}
                </p>
              </div>
            ))}
          </div>
        )}

        {step === "place" && (
          <PlaceChips
            meta={meta}
            places={c.p}
            onToggle={(id) => setC({ ...c, p: togglePlace(c.p, id) })}
            onToggleGroup={(g) => setC({ ...c, p: toggleGroup(c.p, g) })}
          />
        )}

      </div>

      {step !== "type" && (
      <div className={`${s.panel} ${step === "discipline" ? s.panelCenter : ""}`}>
        {step === "discipline" && (
          <div className={`${s.chips} ${s.cloud}`} role="group" aria-label="Kinds of artist">
            {chipList(meta.disciplines.map((d) => d.value)).map((x, i) => (
              <Chip key={x.key} on={keys.includes(x.key)} tone="lime" i={i} onClick={() => pickKey(x.key)}>
                {capital(x.word)}
              </Chip>
            ))}
          </div>
        )}
        {step === "place" && <PlaceMap meta={meta} places={c.p} onToggle={(id) => setC({ ...c, p: togglePlace(c.p, id) })} />}
      </div>
      )}
    </div>
    <div className={s.sides}>
      <Link href={back} className={`${s.sideBtn} ${s.sideBack}`}>
        <span className={s.arrow} aria-hidden="true">
          ←
        </span>{" "}
        Back
      </Link>
      <button type="button" className={`${s.sideBtn} ${s.sideNext}`} onClick={go}>
        Next{" "}
        <span className={s.arrow} aria-hidden="true">
          →
        </span>
      </button>
    </div>
    </div>
  );
}
