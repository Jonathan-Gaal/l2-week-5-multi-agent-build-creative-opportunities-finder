// The card countdown must track the same date the Filter uses for expiry, so it never implies an application is
// still open when its deadline has passed (a future event date must not drive an application's countdown).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Opportunity } from "@api/types";
import { toCard } from "./cards.ts";
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
