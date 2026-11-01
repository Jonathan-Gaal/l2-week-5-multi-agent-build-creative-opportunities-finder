import meta from "@/data/meta.json";
import DemoButton from "@/components/DemoButton";
import FindLink from "@/components/FindLink";
import LandingDesign from "@/components/LandingDesign";
import MadLibsHero from "@/components/MadLibsHero";
import s from "./Landing.module.css";

/**
 * The home page: the animated sentence in the "Final 4" look (src/lib/finalFour.ts) on the first screen, then what an
 * artist wants to know before signing up: how it works and how far to trust a result. The find steps are not repeated here.
 */
/** "1526" becomes "1,500+" and "126" becomes "120+": honest round numbers a visitor can take in. */
const roundDown = (n: number, to: number) => `${(Math.floor(n / to) * to).toLocaleString("en-US")}+`;

/** "2026-10-27" becomes "Oct 27". */
const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Home() {
  return (
    <>
      <LandingDesign />
      <MadLibsHero fixedArt="globe-nyc" />

      <div className="wrap">
        <p className={s.proof}>
          <b>{roundDown(meta.recordCount, 100)} opportunities</b>
          <i aria-hidden="true">·</i>
          from <b>{roundDown(meta.sourceCount, 10)} sources</b> across NYC and the tri-state area
        </p>

        <section className={s.section} aria-labelledby="how">
          <p className={s.kicker}>How it works</p>
          <h2 id="how" className={s.title}>
            Three taps, <em>then your list.</em>
          </h2>
          <ol className={s.steps}>
            <li className={`${s.step} ${s.lime}`}>
              <span className={s.num}>1</span>
              <h3>Say what you make</h3>
              <p>Pick every kind of artist you are, then the kinds of opportunities you want.</p>
            </li>
            <li className={`${s.step} ${s.pink}`}>
              <span className={s.num}>2</span>
              <h3>Choose where</h3>
              <p>Tap the map: one borough, a few, all of NYC, or the wider region.</p>
            </li>
            <li className={`${s.step} ${s.cream}`}>
              <span className={s.num}>3</span>
              <h3>Get a list that fits</h3>
              <p>Open listings, best matches first, with the award, deadline and who can apply spelled out.</p>
            </li>
          </ol>
        </section>

        <section className={s.section} aria-labelledby="trust">
          <div className={s.trust}>
            <div>
              <p className={s.kicker}>Before you apply</p>
              <h2 id="trust" className={s.title}>
                See where it came from, <em>every time.</em>
              </h2>
              <p className={s.lead}>Listings change. Each result tells you how far to trust it, so you never apply blind.</p>
            </div>
            <ul className={s.badges}>
              <li className={s.lime}>
                <span className={s.badge}>Source link</span>
                <p>Every result links to the page it came from, so you apply at the source.</p>
              </li>
              <li className={s.pink}>
                <span className={s.badge}>Verified {shortDay(meta.snapshotId)}</span>
                <p>We show the day we last verified each listing, so you know how fresh it is.</p>
              </li>
              <li>
                <span className={`${s.badge} ${s.badgeLine}`}>Confirm first</span>
                <p>If we couldn&apos;t verify a listing, we say so. Double-check the details before you apply.</p>
              </li>
            </ul>
          </div>
        </section>

        <section className={s.end} aria-labelledby="go">
          <h2 id="go">
            Ready to find <em>your next one?</em>
          </h2>
          <div className={s.row}>
            <FindLink className="btn">
              Find opportunities
            </FindLink>
            <DemoButton className="btn-ghost" label="See an example list →" />
          </div>
        </section>
      </div>
    </>
  );
}
