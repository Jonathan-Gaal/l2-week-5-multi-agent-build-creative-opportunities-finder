"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import styles from "./MadLibsHero.module.css";
import { ART_SRC, useArt } from "./designArt";

/** Each scene is one believable artist. This is a picture of who Artist Atlas is for, not a form. */
type Scene = {
  make: string[];
  want: string[];
  where: string[];
  /** "around" by default. */
  prep?: string;
  /** Plain words after the last place pill, before the full stop: "area". */
  after?: string;
  /** A comma after the first clause, true by default. */
  comma?: boolean;
  /** Second discipline without its own "a": "a visual artist and theater artist". */
  bare?: boolean;
};

// The five sentences are Mara's copy, word for word: do not reword them. Note that "poet", "actor" and "festivals" are
// finer than the categories the find flow offers today (writing, theater, events), and the tri-state wording is the
// wider search, so the page says slightly more than the find flow can do. That is a deliberate copy choice.
const SCENES: Scene[] = [
  { make: ["comedian", "musician"], want: ["open mics", "grants"], where: ["Brooklyn", "Queens"] },
  { make: ["dancer"], want: ["open calls"], where: ["Manhattan", "the Bronx"] },
  { make: ["visual artist", "actor"], want: ["auditions", "residencies"], where: ["Queens"], bare: true, comma: false },
  { make: ["poet"], want: ["open mics", "grants"], where: ["Staten Island"] },
  { make: ["filmmaker"], want: ["grants", "festivals"], where: ["NYC tri-state"], prep: "in the", after: "area" },
];

const DEV = process.env.NODE_ENV !== "production";

const TICK_MS = 4200; // a new artist every 4.2 seconds
const STAGGER_MS = 420; // who they are first, then what they want, then where
const EXIT_MS = 420; // each part fades out before its replacement fades in, so the words never snap

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
};
const reducedNow = () => window.matchMedia(REDUCED).matches;
const reducedOnServer = () => false;

type Tone = "lime" | "pink" | "cream";

function Pill({ tone, text, delay }: { tone: Tone; text: string; delay: number }) {
  // "open mics" / "open calls" stay one pill, unless the line runs out after "open": then the pill breaks there and the
  // rest continues on the next line, instead of the whole phrase jumping down and leaving a gap.
  const breaks = text.startsWith("open ");
  return (
    <span className={`${styles.pill} ${breaks ? styles.breaks : ""} ${styles[tone]}`} style={{ animationDelay: `${delay}ms` }}>
      {text}
    </span>
  );
}

export default function MadLibsHero() {
  const reduced = useSyncExternalStore(subscribeReduced, reducedNow, reducedOnServer);
  const art = useArt();
  // The Graphic section of the dev Versions panel can swap the picture on whichever layout is showing.
  const pic = (src: string, w: number, h: number) => {
    const a = ART_SRC[art];
    return a ? { src: a.src, width: a.w, height: a.h } : { src, width: w, height: h };
  };
  const paused = reduced; // people who ask for less motion get a still sentence
  const [idx, setIdx] = useState({ make: 0, want: 0, where: 0 });
  const [leaving, setLeaving] = useState({ make: false, want: false, where: false });

  useEffect(() => {
    if (paused) return;
    const timers: number[] = [];
    let target = 0;
    const tick = window.setInterval(() => {
      target = (target + 1) % SCENES.length;
      const t = target;
      (["make", "want", "where"] as const).forEach((part, n) => {
        timers.push(window.setTimeout(() => setLeaving((l) => ({ ...l, [part]: true })), STAGGER_MS * n));
        timers.push(
          window.setTimeout(() => {
            setIdx((i) => ({ ...i, [part]: t }));
            setLeaving((l) => ({ ...l, [part]: false }));
          }, STAGGER_MS * n + EXIT_MS),
        );
      });
    }, TICK_MS);
    return () => {
      window.clearInterval(tick);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [paused]);

  // Wording quirks (comma, "in" vs "around", no second "a") travel with the part they belong to, so they swap in step.
  // The modulo keeps the page safe if the list of scenes ever gets shorter while a visitor (or a hot reload) is mid-loop.
  const at = (i: number) => SCENES[i % SCENES.length]!;
  const sceneMake = at(idx.make);
  const sceneWhere = at(idx.where);
  const make = sceneMake.make;
  const want = at(idx.want).want;
  const where = sceneWhere.where;

  return (
    <div className={`${styles.page} hero-page`}>
      <div className={styles.glow} aria-hidden="true" />
      <Image className={styles.figure} {...pic("/brand/figure-nyc.png", 800, 1042)} alt="" priority />
      {DEV && (
        // Saved layout versions for the dev Versions panel. Only one shows at a time (see the CSS); production skips these.
        <div className={styles.vx} aria-hidden="true">
          <div className={styles.vstack}>
            <Image {...pic("/brand/figure-clean.png", 800, 1218)} alt="" />
            <Image src="/brand/wordmark-lg.png" alt="" width={900} height={492} />
          </div>
          <Image className={styles.vpeek} {...pic("/brand/figure-clean.png", 800, 1218)} alt="" />
          <Image className={styles.vfig} {...pic("/brand/figure-clean.png", 800, 1218)} alt="" />
          <Image className={styles.vgiant} src="/brand/wordmark-lg.png" alt="" width={900} height={492} />
          <div className={styles.vdisc}>
            <Image {...pic("/brand/figure-echo.png", 900, 866)} alt="" />
          </div>
          <Image className={styles.vfade} {...pic("/brand/figure-echo.png", 900, 866)} alt="" />
        </div>
      )}
      <div className="wrap">
        <div className={styles.content}>
          {DEV && <Image className={styles.vwordabove} src="/brand/wordmark-lg.png" alt="" width={900} height={492} aria-hidden="true" />}
          <h1 className={styles.sr}>
            Artist Atlas finds open calls, grants, residencies, events and jobs for artists.
          </h1>

          {/* A picture of who it is for. Hidden from screen readers, which get the line above instead. */}
          <div className={styles.sentence} aria-hidden="true">
            <span className={`${styles.group} ${leaving.make ? styles.out : ""}`}>
              I&rsquo;m {article(make[0]!)} <Pill key={`m0-${idx.make}`} tone="lime" text={make[0]!} delay={0} />
              {make[1] && (
                <>
                  {" "}and {sceneMake.bare ? "" : `${article(make[1])} `}
                  <Pill key={`m1-${idx.make}`} tone="lime" text={make[1]} delay={90} />
                </>
              )}
              {sceneMake.comma === false ? "" : ","}
            </span>{" "}
            <span className={`${styles.group} ${leaving.want ? styles.out : ""}`}>
              looking for <Pill key={`w0-${idx.want}`} tone="pink" text={want[0]!} delay={0} />
              {want[1] && (
                <>
                  {" "}and <Pill key={`w1-${idx.want}`} tone="pink" text={want[1]} delay={90} />
                </>
              )}
            </span>{" "}
            <span className={`${styles.group} ${leaving.where ? styles.out : ""}`}>
              {sceneWhere.prep ?? "around"} <Pill key={`p0-${idx.where}`} tone="cream" text={where[0]!} delay={0} />
              {where[1] && (
                <>
                  {" "}and <Pill key={`p1-${idx.where}`} tone="cream" text={where[1]} delay={90} />
                </>
              )}
              {sceneWhere.after ? ` ${sceneWhere.after}` : ""}.
            </span>
          </div>

          <div className={styles.actions}>
            <Link href="/find" className={styles.cta}>
              Find opportunities <span className={styles.arrow}>&rarr;</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
