// The card countdown must track the same date the Filter uses for expiry, so it never implies an application is
// still open when its deadline has passed (a future event date must not drive an application's countdown).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Opportunity } from "@api/types";
import { feeText, friendlyRecurrence, moneyLabel, groupByKind, publicCaveat, toCard, verifiedWording, soonestFirst } from "./cards.ts";
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
    assert.equal(card.deadline, "Oct. 28, 2026");
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
    assert.equal(publicCaveat("Listing last updated 2025-08-01; confirm with the venue."), "Last updated Aug. 1, 2025; confirm with the venue.");
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

describe("verifiedWording", () => {
  it("says verified and writes dates as month, day, year", () => {
    assert.equal(verifiedWording("Checked 2026-10-27"), "Last verified Oct. 27, 2026");
    assert.equal(verifiedWording("Checked 2026-09-05 · not fully checked"), "Last verified Sept. 5, 2026 · not fully verified");
    assert.equal(verifiedWording("Not checked · added without a recheck"), "Not verified · added without re-verifying");
  });
});

describe("friendlyRecurrence", () => {
  it("reads a generated series line plainly and leaves other schedules alone", () => {
    assert.equal(friendlyRecurrence("14 dates through 2026-12-17"), "14 sessions through Dec. 17, 2026");
    assert.equal(friendlyRecurrence("Weekly Wednesday 8:00pm"), "Weekly Wednesday 8:00pm");
    assert.equal(friendlyRecurrence(null), null);
  });
});

describe("groupByKind", () => {
  const c = (title: string, subtype: string, closesIn: number | null) => ({ title, subtype, typeLabel: "Event", closesIn });
  it("groups by kind, soonest date first inside each group, undated last, most urgent group first", () => {
    const groups = groupByKind([c("a", "workshop", null), c("b", "open_mic", 30), c("c", "workshop", 5), c("d", "open_mic", 2), c("e", "jam", null)]);
    assert.deepEqual(groups.map((g) => g.kind), ["Open mic", "Workshop", "Jam"]);
    assert.deepEqual(groups[0]!.cards.map((x) => x.title), ["d", "b"]);
    assert.deepEqual(groups[1]!.cards.map((x) => x.title), ["c", "a"]);
  });
});

describe("moneyLabel", () => {
  it("calls wages pay, residency money a stipend, and grant money an award", () => {
    assert.equal(moneyLabel("open_call", "casting_call"), "Pay");
    assert.equal(moneyLabel("job", "full_time"), "Pay");
    assert.equal(moneyLabel("residency", "residency"), "Stipend");
    assert.equal(moneyLabel("grant", "fellowship"), "Award");
    assert.equal(moneyLabel("open_call", "competition"), "Award");
  });
});

describe("feeText", () => {
  it("always shows a real fee or No fee, whatever the kind", () => {
    assert.equal(feeText("none", "event", "workshop"), "No fee");
    assert.equal(feeText("none", "open_call", "audition"), "No fee");
    assert.equal(feeText("$25 entry", "open_call", "gallery_submission"), "$25 entry");
    assert.equal(feeText("$10 (drink included)", "event", "open_mic"), "$10 (drink included)");
  });

  it("says Fee not listed where a fee is a real question", () => {
    for (const [type, kind] of [["event", "open_mic"], ["event", "workshop"], ["residency", "residency"], ["open_call", "gallery_submission"],
      ["open_call", "festival"], ["open_call", "competition"], ["open_call", "writing_submission"], ["open_call", "general_call"],
      ["open_call", "performance_call"], ["open_call", null]] as const) {
      for (const none of ["unknown", "Fee unknown", null]) assert.equal(feeText(none, type, kind), "Fee not listed", `${type}/${kind}`);
    }
  });

  it("shows nothing where people are paid, cast or funded", () => {
    for (const [type, kind] of [["open_call", "audition"], ["open_call", "casting_call"], ["open_call", "paid_gig"], ["open_call", "collaboration"],
      ["open_call", "model_call"], ["open_call", "commission"], ["job", "full_time"], ["job", "teaching_artist"], ["grant", "grant"], ["grant", "fellowship"]] as const) {
      assert.equal(feeText("unknown", type, kind), null, `${type}/${kind}`);
    }
  });
});

describe("soonestFirst", () => {
  it("puts the nearest date first and undated cards last, keeping the given order between equal dates", () => {
    const cards = [{ id: "a", closesIn: null }, { id: "b", closesIn: 9 }, { id: "c", closesIn: 2 }, { id: "d", closesIn: 9 }, { id: "e" }];
    assert.deepEqual(soonestFirst(cards).map((c) => c.id), ["c", "b", "d", "a", "e"]);
  });
});
