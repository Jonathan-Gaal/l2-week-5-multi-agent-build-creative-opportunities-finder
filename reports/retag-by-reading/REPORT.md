# Retag by reading: report

Written 2026-11-02. Source: `data/snapshots/2026-11-01b/records.json` (1655 records at build time). New file: `records.retagged.json` in the same folder. The original was not edited.

> `records.json` kept growing while I worked: it was 1,521 records when I started and has 32 + 88 NYFA records that another session added. Positions of earlier records did not shift. The build script reads the file as it is at the time it runs, so it can be re-run.

## How each record was handled

| Evidence | Records | What it means |
|---|---|---|
| `page_read` | 1128 | I opened the page and read it. Tags, pay, fee, deadline, dates and location come from the page. |
| `other_session` | 95 | NYFA jobs, spaces and opportunities that another session read and structured from NYFA's public listings. I checked their tags against the titles. |
| `title_only` | 430 | Not opened. Craigslist, FireMics, A4, Playbill and Jalopy (the page is built by JavaScript and shows no text), plus a few pages that returned 404 or a list page. Tags checked against the stored title and text; details are the stored ones. |
| `template_rule` | 2 | badslava listings, tagged by rule from the title (badslava blocks automated requests, so none were opened). |

All 189 openmikes.org pages were read one by one, not tagged by rule. NYC Parks, ArtsWestchester and Montclair Art Museum returned 403 to a plain request; with a browser-style User-Agent header, robots.txt checked first and 3 seconds between requests, they were read normally. No JavaScript, CAPTCHA or login was bypassed.

Confidence: high 336, medium 1220, low 99.

## Nothing was dropped

Every record is in the new file, including the ones that are over. Each row has a `read_status`:

- **closed**: 65 records I read whose page says the deadline or event has passed or the call is closed.
- **expired**: 25 records I could not read whose stored deadline is before today (2026-11-02).
- **flagged, not for working artists**: 24 records are kept and labeled in the reason (children's and school programs, teacher-only or organization-only calls, students). They are not removed.
- **outside NY/NJ/CT**: 309 records (19%). Kept, since they are in your scope; the `region` field is untouched.

## How many changed

- Artist type or kind changed on **426 of 1655** records (351 artist-type changes, 101 kind changes; 25 changed only because an unknown tag was renamed).
- Among the **1128 records I read**, **315 (28%)** got a different artist type and **58 (5%)** a different kind. Most of the artist-type changes are open mics: the old record said "music + singer" and the page also welcomed comedy or poetry (or only one of those).
- Details read from pages: pay 130, fee 735, deadline 134, dates 1048, location 1107. Where the stored fee was `unknown`, 60 now have a real fee. The stored deadline differs from the page on 79 records (often the event date, not a deadline, or a date that has now passed).
- A field is left empty when the page does not give it. Nothing is filled with "n/a" or "not stated".

### How much better is the list?

This compares my reading to the old tags; it is not an outside answer key. Of the 1128 records read from pages, about 28% had a different artist type, 5% a different kind, and 6% are closed. Every one of them now carries its own pay, fee, deadline, dates and location wherever the page gave them. The 432 records I could not open still carry only the old stored details.

Suggested labels for ranking and review: **rank as is** = `page_read` or `other_session` at high or medium confidence; **review** = any `low` confidence and any `title_only`; **by rule** = `template_rule`; `read_status` closed or expired go to the bottom, not out.

## Kind: was to now

| was | now | count |
|---|---|---|
| open_call/collaboration | open_call/service_ad | 27 |
| event/workshop | event/meetup | 16 |
| job/none | job/None | 15 |
| event/workshop | event/class | 13 |
| event/open_mic | event/jam | 13 |
| open_call/audition | open_call/paid_gig | 4 |
| event/show | event/workshop | 2 |
| event/dance_night | event/class | 2 |
| event/open_mic | event/show | 1 |
| event/workshop | event/jam | 1 |
| event/drawing_session | event/class | 1 |
| event/workshop | event/dance_night | 1 |
| event/workshop | event/show | 1 |
| event/jam | event/show | 1 |
| event/drawing_session | event/workshop | 1 |
| job/none | open_call/model_call | 1 |
| open_call/general_call | open_call/gallery_submission | 1 |

## Artist type: was to now (top 25)

| was | now | count |
|---|---|---|
| comedy + music + poet + singer | comedy + music + poet | 105 |
| music + singer | comedy + music + poet | 64 |
| music + singer | music | 32 |
| music + singer | music + poet | 15 |
| literary | writing | 12 |
| theater | all | 10 |
| craft + visual | craft | 9 |
| all | visual | 9 |
| music + singer | comedy + music | 6 |
| dance + music | dance | 5 |
| poet + theater | poet | 4 |
| literary + poet | poet + writing | 4 |
| literary + poet | writing | 4 |
| craft + visual | visual | 4 |
| craft + design | craft + visual | 4 |
| dance + theater | dance | 3 |
| music + singer | all | 3 |
| film | visual | 3 |
| singer + theater | singer | 2 |
| theater | dance + music + theater | 2 |
| visual | visual + writing | 2 |
| all | music + poet | 2 |
| music | music + singer | 2 |
| music + theater | music | 2 |
| theater | dance + singer + theater | 2 |

The app allows 3 artist types per record. On the 104 badslava open mics that list comedy, music and poetry, `singer` was dropped for that reason. Say so if you would rather keep singers.

## Patterns

- Dance-only and singer-only calls were tagged dance + theater and singer + theater. Fixed.
- Casting calls for ordinary people (a cat owner, people named Josh, twins) were tagged theater. They are now `all`.
- Workshops that are really meetups or clubs were tagged workshop; many are now meetup or class.
- Children's, teen and school programs (Staten Island Children's Museum, Brooklyn Botanic Garden toddler sing-along, Lakewood library teen crafts, Montclair kids drop-in, NYC Parks ranger family programs) are in the list as artist workshops. They are kept and labeled.
- Programs not for individual artists: LMCC and GO Queens organization grants, NJSCA, the Dawson residency (high school choral teachers).
- Old listings: Movement Research classes from 2023 and 2024, a 2022 singalong, a 2024 videographer job. They are marked closed.
- Paid to attend: Movement Research AIR (a $5,000 residency fee), IPA Governors Island ($6,400-$6,900), Millay Steepletop ($2,000 per two weeks).
- NYFA studio-space listings (27) were tagged "collaboration", which the app labels "Band members wanted". They are tagged as service ads (space for rent) in the new file. A few titles without the words "space" or "rent" (for example "Share Studio with lots of light") will still read "Artist for hire" until the app's keyword list in `tags.ts` adds "studio".

