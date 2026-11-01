import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TOP_TAGS, subTag, topTag } from "./tags.ts";

const c = (type: string, subtype: string | null, title = "A listing") => ({ type, subtype, title });

describe("topTag", () => {
  it("gives every kind in the data one of the eleven step-two choices", () => {
    const kinds: [string, string | null][] = [
      ["event", "open_mic"], ["event", "workshop"], ["event", "class"], ["event", "drawing_session"], ["event", "jam"], ["event", "dance_night"],
      ["event", "show"], ["event", "meetup"], ["event", "open_studio"], ["event", null], ["grant", "grant"], ["grant", "fellowship"],
      ["residency", "residency"], ["job", "full_time"], ["job", "teaching_artist"], ["job", "internship"], ["open_call", "audition"],
      ["open_call", "casting_call"], ["open_call", "collaboration"], ["open_call", "service_ad"], ["open_call", "paid_gig"],
      ["open_call", "model_call"], ["open_call", "gallery_submission"], ["open_call", "performance_call"], ["open_call", "festival"],
      ["open_call", "general_call"], ["open_call", "competition"], ["open_call", "commission"], ["open_call", "writing_submission"], ["open_call", null],
    ];
    for (const [t, k] of kinds) assert.ok((TOP_TAGS as readonly string[]).includes(topTag(c(t, k))), `${t}/${k}`);
  });

  it("files each kind where the find flow puts it", () => {
    assert.equal(topTag(c("open_call", "casting_call")), "Auditions");
    assert.equal(topTag(c("open_call", "service_ad")), "Collaborations");
    assert.equal(topTag(c("open_call", "model_call")), "Other gigs/Jobs");
    assert.equal(topTag(c("open_call", "commission")), "Submissions/Open calls");
    assert.equal(topTag(c("open_call", "festival")), "Festivals");
    assert.equal(topTag(c("event", "show")), "Social events");
    assert.equal(topTag(c("event", "class")), "Workshops/Classes");
    assert.equal(topTag(c("job", "teaching_artist")), "Other gigs/Jobs");
    assert.equal(topTag(c("grant", "fellowship")), "Fellowships");
  });
});

describe("subTag", () => {
  it("is left off where the top tag already says it", () => {
    for (const [t, k] of [["event", "open_mic"], ["grant", "grant"], ["grant", "fellowship"], ["residency", "residency"], ["open_call", "general_call"]] as const) {
      assert.equal(subTag(c(t, k)), null, `${t}/${k}`);
    }
  });

  it("names the kind in plain words", () => {
    assert.equal(subTag(c("open_call", "performance_call")), "Apply to perform");
    assert.equal(subTag(c("open_call", "collaboration")), "Band members wanted");
    assert.equal(subTag(c("open_call", "casting_call")), "Casting call");
    assert.equal(subTag(c("event", "open_studio")), "Studio tour");
    assert.equal(subTag(c("job", "teaching_artist")), "Teaching job");
  });

  it("splits service ads into lessons and artists for hire by the words in the title", () => {
    assert.equal(subTag(c("open_call", "service_ad", "Bass guitar instruction")), "Lessons");
    assert.equal(subTag(c("open_call", "service_ad", "Drum Teacher")), "Lessons");
    assert.equal(subTag(c("open_call", "service_ad", "***LIVE or ONLINE*** Saxophone LESSONS***")), "Lessons");
    assert.equal(subTag(c("open_call", "service_ad", "Drummer available")), "Artist for hire");
  });

  it("calls a rehearsal or studio space ad Space for rent", () => {
    assert.equal(subTag(c("open_call", "service_ad", "$1000/mo Music Rehearsal / Band Space at Danbro Studios")), "Space for rent");
    assert.equal(subTag(c("open_call", "service_ad", "Brooklyn Rehearsal Space – Monthly Share")), "Space for rent");
    assert.equal(subTag(c("open_call", "service_ad", "Guitarist available, all different styles, current references")), "Artist for hire");   // words that only contain "rent"
  });

  it("tells a festival to attend from a show", () => {
    assert.equal(subTag(c("event", "show", "New York Flow Festival")), "Festival");
    assert.equal(subTag(c("event", "show", "Nature Puppet Show")), "Show");
  });
});
