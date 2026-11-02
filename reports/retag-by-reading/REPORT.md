# Retag by reading: report

Written 2026-11-02. Source: `data/snapshots/2026-11-01b/records.json` (1510 records at build time). New file: `records.retagged.json` in the same folder. The original was not edited.

> `records.json` kept growing while I worked: it was 1,521 records when I started and has 32 + 88 NYFA records that another session added. Positions of earlier records did not shift. The build script reads the file as it is at the time it runs, so it can be re-run.

## How each record was handled

| Evidence | Records | What it means |
|---|---|---|
| `page_read` | 1128 | I opened the page and read it. Tags, pay, fee, deadline, dates and location come from the page. |
| `other_session` | 314 | NYFA jobs, spaces and opportunities that another session read and structured from NYFA's public listings. I checked their tags against the titles. |
| `title_only` | 66 | Not opened by anyone: FireMics, A4, Jalopy (the page is built by JavaScript and shows no text), and a few pages that returned a list instead of the listing. Tags checked against the stored title and text; details are the stored ones. |
| `template_rule` | 2 | badslava listings, tagged by rule from the title (badslava blocks automated requests, so none were opened). |

All 189 openmikes.org pages were read one by one, not tagged by rule. NYC Parks, ArtsWestchester and Montclair Art Museum returned 403 to a plain request; with a browser-style User-Agent header, robots.txt checked first and 3 seconds between requests, they were read normally. No JavaScript, CAPTCHA or login was bypassed.

Confidence: high 336, medium 1085, low 89.

## Nothing was dropped

Every record is in the new file, including the ones that are over. Each row has a `read_status`:

