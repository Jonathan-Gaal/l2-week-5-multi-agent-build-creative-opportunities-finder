import look from "@/data/final-four.json";

/**
 * "Final 4": the look picked in the dev Versions panel for the landing page, fixed here so it does not depend on the panel
 * or on anything saved in a browser. The numbers live in src/data/final-four.json (the panel's "Copy as code" output).
 * The same values are applied three ways: an inline script in the page head (so the first paint is already right),
 * LandingDesign (for navigating to the page without a reload), and the dev panel itself, which shows them on "/".
 */
export const FINAL4 = look;

/**
 * The logo and Login / Sign up nudges were tuned on a wide screen, out past the edges of the page content. On a narrower window the
 * same pixels would push them off the screen, so they are capped to leave about 8px of room (identical on a wide screen).
 */
const room = "max(0px, (100vw - 1080px) / 2) + 8px";
const nudgeLeft = (px: number) => `max(${px}px, calc(-1 * (${room})))`;
const nudgeRight = (px: number) => `min(${px}px, calc(${room}))`;

/** The up/down nudges were tuned in "vh" on a 1905 x 920 window. In "vw" they scale with the width like everything else on the home page, so the picture never slides against the sentence. */
const vw = (vh: number) => `${Math.round(vh * 0.483 * 100) / 100}vw`;

const fig = (look.figs as Record<string, { x: number; y: number; s: number }>)[look.pick.hero] ?? { x: 0, y: 0, s: 1 };

/** Attributes put on <html>, which the CSS keys off (data-hero, data-bg, data-hdr and so on). */
export const FINAL4_ATTRS: Record<string, string> = { ...look.pick };

/** CSS variables put on <html>. */
export const FINAL4_VARS: Record<string, string> = {
  "--logo-scale": String(look.size),
  "--cta-scale": String(look.btn),
  "--fig-x": `${fig.x}vw`,
  "--fig-y": vw(fig.y),
  "--fig-scale": String(fig.s),
  "--fig-alpha": String(((look as { figAlpha?: number }).figAlpha ?? 100) / 100),
  "--sent-x": `${look.sent.x}vw`,
  "--sent-y": vw(look.sent.y),
  "--cta-x": `${look.cta.x}vw`,
  "--cta-y": vw(look.cta.y),
  "--logo-x": nudgeLeft(look.logoX),
  "--logo-y": `${look.logoY}px`,
  "--auth-x": nudgeRight(look.auth.x),
  "--auth-y": `${look.auth.y}px`,
  "--sent-scale": String(look.sentSize),
  "--sent-wide": `${look.sentWide}vw`,
  "--auth-scale": String(look.authSize),
};

/**
 * The top bar on every other page, designed in the Versions panel on /design-test/site: the full logo in the left corner and
 * plain-text Login (yellow) / Sign up (pink) on the right (look 11), nudged out towards the Back / Next columns.
 */
export const SITE_ATTRS: Record<string, string> = {
  hdr: "full",
  corner: "left",
  authcorner: "right",
  authbtn: "11",
  navlinks: "off",
  devtools: "off",
  auth: "on",
};
// The nudges were tuned on a wide screen: the logo 152px left and the buttons 200px right of the page edges. Those are capped here so
// on a narrower window they never push either one off the screen (the cap keeps about 8px of room).
export const SITE_VARS: Record<string, string> = {
  "--logo-scale": "1.6",
  "--logo-x": nudgeLeft(-152),
  "--logo-y": "11px",
  "--auth-scale": "1.15",
  "--auth-x": nudgeRight(200),
  "--auth-y": "-22px",
};

/** Runs in the <head> before anything paints: the home page gets Final 4, every other page the site top bar. The dev pages are left alone. */
export const finalFourScript = `(function(){try{var p=location.pathname;if(p.indexOf("/design-test")===0||p.indexOf("/dev")===0)return;var d=document.documentElement,home=p==="/",a=home?${JSON.stringify(FINAL4_ATTRS)}:${JSON.stringify(SITE_ATTRS)},v=home?${JSON.stringify(FINAL4_VARS)}:${JSON.stringify(SITE_VARS)};for(var k in a)d.dataset[k]=a[k];for(var n in v)d.style.setProperty(n,v[n]);}catch(e){}})();`;

export function applyFinalFour() {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(FINAL4_ATTRS)) root.dataset[k] = v;
  for (const [k, v] of Object.entries(FINAL4_VARS)) root.style.setProperty(k, v);
}

/** Leaving the home page: the top bar becomes the site one (same logo and buttons, lined up with the page). */
export function clearFinalFour() {
  const root = document.documentElement;
  for (const k of Object.keys(FINAL4_VARS)) root.style.removeProperty(k);
  // the home-only settings (hero layout, background, picture, button look) go; the top bar ones become the site ones
  for (const k of Object.keys(FINAL4_ATTRS)) if (!(k in SITE_ATTRS)) delete root.dataset[k];
  for (const [k, v] of Object.entries(SITE_ATTRS)) root.dataset[k] = v;
  for (const [k, v] of Object.entries(SITE_VARS)) root.style.setProperty(k, v);
}
