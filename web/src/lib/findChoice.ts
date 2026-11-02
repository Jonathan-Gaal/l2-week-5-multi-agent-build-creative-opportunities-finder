import type { MetaResponse } from "@api/types";
import type { Choice } from "@/components/find/FindStep";
import { pickerChoices, pickIds } from "./taxonomy";
import { OLD_PILL_IDS, TYPE_PILL_IDS, pillsForTypes } from "./typePills";

type Params = { [key: string]: string | string[] | undefined };

/**
 * The choices carried in a find page's address: d (disciplines), s (opportunity pills) and p (places), each checked
 * against the real lists. An older link with only t (broad types) is read as every pill of those types.
 */
export function readChoice(q: Params, meta: MetaResponse): Choice {
  const allowed = pickerChoices(meta);
  const d = pickIds(q.d, allowed.disciplines);
  const p = pickIds(q.p, allowed.places);
  let s = [...new Set(pickIds(q.s, new Set([...TYPE_PILL_IDS, ...Object.keys(OLD_PILL_IDS)])).map((id) => OLD_PILL_IDS[id] ?? id))];
  if (!s.length) s = pillsForTypes(pickIds(q.t, allowed.types));
  return { d, s, p };
}
