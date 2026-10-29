"use client";

import { useEffect, useState } from "react";
import repoVersions from "@/data/design-versions.json";
import { announceArt } from "./designArt";

/** TEMPORARY, dev only: flips between design versions while Mara works. Everything is kept in this browser. */
const GROUPS = [
  {
    key: "hdr",
    label: "Logo",
    options: [["original", "Original bar"], ["original2", "Original bar 2"], ["full", "Full logo"], ["wordmark", "Lettering"], ["icon-nyc", "Icon + NYC"], ["icon", "Icon only"], ["none", "None"]],
  },
  { key: "corner", label: "Logo corner", options: [["left", "Left"], ["right", "Right"]] },
  { key: "authcorner", label: "Sign up / Log in corner", options: [["left", "Left"], ["right", "Right"]] },
  {
    key: "art",
    label: "Picture",
    options: [["default", "Layout's own"], ["globe", "Man + globe"], ["globe-nyc", "Man + globe + NYC"], ["whole", "Whole logo"], ["wordmark", "Wordmark only"], ["fade", "Man + globe, faded"]],
  },
  { key: "bg", label: "Background", options: [["purple", "Original (purple + circle)"], ["solid", "Solid brand purple"], ["spotlight", "Plum spotlight"]] },
  { key: "hero", label: "Home page", options: [["figure", "Figure (current)"], ["plain", "Sentence only"], ["p1-1", "1 Rebuilt original"], ["p1-3", "1-3 Peeking in"], ["p1-8", "1-8 Giant lettering"], ["p2-4", "2-4 Spotlight circle"], ["p2-8", "2-8 Faded behind"]] },
] as const;

/** How long the panel stays out of the way after "Hide". */
const HIDE_MS = 4000;

const HOME = GROUPS.find((g) => g.key === "hero")!;

/** Every setting in the panel. A saved version is a copy of this, so loading one brings back the whole look. */
type Fig = { x: number; y: number; s: number };
type Pos = { x: number; y: number };
const NO_MOVE: Pos = { x: 0, y: 0 };
type Settings = {
  pick: Record<string, string>;
  size: number;
  btn: number;
  /** Graphic position and size, kept separately for each home page version so each can be reset on its own. */
  figs: Record<string, Fig>;
  /** How far the sentence and the Find opportunities button are nudged from where they normally sit. */
  sent: Pos;
  cta: Pos;
  /** Sentence text size, 1 = normal. */
  sentSize: number;
  /** How far down (px) the corner logo is nudged; negative moves it up. */
  logoY: number;
  /** How far (px) the corner logo is nudged sideways; positive moves it right. */
  logoX: number;
  /** Nudge (px) for the Sign up / Login buttons. */
  auth: Pos;
};
const ORIGINAL: Fig = { x: 0, y: 0, s: 1 }; // a version's built-in starting spot, as built from its mockup
type Saved = { id: string; name: string; at: number; settings: Settings };

const DEFAULTS: Settings = {
  pick: { hdr: "wordmark", corner: "right", authcorner: "right", hero: "figure", bg: "purple", art: "default", devtools: "off", navlinks: "on", auth: "on" },
  size: 1,
  btn: 1,
  figs: {},
  sent: NO_MOVE,
  cta: NO_MOVE,
  sentSize: 1,
  logoY: 0,
  logoX: 0,
  auth: NO_MOVE,
};

