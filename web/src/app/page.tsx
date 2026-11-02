import Image from "next/image";
import Link from "next/link";
import meta from "@/data/meta.json";
import LandingDesign from "@/components/LandingDesign";
import MadLibsHero from "@/components/MadLibsHero";
import s from "./Landing.module.css";

/**
 * The home page: the animated sentence in the "Final 4" look (src/lib/finalFour.ts) on the first screen, then what an
 * artist wants to know before signing up: how it works and how far to trust a result. The find steps are not repeated here.
 */
/** "1526" becomes "1,500+" and "126" becomes "120+": honest round numbers a visitor can take in. */
const roundDown = (n: number, to: number) => `${(Math.floor(n / to) * to).toLocaleString("en-US")}+`;

/** Bits of confetti around the happy figure: [left %, top %, colour, turn]. */
const CONFETTI: [number, number, string, number][] = [
  [8, 14, "var(--pink)", 20], [20, 4, "var(--lime)", -30], [34, 12, "var(--paper)", 50], [62, 2, "var(--pink)", -15], [80, 8, "var(--lime)", 35],
  [92, 20, "var(--paper)", -45], [4, 44, "var(--lime)", 60], [95, 52, "var(--pink)", 10], [14, 70, "var(--paper)", -25], [88, 78, "var(--lime)", 40],
];

export default function Home() {
  return (
    <>
      <LandingDesign />
      <MadLibsHero fixedArt="globe-nyc" />

      <div className="wrap">
        <p className={s.proof}>
          <b>{roundDown(meta.recordCount, 100)} opportunities</b>
          <i aria-hidden="true">·</i>
          from <b>{roundDown(meta.sourceCount, 10)} sources</b> across NYC, the tri-state area and beyond
        </p>

        <section className={s.section} aria-labelledby="why">
          <div className={s.story}>
            <div className={s.stuck} aria-hidden="true">
              <Image src="/brand/musician-before.png" alt="" width={1536} height={1024} className={s.photo} />
              <span className={`pill pill-grey ${s.scrap}`} style={{ left: "3%", top: "5%", ["--r" as string]: "-8deg" }}>Link expired</span>
              <span className={`pill pill-grey ${s.scrap}`} style={{ left: "27%", top: "18%", ["--r" as string]: "5deg" }}>Who can apply?</span>
              <span className={`pill pill-grey ${s.scrap}`} style={{ right: "3%", top: "9%", ["--r" as string]: "7deg" }}>Closed in March</span>
              <span className={`pill pill-grey ${s.scrap}`} style={{ right: "3%", top: "50%", ["--r" as string]: "-6deg" }}>Deadline: ???</span>
            </div>
            <div>
              <p className={s.kicker}>Why Artist Atlas</p>
              <h2 id="why" className={s.title}>
                The calls are out there. <em>Finding them is the weight.</em>
              </h2>
              <ul className={s.problems}>
                <li><span><b>Scattered</b> across hundreds of sites</span></li>
                <li><span><b>Closed</b> listings and <b>buried</b> deadlines</span></li>
                <li><span><b>Eligibility</b> hidden in the fine print</span></li>
              </ul>
            </div>
          </div>
        </section>

        <section className={s.section} aria-labelledby="how">
          <p className={s.kicker}>How to use it</p>
          <h2 id="how" className={s.title}>
            Three steps, <em>then your list.</em>
          </h2>
          <ol className={s.steps}>
            <li className={s.shot}>
              <div className={s.win} aria-hidden="true">
                <div className={s.winBar}><i /><i /><i /></div>
                <div className={s.winBody}>
                  <div className={s.pills}>
                    {[["on", 74], ["", 58], ["on", 88], ["", 66], ["", 80], ["on", 60], ["", 70]].map(([on, w], i) => (
                      <span key={i} className={on ? s.on : undefined} style={{ width: w as number }} />
                    ))}
                  </div>
                </div>
              </div>
              <h3>
                Say what <b>you make</b>
              </h3>
              <p>Pick every kind of artist you are, then the kinds of opportunities you want.</p>
            </li>
            <li className={s.shot}>
              <div className={s.win} aria-hidden="true">
                <div className={s.winBar}><i /><i /><i /></div>
                <div className={s.winBody}>
                  <svg viewBox="0 0 220 120" width="100%" height="100%">
                    <path d="M30 16l40-8 22 22-8 34-36 14-24-26z" fill="#46297a" />
                    <path d="M96 34l42-14 24 30-14 38-46 4-10-30z" fill="#fd1a99" />
                    <path d="M166 48l30 6 6 30-28 18-18-26z" fill="#46297a" />
                    <path d="M60 80l30-4 8 30-34 10z" fill="#3a2060" />
                  </svg>
                </div>
              </div>
              <h3>
                Choose <b>where</b>
              </h3>
              <p>Tap the map: one borough, a few, all of NYC, or the wider region.</p>
            </li>
            <li className={s.shot}>
              <div className={s.win} aria-hidden="true">
                <div className={s.winBar}><i /><i /><i /></div>
                <div className={s.winBody}>
                  <div className={s.rows}>
                    {["Verified", "Verified", "Soon"].map((tag, i) => (
                      <div key={i}>
                        <span><em /><em /></span>
                        <u>{tag}</u>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <h3>
                Get a list <b>that fits</b>
              </h3>
              <p>Open listings only, best matches first, with a pin on the map for each.</p>
            </li>
          </ol>
        </section>

        <section className={s.section} aria-labelledby="trust">
          <div className={s.trust}>
            <div>
              <p className={s.kicker}>What you get</p>
              <h2 id="trust" className={s.title}>
                A short list, <em>with proof for each one.</em>
              </h2>
              <p className={s.lead}>
                Every result shows the opportunity, deadline and who can apply, with a link to the source and a tag for how far we checked it.
              </p>
            </div>
            <ul className={s.badges}>
              <li>
                <span className={s.sourceLink}>View the listing ↗</span>
                <p>Every result links to the page it came from, so you apply at the source.</p>
              </li>
              <li>
                <span className="pill pill-lime">Verified</span>
                <p>We checked this listing, and it held up. Each result shows the day we checked.</p>
              </li>
              <li>
                <span className={`pill pill-plain ${s.onDark}`}>Partly verified</span>
                <p>We checked some of it, not all. Confirm the rest with the source.</p>
              </li>
              <li>
                <span className="pill pill-grey">Not verified</span>
                <p>We haven&apos;t checked this one. Confirm with the source first.</p>
              </li>
            </ul>
          </div>
        </section>

        <section className={s.end} aria-labelledby="go">
          <div className={s.happy} aria-hidden="true">
            <Image src="/brand/gig-confirmed-clean.png" alt="" width={1536} height={1024} className={s.photo} />
            {CONFETTI.map(([x, y, c, r], i) => (
              <i key={i} className={s.confetti} style={{ left: `${x}%`, top: `${y}%`, background: c, transform: `rotate(${r}deg)`, animationDelay: `${i * 0.15}s` }} />
            ))}
            <span className={s.bubble}>I got the gig!</span>
          </div>
          <p className={s.kicker}>From stuck to booked</p>
          <h2 id="go">
            Ready to find <em>your next creative opportunity?</em>
          </h2>
          <div className={s.row}>
            <Link className="btn btn-ghost" href="/login">Let&apos;s go →</Link>
          </div>
        </section>
      </div>
    </>
  );
}