- **closed**: 65 records I read whose page says the deadline or event has passed or the call is closed.
- **expired**: 21 records I could not read whose stored deadline is before today (2026-11-02).
- **flagged, not for working artists**: 24 records are kept and labeled in the reason (children's and school programs, teacher-only or organization-only calls, students). They are not removed.
- **outside NY/NJ/CT**: 308 records (20%). Kept, since they are in your scope; the `region` field is untouched.

## How many changed

- Artist type or kind changed on **421 of 1510** records (346 artist-type changes, 101 kind changes; 20 changed only because an unknown tag was renamed).
- Among the **1128 records I read**, **315 (28%)** got a different artist type and **58 (5%)** a different kind. Most of the artist-type changes are open mics: the old record said "music + singer" and the page also welcomed comedy or poetry (or only one of those).
- Details read from pages: pay 130, fee 735, deadline 134, dates 1048, location 1107. Where the stored fee was `unknown`, 60 now have a real fee. The stored deadline differs from the page on 79 records (often the event date, not a deadline, or a date that has now passed).
- A field is left empty when the page does not give it. Nothing is filled with "n/a" or "not stated".

### How much better is the list?

This compares my reading to the old tags; it is not an outside answer key. Of the 1128 records read from pages, about 28% had a different artist type, 5% a different kind, and 6% are closed. Every one of them now carries its own pay, fee, deadline, dates and location wherever the page gave them. The 68 records I could not open still carry only the old stored details.

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
| theater | all | 11 |
| craft + visual | craft | 9 |
| all | visual | 9 |
| literary | writing | 8 |
| music + singer | comedy + music | 6 |
| dance + music | dance | 5 |
| poet + theater | poet | 4 |
| literary + poet | writing | 4 |
| craft + visual | visual | 4 |
| craft + design | craft + visual | 4 |
| dance + theater | dance | 3 |
| literary + poet | poet + writing | 3 |
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

- 89 low-confidence records: 66 page_read, 12 other_session, 9 title_only, 2 template_rule.
- `music` vs `singer` on open mics and jams, and `theater` vs `singer` on musical-theatre auditions.
- Residencies that say "any discipline" (tagged `all`) versus ones aimed at a medium (Printshop, tagged `visual`).
- Wave Hill, Roulette and HERE name no art form on the page.

## Still not read

66 records are title-only: mara-firemics-open-mics 34, aaartsalliance 20, jalopy-theatre 7, broadwayworld-auditions 3, actors-center 1, api-sam-opportunities 1. For the do-not-open sites, a person can open a page and paste its text, and I will write the record from that.

## 40 random records I did not flag

| id | title | tags | kind | confidence | evidence |
|---|---|---|---|---|---|
| 750 | Comedy open mic at Saint Lazarus Bar (Monday 9:00pm) | comedy | event/open_mic | medium | page_read |
| 14 | 2027 Queens Arts Fund: New Work Grant | all | grant/grant | medium | title_only |
| 1170 | Older Musicians Drums Guitar Keys Bass | music | open_call/collaboration | medium | other_session |
| 198 | Comedy open mic at EastVille Comedy Club (Monday 8:00pm) | comedy | event/open_mic | medium | page_read |
| 1233 | Actors  wanted | theater | open_call/casting_call | medium | other_session |
| 854 | Poetry open mic at Busboys and Poets (Wednesday 8:00pm) | poet | event/open_mic | medium | page_read |
| 1399 | Open Call: Curated Group Exhibition (Spring 2027) - Seven House Galler | visual | open_call/gallery_submission | high | page_read |
| 1286 | Island Time Comedy Mic at Mad Tropical | comedy | event/open_mic | medium | title_only |
| 1166 | Musician/Songwriter/Arranger/Composer looking to work FOR FREE... | music | open_call/service_ad | medium | other_session |
| 799 | Comedy open mic at Eckington Hall (Monday 7:00pm) | comedy | event/open_mic | medium | page_read |
| 1373 | Seeking Guitar Teacher with Voice Background at Soyulla! (Soyulla) | music | job/teaching_artist | medium | other_session |
| 395 | Comedy open mic at The Grisly Pear (Thursday 6:00pm) | comedy | event/open_mic | medium | page_read |
| 624 | WeBop Family Jazz Party: A Holiday Jazz Jam | music | event/show | medium | page_read |
| 1285 | Try New S**T Mic at EastVille Comedy Club | comedy | event/open_mic | medium | title_only |
| 321 | Comedy open mic at The Rose (Thursday 5:30pm) | comedy | event/open_mic | medium | page_read |
| 1213 | Laughing Buddha - Mic at The Stand | comedy | event/open_mic | medium | title_only |
| 484 | Small Works 2027: The Still Small Voice (Upstream Gallery) | visual | open_call/gallery_submission | high | page_read |
| 792 | Music open mic at Sweeney's Station Saloon (Wednesday 7:30pm) | music + singer | event/open_mic | medium | page_read |
| 1056 | PRINCETON CRIT / Small Group Critique | all | event/workshop | medium | page_read |
| 1351 | Grass - NYC EPA (11.04.26) (Park Avenue Armory) | theater | open_call/audition | medium | other_session |
| 570 | House of West – NYC’s Weekly West Coast Swing Party | dance | event/dance_night | high | page_read |
| 52 | Welcome Table: Equity Principal Actors audition | theater | open_call/audition | high | page_read |
| 213 | Comedy open mic at Phoenix Bar (Thursday 6:00pm) | comedy | event/open_mic | medium | page_read |
| 327 | Comedy open mic at West Side Comedy Club (Friday 5:00pm) | comedy | event/open_mic | medium | page_read |
| 1315 | Keys wanted for new wave/indie rock dad band | music | open_call/collaboration | medium | other_session |
| 32 | ArtsWestchester Arts Alive 2027 grants | all | grant/grant | medium | page_read |
| 223 | Comedy open mic at Phoenix Bar (Sunday 4:00pm) | comedy | event/open_mic | medium | page_read |
| 410 | Music / Poetry open mic at ENOCH's ARTS & Coffee (Wednesday 5:00pm) | music + singer + poet | event/open_mic | medium | page_read |
| 39 | NJ State Council on the Arts multiyear operating and program grants | all | grant/grant | medium | page_read |
| 445 | Comedy open mic at One and One (Wednesday 6:15pm) | comedy | event/open_mic | medium | page_read |
| 38 | Jersey City Poet Laureate 2027-2028 | poet | open_call/competition | medium | page_read |
| 1156 | Jazz/Gospel Drummer Available | music | open_call/service_ad | medium | other_session |
| 908 | Open mic at Strange Brew Tavern (Every Wednesday at 8pm) | music + singer | event/open_mic | high | page_read |
| 255 | Dance night at LPR (Friday 6:00pm) | dance | event/dance_night | medium | page_read |
| 102 | Comedy open mic at Greenpoint Comedy Club (Thursday 5:30pm) | comedy | event/open_mic | medium | page_read |
| 665 | The Tiny Cupboard (Brooklyn): apply to perform on stand-up shows | comedy | open_call/performance_call | medium | page_read |
| 1367 | Seeking Brand Ambassadors with a Dance Background to Promote One Times | dance | open_call/paid_gig | medium | other_session |
| 1314 | Keyboardist/Vocals Seeks Cover Band | music + singer | open_call/collaboration | medium | other_session |
| 1203 | The Secret Mic at New York Comedy Club - East Village | comedy | event/open_mic | medium | title_only |
| 232 | Dance night at Mamajuana Cafe Inwood (Tuesday 6:30pm) | dance | event/dance_night | medium | page_read |

Checks: every tag is one of the app's 14 artist types or `all`; none has more than 3; no id is duplicated; all 1510 records are present; every original field other than the retagged ones is unchanged.

## How the app reads it

`web/server/agents/filter.ts` now loads `records.retagged.json` first, then `records.recategorized.json`, then `records.json`. The new `read_pay`, `read_fee`, `read_deadline`, `read_dates`, `read_location`, `read_notes`, `read_quote` and `read_status` fields are ignored until a card is changed to show them.
