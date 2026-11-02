"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MetaResponse } from "@api/types";
import { TYPE_PILLS, typesOf } from "@/lib/typePills";
import { article, chipList, chipText, chipsFor, idsOf } from "@/lib/disciplineWords";
import { GROUP_IDS, spellOut, toggleGroup, togglePlace, type PlaceGroup } from "@/lib/places";
import { makeCursor } from "@/lib/replayCursor";
import PlaceMap, { PlaceChips } from "./PlaceMap";
import s from "./FindFlow.module.css";

export type Step = "discipline" | "type" | "place";
/** d: disciplines, s: the picked opportunity pills, p: places. Kept in the address so each page can be opened on its own. */
export type Choice = { d: string[]; s: string[]; p: string[] };

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
/** How long the "pick something" reminder stays on screen. */
const ALERT_MS = 1000;
const TILTS = [-2, 1.5, 1, -1.5, 2, -1];
const CARD_TONES = ["cream", "pink", "lime"] as const;
const ARTIST_TONES = ["lime", "pink", "cream"] as const;
/** Colours run lime, pink, cream down the laid-out order, with a small tweak near the end so no neighbours match and Musician ends up lime and Crafter cream. */
const ARTIST_ORDER = [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 0, 2, 1];
/** Words whose colour is fixed no matter where they sit (Filmmaker and Crafter swapped places but kept their colours). */
const TONE_FIXED: Record<string, (typeof ARTIST_TONES)[number]> = { film: "lime", "craft:crafter": "cream" };
const artistTone = (i: number, key: string) => TONE_FIXED[key] ?? ARTIST_TONES[ARTIST_ORDER[i % ARTIST_ORDER.length]];
/** The order the artist words are laid out in. Long and short names are mixed so the wrapped rows come out about the same length. */
const SHOWN_ORDER = ["music:musician", "visual", "theater", "singer", "poet", "photographer", "writing:writer", "comedy", "dance", "model", "videographer", "craft:crafter", "film", "crew"];
/** A hand-drawn marker loop that circles a card when it is picked. */
const CIRCLE = "M8 52 C4 22 30 3 62 4 C92 5 99 28 94 56 C90 84 62 98 34 95 C10 92 2 70 9 44 C12 30 22 18 34 12";

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
    sub: "Select at least one. Work across disciplines? Add more!",
  },
  type: { n: 2, title: "What opportunities are you after?", sub: "Select at least one. Not sure what they are? Read description." },
  place: { n: 3, title: "Where do you want to work?", sub: "Select an area on the map or use the buttons below." },
} as const;

/** One kind of opportunity as a taped-up index card. Picking it circles it in marker; the card colour never changes. */
function OppCard({ i, on, label, why, pick, onClick }: { i: number; on: boolean; label: string; why?: string; pick?: string; onClick: () => void }) {
  return (
    <button type="button" data-pick={pick} className={`${s.oppCard} ${s[CARD_TONES[(i + Math.floor(i / 3)) % CARD_TONES.length]]}`} style={{ ["--tilt" as string]: `${TILTS[i % TILTS.length]}deg`, ["--tape" as string]: i % 2 ? "4deg" : "-3deg" }} aria-pressed={on} onClick={onClick}>
      <svg className={s.circ} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={CIRCLE} />
      </svg>
      <span className={s.oppLabel}>{label}</span>
      {why && <span className={s.oppWhy}>{why}</span>}
    </button>
  );
}

