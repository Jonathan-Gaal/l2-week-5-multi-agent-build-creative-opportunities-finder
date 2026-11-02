import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { subtypeTokens } from "./typePills.ts";

describe("subtypeTokens", () => {
  it("names only the kinds of the picked pill for a type with several pills", () => {
    assert.deepEqual(subtypeTokens(["open_mics"]), ["event.open_mic"]);
    assert.deepEqual(subtypeTokens(["auditions"]), ["open_call.audition", "open_call.casting_call"]);
  });

  it("a catch-all pill means every kind no other pill names", () => {
    const social = subtypeTokens(["social_events"]);
    assert.ok(social.includes("event.jam") && social.includes("event.dance_night") && social.includes("event.none"));
    assert.ok(!social.includes("event.open_mic") && !social.includes("event.workshop"));
  });

  it("puts no limit on a type when none or all of its pills are picked, or its only pill is", () => {
    assert.deepEqual(subtypeTokens([]), []);
    assert.deepEqual(subtypeTokens(["grants", "fellowships"]), []);
    assert.deepEqual(subtypeTokens(["residencies"]), []);
  });
});
