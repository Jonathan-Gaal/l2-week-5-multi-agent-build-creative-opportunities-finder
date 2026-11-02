import { test } from "node:test";
import assert from "node:assert/strict";
import { demoKey, demoPreset, replaySession, replayStart } from "./demoPresets.ts";

test("current demo identification ignores pagination and selection order", () => {
  assert.equal(demoKey("/results?d=writing,visual&s=open_calls&p=brooklyn&pg=2&replay=1"), demoKey("/results?p=brooklyn&d=visual,writing&s=open_calls"));
});

test("tri-state shortcut and the real flow's expanded places identify the same replay", () => {
  assert.equal(demoPreset("/results?d=writing,visual&s=open_calls&p=tristate")?.name, "Sam · Art & writing across the tri-state");
});

test("only the three chosen searches appear as presentation presets", () => {
  assert.equal(demoPreset("/results?d=theater&s=auditions&p=manhattan")?.name, "Alex · Manhattan auditions");
  assert.equal(demoPreset("/results?d=poet&s=open_calls,residencies&p=staten_island")?.name, "Jordan · Poetry on Staten Island");
  assert.equal(demoPreset("/results?d=poet&s=open_mics&p=staten_island"), undefined);
});

test("a second replay starts empty and carries only its own completed steps", () => {
  const target = { d: ["visual", "writing"], s: ["open_calls"] };
  assert.deepEqual(replayStart("discipline", target), { d: [], s: [], p: [] });
  assert.deepEqual(replayStart("type", target), { d: ["visual", "writing"], s: [], p: [] });
  assert.deepEqual(replayStart("place", target), { d: ["visual", "writing"], s: ["open_calls"], p: [] });
});

test("starting the same demo again creates a distinct navigation while preserving its target", () => {
  const href = "/find/discipline?replay=1&rd=theater&rs=auditions&rp=manhattan";
  assert.notEqual(replaySession(href, "first"), replaySession(href, "second"));
  assert.equal(new URL(replaySession(href, "second"), "http://demo").searchParams.get("rd"), "theater");
});
