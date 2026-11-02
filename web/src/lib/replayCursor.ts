/**
 * The cursor shown while a saved run plays itself in the find flow (the demo). It glides to each thing the run picks and
 * pulses where it "clicks". It is a plain element on the page, so it needs no state, and it remembers where it was between
 * pages (sessionStorage) so it carries on from the same spot on the next step.
 */
const KEY = "replayCursor";
const ARROW = '<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l15 9-6.5 1.6L9.6 19z" fill="#d9ff3f" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';

export type ReplayCursor = { move: (x: number, y: number) => void; click: () => void; remove: () => void };

export function makeCursor(): ReplayCursor {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = ARROW;
  Object.assign(el.style, { position: "fixed", left: "0", top: "0", zIndex: "9999", pointerEvents: "none", transition: "transform 700ms cubic-bezier(.4,0,.2,1)", filter: "drop-shadow(0 3px 4px rgba(0,0,0,.45))" });
  const saved = sessionStorage.getItem(KEY)?.split(",").map(Number);
  const at = (x: number, y: number) => `translate(${x - 6}px, ${y - 3}px)`;
  el.style.transform = saved && saved.length === 2 && saved.every(Number.isFinite) ? at(saved[0]!, saved[1]!) : at(window.innerWidth * 0.8, window.innerHeight * 0.85);
  document.body.append(el);
  return {
    move(x, y) {
      el.style.transform = at(x, y);
      sessionStorage.setItem(KEY, `${x},${y}`);
    },
    click() {
      const r = document.createElement("div");
      const [x, y] = (sessionStorage.getItem(KEY) ?? "0,0").split(",").map(Number);
      Object.assign(r.style, { position: "fixed", left: `${x! - 18}px`, top: `${y! - 18}px`, width: "36px", height: "36px", borderRadius: "50%", border: "3px solid #d9ff3f", zIndex: "9998", pointerEvents: "none", opacity: "0.9", transition: "transform 450ms ease-out, opacity 450ms ease-out" });
      document.body.append(r);
      requestAnimationFrame(() => Object.assign(r.style, { transform: "scale(2.2)", opacity: "0" }));
      window.setTimeout(() => r.remove(), 500);
    },
    remove() {
      el.remove();
    },
  };
}