const store = {
  get: (key: string, fallback: string) => {
    try {
      return window.localStorage.getItem(`design-${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set: (key: string, value: string) => {
    try {
      window.localStorage.setItem(`design-${key}`, value);
    } catch {}
  },
};

/** Puts a full set of settings onto the page and remembers it. */
const applySettings = (s: Settings) => {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(s.pick)) {
    root.dataset[k] = v;
    store.set(k, v);
  }
  root.style.setProperty("--logo-scale", String(s.size));
  root.style.setProperty("--cta-scale", String(s.btn));
  const f = s.figs[s.pick.hero!] ?? ORIGINAL;
  root.style.setProperty("--fig-x", `${f.x}vw`);
  root.style.setProperty("--fig-y", `${f.y}vh`);
  root.style.setProperty("--fig-scale", String(f.s));
  root.style.setProperty("--sent-x", `${s.sent.x}vw`);
  root.style.setProperty("--sent-y", `${s.sent.y}vh`);
  root.style.setProperty("--cta-x", `${s.cta.x}vw`);
  root.style.setProperty("--cta-y", `${s.cta.y}vh`);
  root.style.setProperty("--logo-x", `${s.logoX}px`);
  window.setTimeout(announceArt, 0); // tells the home page to swap its picture
  root.style.setProperty("--auth-x", `${s.auth.x}px`);
  root.style.setProperty("--auth-y", `${s.auth.y}px`);
  store.set("logox", String(s.logoX));
  store.set("authpos", JSON.stringify(s.auth));
  root.style.setProperty("--logo-y", `${s.logoY}px`);
  store.set("logoy", String(s.logoY));
  root.style.setProperty("--sent-scale", String(s.sentSize));
  store.set("sentsize", String(s.sentSize));
  store.set("sent", JSON.stringify(s.sent));
  store.set("ctapos", JSON.stringify(s.cta));
  store.set("size", String(s.size));
  store.set("btnsize", String(s.btn));
  store.set("figs", JSON.stringify(s.figs));
};

const num = (v: string, fallback: number, min: number, max: number) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Accepts the stored graphic settings and drops anything out of range. */
const readFigs = (raw: string): Record<string, Fig> => {
  try {
    const obj = JSON.parse(raw);
    const out: Record<string, Fig> = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
      const f = v as Partial<Fig>;
      out[k] = { x: num(String(f.x), 0, -20, 45), y: num(String(f.y), 0, -45, 45), s: num(String(f.s), 1, 0.3, 2.5) };
    }
    return out;
  } catch {
    return {};
  }
};

const readPos = (raw: string): Pos => {
  try {
    const p = JSON.parse(raw) as Partial<Pos>;
    return { x: num(String(p.x), 0, -40, 40), y: num(String(p.y), 0, -45, 45) };
  } catch {
    return NO_MOVE;
  }
};

const readPx = (raw: string): Pos => {
  try {
    const p = JSON.parse(raw) as Partial<Pos>;
    return { x: num(String(p.x), 0, -400, 400), y: num(String(p.y), 0, -60, 200) };
  } catch {
    return NO_MOVE;
  }
};

/** Backgrounds that no longer exist (an earlier try) fall back to the original. */
const validBg = (v: string) => (["purple", "solid", "spotlight"].includes(v) ? v : "purple");

const readSettings = (): Settings => ({
  pick: {
    hdr: store.get("hdr", DEFAULTS.pick.hdr!),
    corner: store.get("corner", DEFAULTS.pick.corner!),
    hero: store.get("hero", DEFAULTS.pick.hero!),
    art: store.get("art", DEFAULTS.pick.art!),
    bg: validBg(store.get("bg", DEFAULTS.pick.bg!)),
    devtools: store.get("devtools", DEFAULTS.pick.devtools!),
    navlinks: store.get("navlinks", DEFAULTS.pick.navlinks!),
    authcorner: store.get("authcorner", DEFAULTS.pick.authcorner!),
    auth: store.get("auth", DEFAULTS.pick.auth!),
  },
  size: num(store.get("size", "1"), 1, 0.4, 4),
  btn: num(store.get("btnsize", "1"), 1, 0.4, 4),
  figs: readFigs(store.get("figs", "{}")),
  sent: readPos(store.get("sent", "{}")),
  cta: readPos(store.get("ctapos", "{}")),
  sentSize: num(store.get("sentsize", "1"), 1, 0.4, 3),
  logoY: num(store.get("logoy", "0"), 0, -60, 200),
  logoX: num(store.get("logox", "0"), 0, -400, 400),
  auth: readPx(store.get("authpos", "{}")),
});

/** Looks saved in the repo (design-versions.json) show up for everyone; ones saved only in this browser are added, and win on the same id. */
const mergeSaved = (local: Saved[]): Saved[] => {
  const mine = new Map(local.map((v) => [v.id, v]));
  const shared = (repoVersions as unknown as Saved[]).map((v) => mine.get(v.id) ?? v);
  return [...shared, ...local.filter((v) => !shared.some((r) => r.id === v.id))];
};

const readSaved = (): Saved[] => {
  try {
    const list = JSON.parse(store.get("saved", "[]"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

function Slider({ id, label, min, max, step, value, shown, onChange }: { id: string; label: string; min: number; max: number; step: number; value: number; shown: string; onChange: (v: number) => void }) {
  return (
    <div style={{ marginTop: 6 }}>
      <label htmlFor={id} style={{ display: "flex", justifyContent: "space-between", color: "#cfc6da", fontWeight: 500, marginBottom: 2 }}>
        <span>{label}</span>
        <span>{shown}</span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#dcfc05" }} />
    </div>
  );
}

const linkStyle = { background: "none", border: 0, color: "#dcfc05", font: "inherit", cursor: "pointer", padding: 0, textDecoration: "underline" } as const;
const arrowStyle = {
  background: "none", border: "1px solid #46297a", borderRadius: 6, color: "#dcfc05", cursor: "pointer",
  font: "700 16px/1 var(--font-dm-sans), sans-serif", width: 24, height: 24, padding: 0,
} as const;
const fieldStyle = { background: "#220e43", border: "1px solid #46297a", borderRadius: 6, color: "#fef9ef", font: "inherit", padding: "5px 8px", minWidth: 0 } as const;

/** One collapsible block of the panel: the title says what it changes, the hint says exactly what moves. */
function Section({ id, title, hint, open, onToggle, children }: { id: string; title: string; hint: string; open: boolean; onToggle: (id: string) => void; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid #46297a", marginTop: 8, paddingTop: 6 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(open ? "" : id)}
        style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: 0, color: "#fef9ef", font: "inherit", cursor: "pointer", padding: 0 }}
      >
        <span style={{ color: "#dcfc05" }}>{open ? "▾" : "▸"} {title}</span>
        <span style={{ display: "block", color: "#cfc6da", fontWeight: 500, fontSize: 12, marginLeft: 14 }}>{hint}</span>
      </button>
      {open && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export default function DesignVersions() {
  const [open, setOpen] = useState(true);
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [current, setCurrent] = useState(""); // id of the saved version last loaded or saved
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [playing, setPlaying] = useState(false); // viewing the saved versions with the panel out of the way
  const [playIdx, setPlayIdx] = useState(0);
  const [label, setLabel] = useState("");
  const [hidden, setHidden] = useState(false); // the "Hide" button hides the whole panel for a few seconds
  const [sec, setSec] = useState("home"); // which section is expanded (one at a time keeps the panel short)

  // Reads this browser's saved settings once after mount. It has to happen in an effect (not the initial state) so the
  // first render matches the server's and does not cause a hydration mismatch; this is a dev-only panel.
  useEffect(() => {
    const now = readSettings();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of localStorage after mount
    setS(now);
    applySettings(now);
    setSaved(mergeSaved(readSaved()));
    setOpen(window.location.pathname.startsWith("/design-test")); // elsewhere it starts collapsed so it never covers the page's own buttons
  }, []);

  const change = (next: Settings) => {
    setS(next);
    applySettings(next);
  };
  const choose = (key: string, value: string) => change({ ...s, pick: { ...s.pick, [key]: value } });
  const hero = s.pick.hero!;
  const fig = s.figs[hero] ?? ORIGINAL;
  const setFig = (f: Fig) => change({ ...s, figs: { ...s.figs, [hero]: f } });
  const heroName = HOME.options.find(([v]) => v === hero)?.[1] ?? hero;

  // The small arrows step through the Home page versions only, wrapping around at either end.
  const step = (dir: 1 | -1) => {
    const opts = HOME.options;
    const i = opts.findIndex(([v]) => v === s.pick.hero);
    choose("hero", opts[(i + dir + opts.length) % opts.length]![0]);
  };

  // Saved versions: a copy of every setting above, kept in this browser so it can be loaded again later.
  const writeSaved = (list: Saved[]) => {
    setSaved(list);
    store.set("saved", JSON.stringify(list));
  };
  const flash = (text: string) => {
    setNote(text);
    window.setTimeout(() => setNote(""), 2500);
  };
  const saveNew = () => {
    const entry: Saved = {
      id: String(Date.now()),
      name: name.trim() || `Version ${saved.length + 1}`,
      at: Date.now(),
      settings: JSON.parse(JSON.stringify(s)),
    };
    writeSaved([...saved, entry]);
    setCurrent(entry.id);
    setName("");
    flash(`Saved "${entry.name}"`);
  };
  const load = (id: string) => {
    setCurrent(id);
    const hit = saved.find((v) => v.id === id);
    if (!hit) return;
    // Versions saved before each look kept its own graphic spot stored a single `fig`.
    const old = hit.settings as Settings & { fig?: Fig };
    const next: Settings = JSON.parse(JSON.stringify(old));
    next.pick = { ...DEFAULTS.pick, ...next.pick };
    next.pick.bg = validBg(next.pick.bg!);
    next.sent ??= NO_MOVE;
    next.cta ??= NO_MOVE;
    next.sentSize ??= 1;
    next.logoY ??= 0;
    next.logoX ??= 0;
    next.auth ??= NO_MOVE;
    if (!next.figs) next.figs = old.fig ? { [next.pick.hero!]: old.fig } : {};
    change(next);
  };
  const update = () => {
    if (!current) return;
    writeSaved(saved.map((v) => (v.id === current ? { ...v, at: Date.now(), settings: JSON.parse(JSON.stringify(s)) } : v)));
    flash("Updated");
  };
  const remove = () => {
    if (!current) return;
    writeSaved(saved.filter((v) => v.id !== current));
    setCurrent("");
    flash("Deleted");
  };
  const saveToCode = async () => {
    try {
      const res = await fetch("/api/dev-design-versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(saved) });
      flash(res.ok ? `Saved ${saved.length} to the code (design-versions.json)` : "Could not save to the code");
    } catch {
      flash("Could not save to the code");
    }
  };
  const copyCode = async () => {
    const code = JSON.stringify(s, null, 2);
    try {
      await navigator.clipboard.writeText(code);
      flash("Copied the settings as code");
    } catch {
      flash("Could not copy");
    }
  };

  // Play: the panel goes away, the arrow keys step through the saved versions, and Escape brings the panel back.
  const goTo = (i: number) => {
    const hit = saved[i];
    if (!hit) return;
    setPlayIdx(i);
    load(hit.id);
    setLabel(`${hit.name} (${i + 1}/${saved.length})`);
  };
  const play = () => {
    if (!saved.length) {
      setOpen(true);
      setSec("saved");
      flash("Save a version first, then press play");
      return;
    }
    setPlaying(true);
    const hit = saved[0]!;
    setPlayIdx(0);
    load(hit.id);
    setLabel(`${hit.name} (1/${saved.length})  ·  ← → to browse  ·  Esc to finish`);
  };
  useEffect(() => {
    if (!playing) return;
    const n = saved.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo((playIdx + 1) % n);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo((playIdx - 1 + n) % n);
      } else if (e.key === "Escape") {
        setPlaying(false);
        setLabel("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    if (!label) return;
    const t = window.setTimeout(() => setLabel(""), 3500);
    return () => window.clearTimeout(t);
  }, [label]);

  const hideForAWhile = () => {
    setHidden(true);
    window.setTimeout(() => setHidden(false), HIDE_MS);
  };

  if (hidden) return null;

  // While playing, only a small caption shows (it fades after a few seconds); the panel is gone.
  if (playing) {
    return label ? (
      <div
        aria-live="polite"
        style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 50, background: "rgba(34,14,67,.85)", border: "1px solid #46297a", borderRadius: 999, padding: "6px 14px", font: "600 13px var(--font-dm-sans), sans-serif", color: "#fef9ef" }}
      >
        {label}
      </div>
    ) : null;
  }

  const group = (key: string) => GROUPS.find((g) => g.key === key)!;
  const options = (key: string) => (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 260 }}>
      {group(key).options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={s.pick[key] === value}
          onClick={() => choose(key, value)}
          style={{
            border: "2px solid #dcfc05", borderRadius: 8, padding: "5px 10px", font: "inherit", cursor: "pointer",
            background: s.pick[key] === value ? "#dcfc05" : "transparent", color: s.pick[key] === value ? "#220e43" : "#fef9ef",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const toggle = (key: string, label: string) => (
    <button
      key={key}
      type="button"
      role="switch"
      aria-checked={s.pick[key] === "on"}
      onClick={() => choose(key, s.pick[key] === "on" ? "off" : "on")}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", background: "none", border: 0, color: "#fef9ef", font: "inherit", cursor: "pointer", padding: 0, marginBottom: 6 }}
    >
      <span>{label}</span>
      <span style={{ width: 36, height: 20, borderRadius: 10, background: s.pick[key] === "on" ? "#dcfc05" : "#46297a", position: "relative", flex: "none", transition: "background .15s" }}>
        <span style={{ position: "absolute", top: 2, left: s.pick[key] === "on" ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: s.pick[key] === "on" ? "#220e43" : "#fef9ef", transition: "left .15s" }} />
      </span>
    </button>
  );
  const reset = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} style={{ ...linkStyle, marginTop: 6 }}>
      {label}
    </button>
  );
  const sub = (text: string) => <div style={{ color: "#cfc6da", fontWeight: 500, margin: "8px 0 2px" }}>{text}</div>;

  return (
    <div
      style={{
        position: "fixed", left: 16, bottom: 64, zIndex: 50, background: "#2e1556", border: "1px solid #46297a",
        borderRadius: 12, padding: open ? 12 : 6, font: "600 13px var(--font-dm-sans), sans-serif", color: "#fef9ef",
        boxShadow: "0 8px 24px rgba(0,0,0,.4)", maxHeight: "min(28vh, 240px)", overflowY: "auto", overscrollBehavior: "contain", width: open ? 290 : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <button type="button" aria-label="Previous home page version" onClick={() => step(-1)} style={arrowStyle}>
          ‹
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" onClick={() => setOpen(!open)} style={{ background: "none", border: 0, color: "#dcfc05", font: "inherit", cursor: "pointer", padding: 4 }}>
            {open ? "Versions ▾" : "Versions ▴"}
          </button>
          <button
            type="button"
            onClick={play}
            aria-label="Play saved versions"
            title="Play through your saved versions with the arrow keys"
            style={{ background: "#dcfc05", border: 0, borderRadius: 6, color: "#220e43", font: "700 11px var(--font-dm-sans), sans-serif", cursor: "pointer", padding: "3px 7px" }}
          >
            ▶
          </button>
          <button
            type="button"
            onClick={hideForAWhile}
            title="Hide the panel for 4 seconds"
            style={{ background: "none", border: "1px solid #46297a", borderRadius: 6, color: "#cfc6da", font: "500 11px var(--font-dm-sans), sans-serif", cursor: "pointer", padding: "2px 6px" }}
          >
            Hide 4s
          </button>
        </div>
        <button type="button" aria-label="Next home page version" onClick={() => step(1)} style={arrowStyle}>
          ›
        </button>
      </div>
      {!open && (
        <div style={{ textAlign: "center", color: "#cfc6da", fontWeight: 500, fontSize: 12, paddingBottom: 2 }}>{heroName}</div>
      )}

      {open && (
        <>
          <Section id="saved" title="Saved versions" hint="Save everything below as one look, or load one" open={sec === "saved"} onToggle={setSec}>
            <label htmlFor="saved-pick" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Pick a saved version
            </label>
            <select id="saved-pick" value={current} onChange={(e) => load(e.target.value)} style={{ ...fieldStyle, width: "100%" }}>
              <option value="">{saved.length ? "Pick a saved version…" : "Nothing saved yet"}</option>
              {saved.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <label htmlFor="saved-name" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                Name for the new saved version
              </label>
              <input id="saved-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveNew()} placeholder="Name (optional)" style={{ ...fieldStyle, flex: 1 }} />
              <button type="button" onClick={saveNew} style={{ border: 0, borderRadius: 6, background: "#dcfc05", color: "#220e43", font: "inherit", cursor: "pointer", padding: "5px 10px" }}>
                Save
              </button>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={update} disabled={!current} style={{ ...linkStyle, opacity: current ? 1 : 0.4 }}>
                Update selected
              </button>
              <button type="button" onClick={remove} disabled={!current} style={{ ...linkStyle, opacity: current ? 1 : 0.4 }}>
                Delete
              </button>
              <button type="button" onClick={copyCode} style={linkStyle}>
                Copy as code
              </button>
              <button type="button" onClick={saveToCode} style={linkStyle} title="Writes every saved look into src/data/design-versions.json so it can be committed">
                Save all to code
              </button>
            </div>
            <div aria-live="polite" style={{ minHeight: 16, color: "#cfc6da", fontWeight: 500, marginTop: 4 }}>
              {note}
            </div>
          </Section>

          <Section id="home" title="Home page layout" hint="Picks which layout shows (the ‹ › arrows flip these too)" open={sec === "home"} onToggle={setSec}>
            {options("hero")}
          </Section>

          <Section id="graphic" title="Graphic" hint={`Picks, moves and resizes the big picture. Now: ${heroName}`} open={sec === "graphic"} onToggle={setSec}>
            <Slider id="fig-x" label="Left / right" min={-20} max={45} step={0.5} value={fig.x} shown={`${fig.x}`} onChange={(v) => setFig({ ...fig, x: v })} />
            <Slider id="fig-y" label="Up / down" min={-45} max={45} step={0.5} value={fig.y} shown={`${fig.y}`} onChange={(v) => setFig({ ...fig, y: v })} />
            <Slider id="fig-s" label="Size" min={0.3} max={2.5} step={0.05} value={fig.s} shown={`${Math.round(fig.s * 100)}%`} onChange={(v) => setFig({ ...fig, s: v })} />
            <label htmlFor="art-pick" style={{ display: "block", color: "#cfc6da", fontWeight: 500, margin: "8px 0 2px" }}>
              Picture
            </label>
            <select id="art-pick" value={s.pick.art} onChange={(e) => choose("art", e.target.value)} style={{ ...fieldStyle, width: "100%" }}>
              {group("art").options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {reset("Reset this layout's graphic to original", () => setFig(ORIGINAL))}
          </Section>

          <Section id="sentence" title="Sentence" hint="Moves and resizes the “I’m a … looking for …” text" open={sec === "sentence"} onToggle={setSec}>
            <Slider id="sent-x" label="Left / right" min={-40} max={40} step={0.5} value={s.sent.x} shown={`${s.sent.x}`} onChange={(v) => change({ ...s, sent: { ...s.sent, x: v } })} />
            <Slider id="sent-y" label="Up / down" min={-45} max={45} step={0.5} value={s.sent.y} shown={`${s.sent.y}`} onChange={(v) => change({ ...s, sent: { ...s.sent, y: v } })} />
            <Slider id="sent-size" label="Size" min={0.4} max={3} step={0.05} value={s.sentSize} shown={`${Math.round(s.sentSize * 100)}%`} onChange={(v) => change({ ...s, sentSize: v })} />
            {reset("Reset sentence", () => change({ ...s, sent: NO_MOVE, sentSize: 1 }))}
          </Section>

          <Section id="button" title="Find opportunities button" hint="Moves and resizes the big underlined link on the page" open={sec === "button"} onToggle={setSec}>
            <Slider id="cta-x" label="Left / right" min={-40} max={40} step={0.5} value={s.cta.x} shown={`${s.cta.x}`} onChange={(v) => change({ ...s, cta: { ...s.cta, x: v } })} />
            <Slider id="cta-y" label="Up / down" min={-45} max={45} step={0.5} value={s.cta.y} shown={`${s.cta.y}`} onChange={(v) => change({ ...s, cta: { ...s.cta, y: v } })} />
            <Slider id="btn-size" label="Size" min={0.4} max={4} step={0.05} value={s.btn} shown={`${Math.round(s.btn * 100)}%`} onChange={(v) => change({ ...s, btn: v })} />
            {reset("Reset button", () => change({ ...s, cta: NO_MOVE, btn: 1 }))}
          </Section>

          <Section id="background" title="Background" hint="Original keeps the circle in the top-right corner; the others have none" open={sec === "background"} onToggle={setSec}>
            <label htmlFor="bg-pick" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Background
            </label>
            <select id="bg-pick" value={s.pick.bg} onChange={(e) => choose("bg", e.target.value)} style={{ ...fieldStyle, width: "100%" }}>
              {group("bg").options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Section>

          <Section id="logo" title="Top bar logo" hint="Which logo shows, its size, position and corner. The nav link moves up/down with it" open={sec === "logo"} onToggle={setSec}>
            {options("hdr")}
            <Slider id="logo-size" label="Size" min={0.4} max={4} step={0.05} value={s.size} shown={`${Math.round(s.size * 100)}%`} onChange={(v) => change({ ...s, size: v })} />
            <Slider id="logo-x" label="Left / right" min={-400} max={400} step={1} value={s.logoX} shown={`${s.logoX}`} onChange={(v) => change({ ...s, logoX: v })} />
            <Slider id="logo-y" label="Up / down" min={-60} max={200} step={1} value={s.logoY} shown={`${s.logoY}`} onChange={(v) => change({ ...s, logoY: v })} />
            {sub("Corner")}
            {options("corner")}
            {reset("Reset logo size and position", () => change({ ...s, size: 1, logoY: 0, logoX: 0 }))}
          </Section>

          <Section id="account" title="Sign up / Login buttons" hint="Show or hide the two buttons, move them, and pick their corner" open={sec === "account"} onToggle={setSec}>
            {toggle("auth", "Show them")}
            <Slider id="auth-x" label="Left / right" min={-400} max={400} step={1} value={s.auth.x} shown={`${s.auth.x}`} onChange={(v) => change({ ...s, auth: { ...s.auth, x: v } })} />
            <Slider id="auth-y" label="Up / down" min={-60} max={200} step={1} value={s.auth.y} shown={`${s.auth.y}`} onChange={(v) => change({ ...s, auth: { ...s.auth, y: v } })} />
            {sub("Corner")}
            {options("authcorner")}
            {reset("Reset buttons position", () => change({ ...s, auth: NO_MOVE }))}
          </Section>

          <Section id="other" title="Other top bar links" hint="Extra links next to the logo" open={sec === "other"} onToggle={setSec}>
            {toggle("navlinks", "Find opportunities link")}
            {toggle("devtools", "Dev tools link")}
          </Section>
        </>
      )}
    </div>
  );
}
