import Image from "next/image";
import Link from "next/link";
import meta from "@/data/meta.json";

export default function Intro() {
  return (
    <div className="wrap">
      <section className="hero">
        <div className="stack">
          <span className="eyebrow">NYC · tri-state · open calls, grants, residencies, events, jobs</span>
          <h1>
            Your next gig is already out there. <em>Let&apos;s find it.</em>
          </h1>
          <p className="lead">
            Artist Atlas reads listings from across New York and the region, ranks them for the kind of artist you are, and has a second
            AI double-check the list. Every result shows where it came from and when we last checked.
          </p>
          <div className="cta-row">
            <Link href="/find" className="btn">
              Find my opportunities
            </Link>
            <a href="#how" className="btn btn-ghost">
              How it works
            </a>
          </div>
        </div>
        <div className="hero-art">
          <Image src="/brand/logo.png" alt="Artist Atlas: an NYC figure holding up a pink globe" width={300} height={434} priority />
        </div>
      </section>

      <div className="stats" aria-label="What is in the snapshot">
        <div className="stat">
          <b>{meta.recordCount.toLocaleString()}</b>
          <span>listings</span>
        </div>
        <div className="stat">
          <b>{meta.sourceCount}</b>
          <span>sources</span>
        </div>
        <div className="stat">
          <b>{meta.snapshotId}</b>
          <span>snapshot date</span>
        </div>
      </div>

      <section className="section" id="how">
        <h2>Three questions, then your list</h2>
        <div className="grid3">
          <div className="panel">
            <span className="step-num">1</span>
            <h3>Tell us about you</h3>
            <p>What you make (pick as many as you like), what you&apos;re looking for, and where: one borough, a few, all of NYC, or the tri-state area.</p>
          </div>
          <div className="panel">
            <span className="step-num">2</span>
            <h3>We rank what&apos;s open</h3>
            <p>Expired and incomplete listings are dropped first. Then the best fits come to the top, with the award, deadline and eligibility spelled out.</p>
          </div>
          <div className="panel">
            <span className="step-num">3</span>
            <h3>A second check</h3>
            <p>A reviewer looks over the ranking and can send it back. You can open any result list and see how it got there.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>We show you how much to trust each result</h2>
        <div className="panel trust-list">
          <div>
            <span className="pill pill-lime">Checked 2026-10-27</span> We read the listing on its own page on that date.
          </div>
          <div>
            <span className="pill pill-plain">Checked · not fully checked</span> We read it, but the reviewer hasn&apos;t signed off on this list.
          </div>
          <div>
            <span className="pill pill-grey">Not checked</span> Collected by a teammate from a site we can&apos;t recheck. Confirm before you apply.
          </div>
        </div>
      </section>

      <section className="section" style={{ textAlign: "center" }}>
        <h2>Ready?</h2>
        <p className="muted-dk" style={{ margin: "8px 0 24px" }}>It takes about a minute.</p>
        <Link href="/find" className="btn">
          Find my opportunities
        </Link>
      </section>
    </div>
  );
}
