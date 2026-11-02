import assert from "node:assert/strict";
import { test } from "node:test";
import details from "../data/read-details.json" with { type: "json" };
import { withDetails } from "./readDetails.ts";
import type { Card } from "./types.ts";

const card = (key: string, location: string | null): Card => ({ key, location }) as Card;

test("a listing with page details gets them, and a place the card already shows is left out", () => {
  const key = Object.keys(details).find((k) => (details as Record<string, { where?: string }>)[k].where)!;
  assert.ok(withDetails(card(key, null)).read?.where);
  assert.equal(withDetails(card(key, "Shown already")).read?.where, undefined);
});

test("a listing with no page details is returned as it is", () => {
  const c = card("no such listing", null);
  assert.equal(withDetails(c), c);
});