/** One kind of artist: a big serif word on a colour bar that rises to fill the word when picked. The colours run lime, pink, cream, shifted a step each row of four. */
function ArtistWord({ i, id, on, children, onClick }: { i: number; id: string; on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" data-pick={id} className={`${s.artistWord} ${s[artistTone(i, id)]}`} aria-pressed={on} onClick={onClick}>
      <span>{children}</span>
      {/* an invisible capitalised copy keeps the button the same width whether it is picked (capitals) or not, so the rows never reshuffle */}
      <span className={s.artistSizer} aria-hidden="true">
        {children}
      </span>
    </button>
  );
}

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
  // A saved run from the demo (/demo) plays itself: with ?replay=1 each step picks the saved choices one by one, presses Next,
  // and carries on to the next step, so the results page opens the way it would after someone had gone through the flow.
  const params = useSearchParams();
  const replay = params.get("replay") === "1";
  const replayQuery = new URLSearchParams({ replay: "1", rd: params.get("rd") ?? "", rs: params.get("rs") ?? "", rp: params.get("rp") ?? "" }).toString();
  const [pressing, setPressing] = useState(false);
  const copy = COPY[step];
  const shownPills = TYPE_PILLS.filter((p) => meta.types.some((t) => p.types.includes(t.value)));
  const allOn = shownPills.length > 0 && shownPills.every((p) => c.s.includes(p.id));
  // Which chips are lit on the first step. A split discipline lights both of its chips when it arrives from the address.
  const [keys, setKeys] = useState<string[]>(() => initial.d.flatMap((id) => chipsFor(id).map((x) => x.key)));
  const allKinds = chipList(meta.disciplines.map((d) => d.value)).sort((a, b) => (SHOWN_ORDER.indexOf(a.key) + 1 || 99) - (SHOWN_ORDER.indexOf(b.key) + 1 || 99));
  // in the order they were picked, so the sentence reads the way the person chose
  const picked = keys.flatMap((k) => allKinds.filter((x) => x.key === k));
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

  const keysRef = useRef(keys);
  const nextRef = useRef(next);
  useEffect(() => {
    // The results address of a replay carries replay=1, so the results page keeps its loading screen up for a few seconds.
    nextRef.current = replay ? `${next}${next.includes("?") ? "&" : "?"}${step === "place" ? "replay=1" : replayQuery}` : next;
  });
  useEffect(() => {
    if (!replay) return;
    const list = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);
    // What this step picks, in order: the thing to click, and what to do instead if it is not on screen (a folded group of places).
    const picks: { pick: string; apply: () => void }[] =
      step === "discipline"
        ? list("rd").flatMap((id) => {
            const key = chipsFor(id)[0]?.key;
            if (!key) return [];
            return [{ pick: key, apply: () => {
              keysRef.current = [...keysRef.current, key];
              setKeys(keysRef.current);
              setC((prev) => ({ ...prev, d: idsOf(keysRef.current) }));
            } }];
          })
        : step === "type"
          ? list("rs").map((id) => ({ pick: id, apply: () => setC((prev) => ({ ...prev, s: prev.s.includes(id) ? prev.s : [...prev.s, id] })) }))
          : list("rp").map((id) => ({ pick: id, apply: () => setC((prev) => ({ ...prev, p: prev.p.includes(id) ? prev.p : togglePlace(prev.p, id) })) }));
    let stop = false;
    const cursor = makeCursor();
    const wait = (ms: number) => new Promise<void>((done) => window.setTimeout(done, ms));
    const glideTo = async (el: Element) => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      await wait(400);
      const r = el.getBoundingClientRect();
      cursor.move(r.left + r.width / 2, r.top + r.height / 2);
      await wait(800);
    };
    void (async () => {
      await wait(900);
      for (const p of picks) {
        if (stop) return;
        if (step === "place") {
          const group = (Object.keys(GROUP_IDS) as PlaceGroup[]).find((g) => GROUP_IDS[g].includes(p.pick));
          const fold = group && document.querySelector<HTMLButtonElement>(`[aria-controls="places-${group}"]`);
          if (fold && fold.getAttribute("aria-expanded") === "false") {
            await glideTo(fold);
            if (stop) return;
            cursor.click();
            fold.click();
            await wait(450);
          }
        }
        // NYC is the whole-city shortcut, selected by the existing group-title button.
        const el = document.querySelector<HTMLElement>(p.pick === "nyc" && step === "place" ? '[data-group="nyc"]' : `[data-pick="${p.pick}"]`);
        if (el) {
          await glideTo(el);
          if (stop) return;
          cursor.click();
          el.click();     // the real button, so the page reacts exactly as it does for a person
        } else p.apply();
        await wait(450);
      }
      await wait(700);
      const nextButton = document.querySelector('[data-pick="next"]');
      if (nextButton && !stop) {
        await glideTo(nextButton);
        cursor.click();
        setPressing(true);
        await wait(450);
      }
      if (!stop) router.push(nextRef.current);
    })();
    return () => {
      stop = true;
      cursor.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a replay starts once per step
  }, [replay, step]);

  return (
    <div className={s.frame}>
    <div className={`${s.board} ${step !== "place" ? s.boardSolo : ""} ${step === "discipline" ? s.boardTall : ""} ${step === "place" ? s.boardPlace : ""}`}>
      <div className={s.left}>
        <h1 className={s.title}>{copy.title}</h1>
        {copy.sub && (
          <p key={nudge} className={`${s.sub} ${tried && !ok ? s.subAlert : ""}`} role={tried && !ok ? "alert" : undefined}>
            {copy.sub}
          </p>
        )}

        {step === "discipline" && (
          <p className={s.sentence} aria-live="polite">
            I&apos;m {picked[0] ? article(picked[0].word) : "a"}{" "}
            {c.d.length ? (
              <>
                {picked.map((x, i) => (
                  <span key={x.key}>
                    {i > 0 && (i === picked.length - 1 ? " and " : ", ")}
                    <mark className={`${s.pick} ${s[artistTone(allKinds.indexOf(x), x.key)]}`}>{x.word}</mark>
                  </span>
                ))}
                .
              </>
            ) : (
              <>
                <span className={s.blank} aria-label="blank, pick the kind of artist you are">
                  artist
                </span>
                .
              </>
            )}
          </p>
        )}

        {step === "discipline" && (
          <div className={`${s.explainGrid} ${s.artistGrid}`} role="group" aria-label="Kinds of artist">
            {allKinds.map((x, i) => (
              <ArtistWord key={x.key} i={i} id={x.key} on={keys.includes(x.key)} onClick={() => pickKey(x.key)}>
                {chipText(x)}
              </ArtistWord>
            ))}
          </div>
        )}

        {step === "type" && (
          <div className={s.explainGrid} role="group" aria-label="Kinds of opportunity">
            {shownPills.map((p, i) => (
              <OppCard key={p.id} i={i} pick={p.id} on={c.s.includes(p.id)} label={p.label} why={p.explain} onClick={() => setC({ ...c, s: toggle(c.s, p.id) })} />
            ))}
            <OppCard
              i={shownPills.length}
              on={allOn}
              label="Open to all"
              why="Select every kind of opportunity above, so nothing is left out."
              onClick={() => setC({ ...c, s: allOn ? [] : shownPills.map((p) => p.id) })}
            />
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

      {step === "place" && (
        <div className={`${s.panel} ${s.panelMap}`}>
          <PlaceMap meta={meta} places={c.p} onToggle={(id) => setC({ ...c, p: togglePlace(c.p, id) })} />
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
      <button type="button" data-pick="next" className={`${s.sideBtn} ${s.sideNext}`} data-press={pressing ? "true" : undefined} onClick={go}>
        Next{" "}
        <span className={s.arrow} aria-hidden="true">
          →
        </span>
      </button>
    </div>
    </div>
  );
}
