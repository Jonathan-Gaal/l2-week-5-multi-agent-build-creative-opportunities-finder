import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design test: site top bar | Artist Atlas",
  robots: { index: false, follow: false },
};

/**
 * Design test for the top bar that every page except the home page shares. This is a plain page with a card under a normal
 * (not floating) top bar, like the find steps, so the logo, the Login / Sign up buttons and their alignment can be judged
 * in the Versions panel. Use "Copy as code" in the panel when it looks right. Not linked from the app.
 */
export default function SiteBarTest() {
  return (
    <div className="wrap">
      <div style={{ margin: "28px 0 48px", border: "2px solid var(--plum)", borderRadius: 22, padding: "40px 44px", background: "rgba(46, 21, 86, 0.28)" }}>
        <h1 style={{ font: "900 clamp(34px, 4vw, 48px) / 1.05 var(--serif)", margin: 0 }}>A page under the site top bar</h1>
        <p style={{ margin: "14px 0 0", color: "var(--muted-dk)", maxWidth: "52ch" }}>
          This is a stand-in for the find steps, results, login and sign up. Use the Versions panel to change the logo, its corner and size, and the
          Login and Sign up buttons. The edges of this card show where the bar should line up.
        </p>
      </div>
    </div>
  );
}
