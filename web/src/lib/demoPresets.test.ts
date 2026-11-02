import { test } from "node:test";
import assert from "node:assert/strict";
import { demoKey, demoPreset } from "./demoPresets.ts";

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