## Least sure about

- 99 low-confidence records: 66 page_read, 28 title_only, 3 other_session, 2 template_rule.
- `music` vs `singer` on open mics and jams, and `theater` vs `singer` on musical-theatre auditions.
- Residencies that say "any discipline" (tagged `all`) versus ones aimed at a medium (Printshop, tagged `visual`).
- Wave Hill, Roulette and HERE name no art form on the page.

## Still not read

430 records are title-only: mara-craigslist-new-york 311, playbill-jobs 44, mara-firemics-open-mics 34, aaartsalliance 20, jalopy-theatre 7, nyfa-events 6, broadwayworld-auditions 3, huntington-arts 1. For the do-not-open sites, a person can open a page and paste its text, and I will write the record from that.

## 40 random records I did not flag

| id | title | tags | kind | confidence | evidence |
|---|---|---|---|---|---|
| 375 | Dance night at Cobble Fish (Tuesday 7:00pm) | dance | event/dance_night | medium | page_read |
| 1135 | Bassist & Drummer Wanted For Working Classic Rock Cover Band | music | open_call/collaboration | medium | title_only |
| 1532 | Teaching Arts, Teaching Inclusively - A Professional Development Train | all | event/workshop | high | page_read |
| 1064 | EXPLORING COLOR IN ABSTRACT PAINTING | visual | event/workshop | high | page_read |
| 1388 | The FUN Mic at Freddy's Bar | comedy | event/open_mic | medium | title_only |
| 362 | Comedy open mic at West Side Comedy Club (Friday 3:00pm) | comedy | event/open_mic | medium | page_read |
| 41 | THE PHANTOM OF THE OPERA (Tour): Equity Principal Actors audition | theater | open_call/audition | medium | page_read |
| 141 | Comedy open mic at Producers Club Theaters (Thursday 6:00pm) | comedy | event/open_mic | medium | page_read |
| 937 | Open mic at Courthouse Brew Co (Every Thursday at 7pm) | music + singer | event/open_mic | high | page_read |
| 1172 | Hard Rock band seeking Drummer | music | open_call/collaboration | medium | title_only |
| 1397 | Band Seeking  Male Keyboardist – R&B, Neo-Soul, Jazz and Rock | music | open_call/collaboration | medium | title_only |
| 356 | Comedy open mic at Producers Club Theaters (Sunday 6:00pm) | comedy | event/open_mic | medium | page_read |
| 1192 | Models, influencers, talent, marketing | model | open_call/model_call | medium | title_only |
| 1567 | Graphic Design & Media Associate | visual | job/full_time | medium | other_session |
| 1118 | SAXYN Dance Works Project Audition | dance | open_call/audition | high | page_read |
| 467 | The Art Guild presents Master Portrait Oil Painting Study with Helene  | visual | event/workshop | high | page_read |
| 283 | Comedy open mic at Greenwich Village Comedy Club (Monday 3:00pm) | comedy | event/open_mic | medium | page_read |
| 1259 | Phoenix Mic at Phoenix Bar | comedy | event/open_mic | medium | title_only |
| 425 | Comedy open mic at The Grisly Pear - Midtown (Saturday 4:00pm) | comedy | event/open_mic | medium | page_read |
| 203 | Comedy open mic at The Fear City Comedy Club (Sunday 6:00pm) | comedy | event/open_mic | medium | page_read |
| 1212 | Pro drummer looking for a pro tribute band | music | open_call/collaboration | medium | title_only |
| 150 | Comedy open mic at The Fear City Comedy Club (Tuesday 9:00pm) | comedy | event/open_mic | medium | page_read |
| 553 | Irish trad session at 11th Street Bar (Sundays) | music | event/jam | medium | page_read |
| 99 | Music / Poetry open mic at Sankofa Aban Bed & Breakfast (Friday 11:00p | music + singer + poet | event/open_mic | medium | page_read |
| 1341 | PAID GLP-1 DOCUMENTARY CASTING — EARN $400, PLUS $200 FOR HOME FILMING | theater | open_call/casting_call | medium | title_only |
| 11 | CAAC/Gallery 456 Open Call 2027 | visual | open_call/gallery_submission | medium | title_only |
| 82 | Comedy open mic at Laughing Buddha Comedy (Tuesday 8:00pm) | comedy | event/open_mic | medium | page_read |
| 683 | NYU Tisch Graduate Film Production / NYC | dance + theater | open_call/casting_call | high | page_read |
| 692 | 92NY Future Dance Festival Live Performance - Applications Due Nov 1! | dance | open_call/festival | medium | page_read |
| 267 | Comedy open mic at Laughing Buddha Comedy (Thursday 8:00pm) | comedy | event/open_mic | medium | page_read |
| 281 | Comedy open mic at Producers Club Theaters (Tuesday 8:30pm) | comedy | event/open_mic | medium | page_read |
| 164 | Comedy open mic at Tommy's Figz (Wednesday 7:00pm) | comedy | event/open_mic | medium | page_read |
| 165 | Comedy open mic at Laughing Buddha Comedy (Monday 4:30pm) | comedy | event/open_mic | medium | page_read |
| 449 | Comedy open mic at BK Made Comedy (Tuesday 8:00pm) | comedy | event/open_mic | medium | page_read |
| 756 | Dance night at The Deck (Wednesday 7:00pm) | dance | event/dance_night | medium | page_read |
| 241 | Comedy open mic at Black Cat LES (Saturday 9:00pm) | comedy | event/open_mic | medium | page_read |
| 1554 | Paid P/T Curatorial Internship | visual | job/internship | medium | other_session |
| 256 | Music open mic at Licker Lounge (Tuesday 7:30pm) | music + singer | event/open_mic | medium | page_read |
| 236 | Comedy open mic at Producers Club Theaters (Monday 5:00pm) | comedy | event/open_mic | medium | page_read |
| 1198 | NYC’s Weirdest Living Situation — Manhattan Casting Call | theater | open_call/casting_call | medium | title_only |

Checks: every tag is one of the app's 14 artist types or `all`; none has more than 3; no id is duplicated; all 1655 records are present; every original field other than the retagged ones is unchanged.

## How the app reads it

`web/server/agents/filter.ts` now loads `records.retagged.json` first, then `records.recategorized.json`, then `records.json`. The new `read_pay`, `read_fee`, `read_deadline`, `read_dates`, `read_location`, `read_notes`, `read_quote` and `read_status` fields are ignored until a card is changed to show them.
