// The card countdown must track the same date the Filter uses for expiry, so it never implies an application is
// still open when its deadline has passed (a future event date must not drive an application's countdown).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Opportunity } from "@api/types";
import { publicCaveat, toCard } from "./cards.ts";
import type { Labels } from "./taxonomy.ts";

const labels: Labels = { place: (p) => p, type: (t) => t, discipline: (d) => d };

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  title: "X", org: null, type: "open_call", subtype: null, place: "brooklyn", location: null,
  deadline: "2026-12-01", event_dates: null, recurrence: null, fee: "none", award: null,
  eligibility: "Eligibility not stated", source: "test", source_url: "https://e.org/x",
  label: "Checked 2026-10-27", caveat: null, dedupe_key: "k", ...over,
});

describe("toCard countdown tracks the type's own relevant date", () => {
  it("an application with a passed deadline shows no countdown, even with a future event date", () => {
    // deadline 2026-10-28 is before asOf 2026-10-29: the application is closed, so no "closes in N days",
    // and the shown date stays the passed deadline — the two can no longer disagree.
    const card = toCard(opp({ type: "open_call", deadline: "2026-10-28", event_dates: ["2026-12-01"] }), "2026-10-29", labels);
    assert.equal(card.closesIn, null);
    assert.equal(card.deadline, "Oct 28, 2026");
  });

  it("an application counts down to its own deadline", () => {
    const card = toCard(opp({ type: "grant", deadline: "2026-11-05", event_dates: null }), "2026-11-01", labels);
    assert.equal(card.closesIn, 4);     // 2026-11-01 -> 2026-11-05
  });

  it("an event counts down to its next upcoming occurrence", () => {
    const card = toCard(opp({ type: "event", deadline: "2026-10-28", event_dates: ["2026-11-03", "2026-12-01"] }), "2026-11-01", labels);
    assert.equal(card.closesIn, 2);     // next occurrence 2026-11-03
  });
});

describe("publicCaveat shows only notes written for readers", () => {
  it("hides research notes and file paths", () => {
    for (const c of ["Quotes checked against the official notice text from the SAM.gov API (noticedesc).",
      "Primary class lists $15 general admission and member discount; verify selected date and booking.", null]) {
      assert.equal(publicCaveat(c), null, String(c));
    }
  });

  it("rewords the friendly ones", () => {
    assert.equal(publicCaveat("Listing last updated 2025-08-01; confirm with the venue."), "Last updated Aug 1, 2025; confirm with the venue.");
    assert.equal(publicCaveat("Badslava listings are community-maintained ('Call Before You Haul!'); confirm with the venue."), "From a community-kept list; confirm with the venue.");
    assert.equal(publicCaveat("Pay is not stated on the listing."), "Pay is not stated on the listing.");
  });

  it("keeps what a reader needs from the research notes, in plain words", () => {
    assert.equal(publicCaveat("From Mara's backfill on 2026-10-27 (Craigslist); not rechecked because Craigslist's terms don't allow automated checks."),
      "Posted on Craigslist by an individual. Be careful before sharing personal details or paying anyone.");
    assert.equal(publicCaveat("From Mara's backfill on 2026-10-27 (Playbill); not rechecked because Playbill's robots.txt blocks it."), null);
    assert.equal(publicCaveat("Found via Mara's backfill (Dance/NYC listing)."), null);
    assert.equal(publicCaveat("Discovered on organizer calendar; confirm exact date, cost and registration. Parent evidence: data/research/x.txt."), "Confirm the exact date, cost and sign-up with the organizer.");
    assert.equal(publicCaveat("Age16+; materials provided. Signups begin January13; confirm seat availability."), "Age16+; materials provided. Signups begin January13; confirm seat availability.");
  });

  it("the card carries the public note, not the stored one", () => {
    assert.equal(toCard(opp({ caveat: "Quotes checked against the SAM.gov API." }), "2026-11-01", labels).caveat, null);
  });
});
