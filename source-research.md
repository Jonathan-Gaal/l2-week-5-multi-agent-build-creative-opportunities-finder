# Source Research: where to find NYC artist opportunities

Status summary for the team: [STATUS.md](STATUS.md). Dashboard: https://claude.ai/artifact/1KJoDsygR95xDTkuCN2dwU. Source coverage: https://claude.ai/artifact/HG3uL34umsY8VpDgYZjACG. Page code: [artifacts/](artifacts/).

Checked 2026-10-27 · Owners: Jon and Mara · Feeds [multi-agent-prd-lean.md](multi-agent-prd-lean.md) section 4

## How this was checked

Each site was tested with a plain script request (no login, no browser), looking at:

- **Reachable:** does the page load for a script, or does it return a block (403) or fail to connect?
- **robots.txt:** does the site say crawlers may or may not read it, and does it name AI crawlers?
- **Feed:** is there an RSS feed, a WordPress JSON feed (`/wp-json/wp/v2/`), or an open data API?
- **Content:** does the public page contain listings, or is it an empty JavaScript shell?

**Not checked:** terms of service. robots.txt is a signal, not a legal answer. Every site we plan to automate still needs a terms review (PRD section 12).

**Guessed addresses.** Where a page URL is marked "guessed", I made it up from the site's name. A 404 or failed connection on a guessed address says nothing about the real site.

---

## Headline findings

1. **No free structured feed of open calls exists.** NYC Open Data has art datasets, but none list opportunities you can apply to.
2. **Most sites are standing programs, not listing boards.** Venues like Apollo, Sofar, SOB's and the comedy clubs have one "submit here" page. Scraping them gives one record each.
3. **Several sites block AI crawlers by name.** Anthropic's crawlers are named on EFA, Brooklyn Comedy Collective, The PIT and others. Several share an identical long robots list, which looks like a website platform default, but that is an inference.
4. **Only a few sources are scrapable today:** NYC Parks (built), A4's opportunity board, Hyperallergic's RSS, and possibly Playbill Jobs, OpenMYC and FireMics.
5. **The lean PRD does not cover performers.** Auditions, booking submissions and open mics are not open calls, residencies, grants or events.

---

## Status at a glance

**Built**
- NYC Parks events feed
- A4 opportunities board (scraped despite its terms, see section 7)

**Ready to build**
- Hyperallergic RSS

**Needs a closer look**
- OpenMYC (the URL we had is a parked page; real URL needed)
- FireMics (terms prohibit scraping; its `/developers` API page loaded empty)
- Residency Unlimited
- Playbill Jobs (terms)
- Colored Colors (robots)

**Curated entries (hand-maintained)**
- Apollo Amateur Night, Sofar Sounds, SOB's, MTA Music, Make Music New York
- New York Comedy Club, EastVille Comedy Club
- apexart, NARS, ISCP, Bronx Council on the Arts

**Excluded**
- NYFA, Backstage, Casting Networks, Eventbrite, Gotham Comedy Club
- EFA, Brooklyn Comedy Collective, The PIT, NY Art Beat
- CaFE, ArtConnect, Actors Access (terms of service prohibit automated access)

**Gray area (ask permission first)**
- Submittable, TransArtists, Playbill Jobs

---

## 1. NYC Open Data

Free, JSON, no key needed. Catalog searched at `api.us.socrata.com/api/catalog/v1?domains=data.cityofnewyork.us`. Row data comes from `https://data.cityofnewyork.us/resource/<id>.json`.

**Conclusion:** use Open Data to find organizations and past patterns, not to find open opportunities.

### NYC Parks Public Events (14 days)
- **Link:** [JSON feed](https://www.nycgovparks.org/xml/events_300_rss.json) (live, not Socrata)
- **Use:** already built. 615 events, 1 real open call (Wreath Interpretations, listed 6 times).

### NYC Parks Events Listing
- **ID:** `fudw-fgrp`, plus related tables · updated 2026-02-05
- **What it is:** archive of Parks events back to 2013.
- **Use:** mine for recurring open calls, for example the Arsenal Gallery.

### DCLA Cultural Organizations
- **ID:** `u35m-9t32` · updated 2026-06-10
- **What it is:** directory of NYC arts groups.
- **Use:** a list of organizations whose own sites to check.

### Temporary Art Program
- **ID:** `3r2x-bnmj` · updated 2026-10-07
- **What it is:** current public art installs with artist and partner.
- **Use:** shows who commissions art. Not open calls.

### NYC Permitted Event Information
- **ID:** `tvpp-9vvx` · updated 2026-10-26
- **What it is:** permitted events citywide.
- **Use:** possible leads for events needing performers. Not opportunities themselves.

### Background only
- Completed Percent for Art (`gzdv-qiga`)
- Public Design Commission Outdoor Public Art Inventory (`2pg3-gcaa`)
- DCLA Programs Funding (`y6fv-k6p7`)

---

## 2. Visual artists

### A4 (Asian American Arts Alliance) — best find
- **Link:** [aaartsalliance.org/opportunities](https://www.aaartsalliance.org/opportunities)
- **Found:** plain HTML board. Each listing has organization, title, type (Residency, Grant, Call for Submissions, Job) and deadline ("Nov 15" or "Rolling"). No robots.txt. It also re-lists other organizations' calls, including NYFA grants, Triangle Arts and Rauschenberg.
- **Caveats:** the board includes jobs and non-NYC items, so the NYC check and a type filter apply. The board's own deadline has no year, but each detail page does.
- **Terms:** prohibit scraping (section 7). Mara decided to proceed for the class proof of concept.
- **Verdict:** built in [backfill/a4.py](backfill/a4.py). See the build log in section 10.

### Hyperallergic
- **Link:** [RSS feed](https://hyperallergic.com/rss/)
- **Found:** RSS works and robots allows it. National. The 15 items returned had no opportunity roundups, and `/opportunities/` gave a 404.
- **Verdict:** worth pursuing. Needs the NYC check.

### Residency Unlimited
- **Link:** [residencyunlimited.org](https://residencyunlimited.org/)
- **Found:** open WordPress JSON feed with custom types `residencies` and `programs`. No robots restrictions. The data is resident profiles, exhibitions and newsletter e-blasts, not an open-calls list.
- **Verdict:** closer look. Open calls may be inside the e-blasts.

### ISCP
- **Link:** [iscp-nyc.org](https://iscp-nyc.org/)
- **Found:** open JSON feed with `event` and `resident` types. Posts are empty. Events seen were open studios and artist talks. The Ground Floor open call was not seen.
- **Verdict:** weak for open calls.

### Flux Factory
- **Link:** [fluxfactory.org](https://www.fluxfactory.org/)
- **Found:** JSON feed with `tribe_events`. Posts are artist profiles. robots.txt disallows Googlebot, Bing and others, but not `*`.
- **Verdict:** ask first.

### Bronx Council on the Arts
- **Link:** [bronxarts.org](https://www.bronxarts.org/)
- **Found:** home page loads, no feed. The calls page was not found.
- **Verdict:** manual look needed, or a curated entry.

### apexart
- **Link:** [apexart.org](https://apexart.org/)
- **Found:** home page loads, robots only blocks `/signup.php`, no feed. A guessed open-call URL returned 404.
- **Verdict:** manual look needed, or a curated entry.

### NARS Foundation
- **Link:** [narsfoundation.org](https://www.narsfoundation.org/)
- **Found:** home page loads, no robots.txt, no feed. A guessed open-calls URL returned 404.
- **Verdict:** manual look needed, or a curated entry.

### DCLA public art opportunities
- **Link:** [nyc.gov page](https://www.nyc.gov/site/dcla/publicart/opportunities.page)
- **Found:** reachable, but the content loads via JavaScript, so a plain fetch gets an empty page.
- **Verdict:** needs a rendering approach, or manual entry.

### CaFE
- **Link:** [callforentry.org](https://www.callforentry.org/)
- **Found:** reachable, robots allows everything. National. No feed tested.
- **Terms:** the Creative West General Terms say you agree not to access the services "through any automated means". See section 7.
- **Verdict:** excluded.

### ArtConnect
- **Link:** [artconnect.com/opportunities](https://www.artconnect.com/opportunities)
- **Found:** reachable. robots allows `/api/`. Page mentions New York 28 times. No API confirmed.
- **Terms:** bots, scrapers and crawlers are prohibited without prior written permission. See section 7.
- **Verdict:** excluded unless ArtConnect gives written permission.

### TransArtists
- **Link:** [transartists.org](https://www.transartists.org/)
- **Found:** reachable. International residencies. Not tested further.
- **Terms:** no terms of use page found, and nothing in the privacy policy or the DutchCulture disclaimer addresses scraping. See section 7.
- **Verdict:** gray area. Ask DutchCulture before building.

### Submittable Discover
- **Link:** [submittable.com/discover](https://www.submittable.com/discover)
- **Found:** reachable. Many NYC organizations post there.
- **Terms:** no explicit scraping clause, but it bars copying the Site to build a competing product. See section 7.
- **Verdict:** gray area. Ask Submittable before building.

### EFA — excluded
- **Link:** [efanyc.org](https://www.efanyc.org/)
- **Found:** robots.txt names 30 crawlers including ClaudeBot and anthropic-ai.

### NYFA — excluded
- **Link:** [nyfa.org/opportunities](https://www.nyfa.org/opportunities/)
- **Found:** Cloudflare challenge returns 403 to scripts. robots.txt does not disallow, but the block is technical.
- **Verdict:** excluded unless NYFA gives permission. A4 re-lists some NYFA grants.

### NY Art Beat — dropped
- **Found:** the page says the site is "taking a break" after 16 years.

**Not checked:** Socrates Sculpture Park, Queens Council on the Arts. BRIC returned 403.

---

## 3. Actors

### Playbill Jobs — best of the six
- **Link:** [playbill.com/jobs](https://playbill.com/jobs)
- **Found:** reachable. The page lists auditions and has New York mentions. No feed, no structured job markup. robots.txt says `Content-Signal: search=yes, ai-train=no, use=reference`.
- **Terms:** no terms of use page found. Only the robots content signal applies. See section 7.
- **Verdict:** gray area. Email Playbill before building.

### Actors Access
- **Link:** [actorsaccess.com](https://actorsaccess.com/)
- **Found:** reachable, no robots.txt. From memory, not verified: breakdowns need a talent account.
- **Terms:** prohibits "scraping" and the use of automation to access the site. See section 7.
- **Verdict:** excluded.

### DirectSubmit (includes NYCastings)
- **Link:** [directsubmit.com](https://directsubmit.com/)
- **Found:** NYCastings has moved to DirectSubmit, so they count as one source. robots allows everything, but the site is a JavaScript app and the public page is nearly empty. Appears to be a casting-director-to-talent tool.
- **Verdict:** unverified, likely gated.

### Central Casting
- **Link:** [centralcasting.com](https://www.centralcasting.com/)
- **Found:** reachable, robots allows everything, has an "Open Roles" link. Background work, national. Applying needs a login.
- **Verdict:** look at the Open Roles page.

### Backstage — excluded
- **Link:** [backstage.com/casting](https://www.backstage.com/casting/)
- **Found:** 403 Cloudflare block.

### Casting Networks — excluded
- **Link:** [castingnetworks.com](https://www.castingnetworks.com/)
- **Found:** 403 on the site and on robots.txt.

---

## 4. Musicians

### Colored Colors — best musician candidate
- **Link:** [coloredcolors.com](https://www.coloredcolors.com/)
- **Found:** reachable. "Open call" appears 4 times on the home page. robots.txt blocks several AI crawlers.
- **Verdict:** check the robots rules before building.

### Playbill Musician Jobs
- **Found:** same site and same terms question as in section 3.

### SOB's
- **Link:** [sobs.com](https://sobs.com/)
- **Found:** reachable, open JSON feed (its event calendar), robots allows. A guessed submissions URL returned 404.
- **Verdict:** need the real submissions page. Curated entry.

### Sofar Sounds
- **Link:** [sofarsounds.com](https://www.sofarsounds.com/)
- **Found:** reachable, robots allows all except `/videos/*`. Applying needs an account. No listings to read.
- **Verdict:** standing program. Curated entry.

### Apollo Amateur Night
- **Link:** [apollotheater.org/amateur-night](https://www.apollotheater.org/amateur-night/)
- **Found:** reachable. "Audition" appears 17 times. One ongoing program.
- **Verdict:** standing program. Curated entry.

### Make Music New York
- **Link:** [makemusicny.org](https://makemusicny.org/)
- **Found:** reachable, no feed. robots.txt blocks several AI crawlers. Annual festival, unpaid.
- **Verdict:** standing program. Curated entry.

### MTA Music
- **Link:** [mtaarts.submittable.com/submit](https://mtaarts.submittable.com/submit)
- **Found:** the Submittable page loads. Reported to have no scheduled auditions. Not verified.
- **Verdict:** check periodically.

### String Orchestra of Brooklyn
- **Found:** a guessed domain did not connect.
- **Verdict:** need the real URL.

---

## 5. Comedians

### OpenMYC — best lead
- **Link:** [openmyc.com](https://openmyc.com/)
- **Found:** a JavaScript app. The page fetched is a 114-byte empty shell. robots allows everything. Listings load via scripts, so there may be an underlying data feed not yet found.
- **Update:** this turned out to be a parked page. A script redirects to `/lander`, and the sitemap lists only `/lander`. Both openmyc.com and openmyc.org behave this way.
- **Verdict:** we need the real URL. The earlier "best lead" label was wrong.

### FireMics
- **Link:** [firemics.com](https://www.firemics.com/)
- **Found:** reachable. robots disallows only `/api/` and `/cdn-cgi/`. Not WordPress.
- **Terms:** bans bots and scrapers without written permission (section 7). Its footer links an "API F.A.Q." at `/developers`, which loaded empty for a script.
- **NYC page (from Mara):** [firemics.com/new-york-open-mics](https://www.firemics.com/new-york-open-mics) loads fully for a script. It lists the day's open mics with time, venue, borough, type (mostly stand-up) and cost, and links 227 event pages under `/events`. No structured event markup, so it would be read from the HTML. The sitemap (`/sitemap-0.xml`, 284 URLs) has 5 `/events` pages, so it does not list every mic.
- **Verdict:** pages only, never the `/api/` paths. Good data, not built yet.

### New York Comedy Club
- **Link:** [newyorkcomedyclub.com](https://newyorkcomedyclub.com/)
- **Found:** reachable, no robots restrictions, no feed. The home page mentions submissions once and Rising Stars once.
- **Verdict:** curated entry.

### EastVille Comedy Club
- **Link:** [eastvillecomedy.com](https://www.eastvillecomedy.com/)
- **Found:** reachable, no robots restrictions, no feed. The home page mentions open mics 22 times and "new talent" twice.
- **Verdict:** curated entry.

### Bushwick Comedy Club
- **Found:** the domain tried redirects to [The Tiny Cupboard](https://www.thetinycupboard.com/), a different Brooklyn comedy club. Either it was renamed or the address is wrong.
- **Verdict:** need the right URL.

### New York Comedy Festival
- **Link:** [nycomedyfestival.com](https://nycomedyfestival.com/)
- **Found:** the real domain is nycomedyfestival.com (the first guess did not connect). Submissions are closed until July 2027.
- **Verdict:** do not list as open until it reopens.

### Brooklyn Comedy Collective — excluded from automation
- **Link:** [brooklyncc.com](https://www.brooklyncc.com/)
- **Found:** robots.txt names ClaudeBot and anthropic-ai.

### The PIT — excluded from automation
- **Link:** [thepit-nyc.com](https://thepit-nyc.com/)
- **Found:** robots.txt names ClaudeBot, GPTBot and CCBot. The JSON feed returns 401.
- **Verdict:** verify.

### Gotham Comedy Club — excluded
- **Link:** [gothamcomedyclub.com](https://www.gothamcomedyclub.com/)
- **Found:** 403 block.

---

## 6. Excluded outright

- **Eventbrite:** robots.txt disallows all crawling.
- **Backstage, Casting Networks, Gotham Comedy Club, NYFA, BRIC:** 403 Cloudflare blocks.
- **EFA, Brooklyn Comedy Collective, The PIT:** robots.txt names Anthropic or other AI crawlers.
- **NY Art Beat:** site shut down.
- **Bandsintown:** requires written consent and serves artists rather than listing opportunities.
- **CaFE, ArtConnect, Actors Access:** their terms of service prohibit automated access (section 7).
- **Craigslist gigs:** robots does not block it, but terms were not checked. Probably no.

---

## 7. Terms of service review

Read on 2026-10-27 for the six sites that were marked "needs a terms check". This is a plain reading of the text, not legal advice. Absence of a ban is not permission.

### CaFE — prohibited
- **Terms:** [CaFE Terms](https://www.callforentry.org/terms-and-conditions), which defer to Creative West's [General Terms of Service](https://wearecreativewest.org/terms-conditions/).
- **Says:** "You agree not to access (or attempt to access) any of the Services through any automated means or in any other manner other than through the interface that is provided by Creative West." Content is for personal or internal use, with no commercial exploitation.
- **Result:** excluded.

### ArtConnect — prohibited without written permission
- **Terms:** [ArtConnect Terms](https://www.magazine.artconnect.com/terms).
- **Says:** no automated tools (bots, scrapers, crawlers) to "access, collect, or copy data from the Service without our prior written permission". It claims database rights and says it "actively monitors for unauthorised scraping". The API is covered by the terms, with no bulk downloading or archiving.
- **Path forward:** the terms invite a formal data access agreement through hello@artconnect.com.
- **Result:** excluded unless ArtConnect agrees in writing.

### Actors Access — prohibited
- **Terms:** [Breakdown Services Terms of Service](https://actorsaccess.com/content/?view=termsofservice).
- **Says:** users may not use "3rd party software, automation, applications or services to access the Website(s)" or engage in "scraping".
- **Result:** excluded.

### Submittable — gray area
- **Terms:** [Submitter Terms](https://cdn.prod.website-files.com/691c49a6538e4c055a9db2ed/699dc4187243c07d6142eea2_submittable_submitter_terms.pdf), last updated November 27, 2023.
- **Says:** no explicit scraping or crawling clause. Bots may not register accounts. It bars copying any portion of the Site "to directly or indirectly develop... any product or service that is competitive with our products and services", and bars reverse engineering and making derivative works.
- **Risk:** an open-call finder could be read as competing with Submittable Discover.
- **Result:** ask Submittable before building.

### TransArtists (DutchCulture) — gray area
- **Found:** no terms of use page. The [privacy policy](https://www.transartists.org/privacy-policy) covers personal data only. The [DutchCulture disclaimer](https://dutchculture.nl/en/disclaimer) disclaims liability and says nothing about scraping or reuse, and it does not clearly cover TransArtists.
- **Result:** nothing prohibits it and nothing permits it. Email DutchCulture.

### Playbill Jobs — gray area
- **Found:** no terms of use page. The footer links only a [privacy policy](https://playbill.com/article/privacy-policy), a site map and a contact page, and common terms URLs return 404. The only signal is the robots.txt content signal: `search=yes, ai-train=no, use=reference`.
- **Result:** unclear whether the Extractor's use counts as "reference". Email Playbill.

### A4 — prohibited by its terms
- **Terms:** [A4 Terms & Conditions](https://www.aaartsalliance.org/terms-conditions).
- **Says:** users may not "scrape, intercept or expropriate any Content", may not use "any manual or automated means, including agents, robots, scripts, or spiders... to monitor or copy any part of the Website", and may not "copy, archive, store, reproduce... download" content.
- **Result:** prohibited. A4 is a nonprofit that supports artists, so asking for permission may work.

### FireMics — prohibited without written permission
- **Terms:** [FireMics Terms of Service](https://www.firemics.com/terms-of-service).
- **Says:** users may not "use automated bots, scrapers, crawlers, or other tools to collect data from FireMics without our express written permission".
- **Also:** its footer links an "API F.A.Q." at `/developers`, but that page loaded empty for a script. robots.txt disallows `/api/`.
- **Result:** prohibited without permission. Ask about the API.

### Hyperallergic — gray area
- **Terms:** [Terms of Use](https://hyperallergic.com/terms-of-use/), last updated 26 February 2014.
- **Says:** no scraping or automation clause. It does say "the copying, redistribution, use or publication by you of any portion of our Website is strictly prohibited."
- **Note:** the RSS feed is something the site publishes for others to read, which is different from scraping pages.
- **Result:** reading the RSS headlines is low risk. Do not copy article text.

### OpenMYC — wrong site
- **Found:** both [openmyc.com](https://openmyc.com/) and openmyc.org are parked pages. A script redirects to `/lander`, and the sitemap lists only `/lander`. They are not the real OpenMYC.
- **Result:** the earlier "best lead" was wrong. We need the real URL.

### Decision on terms (2026-10-27)
Mara decided to scrape sources whose terms prohibit it, because this is a non-commercial class proof of concept. Limits agreed:
- One backfill run, not a recurring crawl.
- robots.txt is honored, and no logins or Cloudflare blocks are bypassed.
- Each record keeps its `source_url` and check date, so it links back to the original.
- **Open risk:** terms violations can lead to a blocked IP or a cease-and-desist letter. Publishing scraped listing text on a public portfolio site raises that risk. For a public demo, link back to sources rather than republishing their text.

---

## 8. Decisions needed

1. **Gray-area sources** (Submittable, TransArtists, Playbill). Recommendation: email each for permission, and skip any that do not answer before the demo. The demo can run on Parks, A4 and Hyperallergic.
2. **Do we respect AI-crawler blocks** (EFA, Brooklyn Comedy Collective, The PIT, Colored Colors, Make Music NY)? Recommendation: yes, and use curated entries or email for permission.
3. **Do we add a curated file as a source type?** A small hand-maintained list of standing programs with a source link and check date each. It fits the PRD's provenance rules.
4. **Do we add performer types** (`audition`, `submission`, `open_mic`) to the PRD? Recommendation: keep v1 to visual art and add performers as v2. This is Jon's call, since he owns the Ranker.
5. **Closed or future-opening programs.** The schema has no "reopens later" state. Recommendation: leave them out until they reopen.

---

## 9. Next steps

1. ~~Build the A4 source.~~ Done (section 10).
2. Find the real OpenMYC URL.
3. Add the Hyperallergic RSS source.
4. Add the curated-file source type, if agreed.
5. Email Submittable, DutchCulture (TransArtists), Playbill and ArtConnect about permission. Wait for answers before building on them.
6. Still to review: the terms of A4, Hyperallergic, OpenMYC and FireMics, which were not read yet.

---

## 10. Build log

Updated as sources are built. Code lives in [backfill/](backfill/), tests in [tests/](tests/).

### 2026-10-27: NYC Parks source ([backfill/parks.py](backfill/parks.py))
- 615 events fetched, 1 real open call (listed 6 times, merged to 1 record by the dedupe key).
- Fixed a bug: a funder credit ("Statewide Community Regrants Program") made a workshop look like a grant. Grants now match on the title only.

### 2026-10-27: Checks added to the backfill ([backfill/run.py](backfill/run.py))
- **NYC check:** a record is kept only if its source is NYC-only or the record is marked `nyc_confirmed`. Anything else is dropped and counted as `not_nyc`.
- **Expiry check:** a deadline earlier than today is dropped and counted as `expired`. Rolling or missing deadlines are kept.

### 2026-10-27: A4 source ([backfill/a4.py](backfill/a4.py))
- **How it works:** one request for the board (124 cards), then one request per kept card for the detail page, one second apart. The detail page gives the street address and the deadline with its year.
- **Types kept:** Call for Submissions (open_call), Residency, Grant, Fellowship (grant), Audition/Casting Call (audition). Jobs, internships and workshops are skipped.
- **NYC check (stand-in for the Extractor):** NYC zip code, then borough name in the address, then "New York, NY", then "NYC" or "New York City" in the text. A listing with none of these is dropped.
- **Result:** 66 candidates, 40 dropped as not NYC, 26 stored.
- **Audit of the dropped:** I read the addresses of the dropped listings. They are international (Berlin, Tokyo, Casablanca), remote, or have no address. One real NYC miss ("New York, NY" with a masked zip) was found and fixed.
- **Known limits:** deadlines come only from the detail page. Eligibility and fee are not filled (Extractor's job). A listing with an international address but NYC wording in its text could pass the stand-in check. `audition` is not one of the PRD's four types, so Jon needs to decide on it.

### 2026-10-27: Terms of service review (section 7)
- Read the terms for CaFE, ArtConnect, Actors Access, Submittable, TransArtists, Playbill, A4, Hyperallergic and FireMics.
- **Prohibit scraping:** CaFE, ArtConnect, Actors Access, A4, FireMics (with written permission as the only exception).
- **Unclear:** Submittable, TransArtists, Playbill (no explicit ban, or no terms page found). Hyperallergic has no scraping clause.
- **Decision (Mara):** scrape sources whose terms prohibit it, because this is a non-commercial class proof of concept. One run, no logins or Cloudflare blocks bypassed, links back to each source.

### 2026-10-27: Corrections
- **OpenMYC:** the domains we had (openmyc.com, openmyc.org) are parked pages, so the earlier "best lead" label was wrong. Real URL still needed.
- **robots.txt:** my link-crawl script reported four sites as "robots-disallowed" because Python's robots checker failed to fetch the file. Their real rules allow access.

### 2026-10-27: FireMics NYC page
- Mara supplied [firemics.com/new-york-open-mics](https://www.firemics.com/new-york-open-mics). It lists the day's open mics with time, venue, borough, type and cost. Not built yet, and it needs an `open_mic` type from Jon.

### 2026-10-27: Link crawl and full-site crawl (sections 11 and 12)
- **Why:** my first passes fetched one home page per site and missed the pages where opportunities live. Mara found a missed page (Bronx Council's New Work grant) to show the gap.
- **Tool:** a scratch crawler that follows every same-site link up to three levels deep (35 to 70 pages per site, 0.3 to 0.4 seconds apart) and flags deadline and application wording. Not part of the backfill yet.
- **Open now:** Bronx Council CEGs (Oct 30), apexart NYC open call (Oct 31), Colored Colors Hudson Yards vendors (Nov 1), LMCC Manhattan Arts Grants (Nov 12), Bronx Dance Fund (Nov 20).
- **Expired, should be filtered:** Bronx Cultural Visions Fund, Arts on the Block, SU-CASA, the NARS exhibition program, Colored Colors' solo musician call.
- **Pattern found:** DCLA's doubled artist grants (now up to $10,000, announced Oct 2) run through borough partners. Bronx Council, LMCC, Brooklyn Arts Council and Staten Island Arts were crawled. Queens Council on the Arts blocks scripts (403).
- **Hyperallergic:** the roundup list is at /tag/opportunities/.

### 2026-10-27: Readable export ([backfill/export.py](backfill/export.py))
- Every backfill run now also writes `data/snapshot.md` (grouped by borough and type, with deadlines, source links and check dates) and `data/snapshot.csv` (one row per record, opens in Excel or Sheets). Both are rebuilt from the published snapshot.
- A4 descriptions now start at the listing text, not the page title and address header.
- The database keeps the previous snapshot as `retired` when a new one publishes. It is no longer wiped between runs.

### 2026-10-27: Dashboard, artist categories and an address fix
- Built a private dashboard of the snapshot (artist category by borough, opportunity type, every listing). `backfill/export.py` now also writes `data/snapshot.json` for it, with titles, labels and source links only.
- Artist category has no source field, so each of the 27 listings was labeled by reading it ([backfill/artist_categories.json](backfill/artist_categories.json)). New listings fall back to keyword rules, then "Needs review".
- Mara asked about the A4 listing "Call for Art: First Look 2027". It was fetched and correctly dropped: Panopticon Gallery, Boston, MA, deadline Dec 29, 2026.
- Fixed A4's address parser, which grabbed page-title text when the organization name appeared in the title. A rerun changed nothing: still 27 records, none added or removed.

### Next
1. Build a source for the borough arts councils (Bronx Council, LMCC, Brooklyn Arts Council). Each grant page states "The deadline to apply is ...".
2. Build Colored Colors, whose open-calls board is updated regularly.
3. Decide with Jon on the performer types (`audition`, `open_mic`, `submission`) before building FireMics.
4. Get the real URLs for OpenMYC, Bushwick Comedy Club and String Orchestra of Brooklyn.
5. Turn the scratch crawler into a reusable tool if the borough sources need it.

### Current snapshot (after both sources)
- 27 records published: 26 from A4 and 1 from NYC Parks.
- By type: 15 open_call, 7 grant, 4 audition, 1 residency.
- By borough: Manhattan 18, Queens 5, Brooklyn 2, Bronx 1, unknown 1.
- 15 records have a rolling deadline and 1 has no deadline.

---

## 11. Deeper crawl (2026-10-27)

My first pass fetched one home page per site. This pass followed each site's links to the pages where calls actually live. It supersedes the "status only" and "home page only" notes in sections 2, 4 and 5.

### Pages found, with current content
- **apexart** ([open calls](https://apexart.org/opencalls.php), [submit](https://apexart.org/nyc/submit.php)): a live NYC open call. NYC proposals are accepted **Oct 1 to Oct 31, 2026**. Winning proposals get funding and staff support. apexart says it is not a granting organization. Contact: opencalls@apexart.org. Open now, not expired.
- **Colored Colors** ([open calls](https://www.coloredcolors.com/open-calls)): a real board, updated "as calls open and close". Current entries: Holidays at the Park, Hudson Yards (NYC, applications due Nov 1); Huntington Village holiday markets (Long Island, Nov 1); a solo musician call (deadline Oct 25, already passed); The Artist Tree, Farmingdale (Long Island). Only the Hudson Yards entry is clearly NYC. **Best musician and vendor source so far.**
- **Bronx Council on the Arts** ([call for artists](https://www.bronxarts.org/opportunities/call-for-artists), [residencies/grants](https://www.bronxarts.org/opportunities/residencies-grants), [fellowships/scholarships](https://www.bronxarts.org/opportunities/fellowships-scholarships), [studio space](https://www.bronxarts.org/opportunities/studio-space)): real boards with Upcoming and Past tabs. Low volume today: "Call For Artists" is empty, and "Residencies/Grants" has one listing (a residency for NYC teacher-artists). Worth rechecking.
- **SOB's** ([performers](https://sobs.com/performers/)): an artist submission program. Showcase applications by genre (Hip Hop, R&B, Indie/Alternative, Latin, other) load through embedded forms. Headliners and openers email booking@sobs.com. A standing program, so a curated entry.
- **ISCP** ([apply](https://iscp-nyc.org/apply)): two programs. The International Program has three routes (partner application, open call, direct application). The **Ground Floor Program gives 1 to 2 year subsidized residencies to NYC-based artists.** No dates were visible on the page.
- **NARS** ([US-based artists](https://www.narsfoundation.org/residencies/us-artists)): residencies for early to mid-career artists, with partial fellowships for all US-based artists and one full fellowship per season. No dates found. A standing program, so a curated entry.
- **Residency Unlimited** ([open calls](https://residencyunlimited.org/open-calls/)): the board lists only past calls. The latest is the 2026 NYC-Based Artist Residency open call, posted October 2025. Nothing open now.

### Correction: robots.txt results
My crawl script reported "robots-disallowed" for New York Comedy Club, EastVille, TransArtists and The Tiny Cupboard. That was wrong. Python's robots checker fetched robots.txt with its own user agent and failed, which it treats as "everything disallowed". Their actual rules for all crawlers allow access (checked with a browser user agent and with our own). These four sites are not blocked.

### Still not read
- Submission pages on New York Comedy Club ([/submissions/...](https://newyorkcomedyclub.com/book-a-comic)), EastVille ([/submissions/new-talent](https://www.eastvillecomedy.com/submissions/new-talent)) and The Tiny Cupboard ([apply to perform](https://www.thetinycupboard.com/produce-a-show-with-us)): found, not yet opened.
- Sofar Sounds, Apollo Amateur Night, Make Music New York: the link crawl found no matching pages. Standing programs, curated entries.
- Central Casting: its pages are services and login pages. No open roles page found.

---

## 12. Full-site crawl (2026-10-27)

After Mara pointed out that [Bronx Council's New Work page](https://www.bronxarts.org/grants/new-work/) was missing, I wrote a crawler that follows every same-site link up to three levels deep (35 to 70 pages per site, one request every 0.3 to 0.4 seconds) and flags pages with deadline and application wording. The earlier passes only followed links whose text matched keywords like "apply", which skipped grant program names. The crawler is a scratch tool, not part of the backfill yet. The page caps mean a crawl is not exhaustive.

### Open now (deadline after 2026-10-27)
- **Bronx Council: Community Engagement Grants (CEGs)**, covering Arts Fund, Community Arts and New Work: due **Oct 30, 2026**, 11:59 PM. [CEGs](https://www.bronxarts.org/cegs), [New Work](https://www.bronxarts.org/grants/new-work), [Arts Fund](https://www.bronxarts.org/grants/arts-fund-grant), [Community Arts](https://www.bronxarts.org/grants/community-arts-grant).
- **apexart NYC open call**: proposals accepted **Oct 1 to Oct 31, 2026**. [Open calls](https://apexart.org/opencalls.php).
- **LMCC Manhattan Arts Grants 2027**: due **Nov 12, 2026**, 6 PM. Five programs: Creative Engagement, Creative Learning, UMEZ Arts Engagement, Creative Unrestricted (new, two years of general operating support), and more. [Apply page](https://lmcc.net/apply/).
- **Bronx Dance Fund**: due **Nov 20, 2026**. [Page](https://www.bronxarts.org/grants/bronx-dance-fund).
- **Colored Colors, Holidays at the Park, Hudson Yards**: vendor applications due **Nov 1**. [Page](https://www.coloredcolors.com/projects/holidays-at-the-park).

### Found but expired (the expiry filter should drop these)
- Bronx Cultural Visions Fund: Aug 27, 2026.
- Bronx Arts on the Block: May 1, 2026.
- Bronx SU-CASA: Nov 26, 2025.
- NARS exhibition program: Sept 28, 2026. [Page](https://www.narsfoundation.org/exhibitions/apply).
- Colored Colors solo musician call: Oct 25, 2026.
- Staten Island Arts residency cohort: June 30, 2026, plus several older grants (2021, 2022).

### Key finding: borough arts councils distribute the city grants
On Oct 2, 2026 the city announced that individual artist grants rise from $5,000 to $10,000 ([announcement](https://www.nyc.gov/mayors-office/news/2026/10/mayor-mamdani-doubles-grants-for-new-york-city-artists-from--5-0)). DCLA funds a partner in each borough, and the partners run the applications. That explains why A4 listed the Queens Arts Fund, GO Queens and the LMCC grants.

| Borough | Partner | Status |
| --- | --- | --- |
| Bronx | Bronx Council on the Arts | Crawled. Two open now. |
| Manhattan | LMCC | Crawled. Open now. |
| Brooklyn | Brooklyn Arts Council | Crawled. Monthly "in Brooklyn" newsletters, not yet read for 2026 grants. |
| Staten Island | Staten Island Arts | Crawled. Nothing open now. |
| Queens | Queens Council on the Arts | **Blocked** (403 for scripts). A4 re-lists its grants. |

### Other crawl results
- **Hyperallergic**: [/tag/opportunities/](https://hyperallergic.com/tag/opportunities/) lists the monthly roundups ("Opportunities in October 2026" and earlier). The roundups are national, and the October list names LMCC among others. This is the missing URL for the roundups.
- **Playbill Jobs**: the jobs page carries 9 application signals and 63 dates, and individual job pages exist under `/job/`. Terms are still unclear (section 7).
- **Residency Unlimited**: [how to apply](https://residencyunlimited.org/how-to-apply/) and the open-calls board. Only past calls are listed.
- **ISCP, NARS residencies**: apply pages exist, but they show no dates.
- **SOB's, EastVille, New York Comedy Club, Apollo, Make Music NY**: the crawl found event calendars, not application pages. The submission programs are one-page standing entries.
- **Sofar Sounds**: the crawl reached only 1 page, so the site probably builds its pages with JavaScript.
- **Tiny Cupboard**: crawled 35 pages with no deadline wording. Its "apply to perform" page is a standing form.

### What this changes
- The best NYC grant pipeline is the five borough partners, not individual scrapers per grant. Each partner site follows the same pattern: a grants page per program, with "The deadline to apply is ..." in plain text.
- A source for the Bronx Council, LMCC and Brooklyn Arts Council pages would produce open grants with real deadlines now.

---

## 13. Opportunity list as of 2026-10-27

What we hold today, by borough, then what the crawl found but is not stored yet, then standing programs by category. Deadlines are 2026 unless noted. Nothing here is expired.

### A. In the snapshot (27 records: 26 from A4, 1 from NYC Parks)

**Bronx**
- Grant: Community Engagement Grants (CEGs), due Oct 30

**Brooklyn**
- Open call: "SOS Installment II: Where We Land", rolling
- Residency: Triangle 2027-2028 Open Call, due Dec 15

**Manhattan**
- Grants: 2027 ACC Fellowships and Grants (Nov 10); LMCC 2027 Manhattan Arts Grants and SU-CASA (Nov 12); Ming Fay Research Fellowship 2027 (Nov 15)
- Open calls with dates: Bathroom Design Open Call for SoMad's New Building (Nov 11); Fifteenth Annual Winter Film Festival, Call for Entries (Nov 15); NYC Parks Wreath Interpretations Open Call (deadline not stated in the feed)
- Auditions: SPIRAL TV Pilot, Day Player (Oct 28); Need Dancers for Residency (rolling); Nai-Ni Chen Dance Co 2026 Audition (rolling)
- Rolling open calls: Open Call 2027; Activity host or Performer; Call for Art: Dreamer's Perspectives; Call for Essays, Criticism, Reflections and Text-Based Contributions; Cultural Development Fund Panelist Open Call
- Questionable (see quality notes): International Artist Professional Development and Evidence Mapping; Commissioned Critical Review for Artists and Exhibitions; Build Stronger O-1 / EB-1 Evidence Through Publication; Artist Features and STRATUM Journal Publication

**Queens**
- Grants: 2027 Queens Arts Fund (Nov 17); Arts Grants for Queens (Dec 1); GO Queens Grant (Dec 1)
- Open calls: 2026 Queens Storytelling Festival Open Call (rolling); Affordable artist and manufacturing space survey (rolling)

**Staten Island**
- Nothing stored. Staten Island Arts has nothing open now.

**Borough unknown**
- Open call: Young Artist Chamber Music Program (YACMP), rolling

### B. Found by the crawl, not stored yet (open now)
- **Bronx:** Bronx Dance Fund (Nov 20); Arts Fund, Community Arts and New Work, the three CEG programs behind the one A4 entry (Oct 30)
- **Manhattan:** the separate LMCC programs: Creative Engagement, Creative Learning, UMEZ Arts Engagement, Creative Unrestricted (all Nov 12); apexart NYC open call (Oct 31); Colored Colors, Holidays at the Park, Hudson Yards vendor applications (Nov 1)
- **Brooklyn:** Brooklyn Arts Council has monthly newsletters that list opportunities. Not read for 2026 yet.
- **Queens:** Queens Council on the Arts blocks scripts. Queens items only come through A4.

### C. Standing programs by category (no deadline, curated entries)
- **Visual artists:** ISCP Ground Floor (1 to 2 year residencies for NYC artists); NARS residencies (US-based artists); Residency Unlimited (no open call now)
- **Actors:** Playbill Jobs (auditions, terms unclear); Central Casting (background work, login needed)
- **Musicians:** SOB's showcases (booking@sobs.com); Sofar Sounds; Apollo Amateur Night; Make Music New York; MTA Music; Colored Colors open calls
- **Comedians:** FireMics NYC daily open mic list; New York Comedy Club; EastVille Comedy Club; The Tiny Cupboard; New York Comedy Festival (closed until July 2027, per Mara)

### Quality notes on the snapshot
- Four Manhattan A4 listings (the publication and evidence-building ones) look like paid or promotional offers. They passed the NYC check because their text mentions New York. They should be reviewed or dropped.
- Some types are wrong: "Queens Storytelling Festival Open Call" and "Need Dancers for Residency" are typed `audition`, and the Cultural Development Fund panelist call is a call for panelists, not artists. The Extractor is meant to fix this kind of error.
- The NYC Parks Wreath call has no deadline stored. Its page says entrants are notified by Nov 6.

---

## 14. Music sources, wider crawl and snapshot growth (2026-10-27)

### Mara's pasted music sources, tested
- **Grants.gov API** (free, no key): works. `POST https://api.grants.gov/v1/api/search2`. A keyword search for "music" in the arts category returned 2 results, both stale forecasts for a U.S. embassy program. A broad sweep (18 arts keywords, arts and humanities categories) returned 339 open opportunities, mostly science and defense grants, because the keyword match is loose. Searching by agency found 20 from NEA, NEH and IMLS. Almost all are for museums, libraries and institutions (Museums for America, Inspire Grants for Small Museums, NEA indemnity programs), not individual NYC artists. **Verdict: works, but not a fit. Nothing added to the snapshot.**
- **Simpler.Grants.gov API:** returns 401 Unauthorized without an API key. Same federal data, so no further work until there is a key and a reason.
- **Musicalchairs** ([musicalchairs.info](https://www.musicalchairs.info/)): the home page loads. My guess at an RSS address returned a web page, and the home page links no feed. Not verified.
- **NYFA Awards & Grants:** 403 Cloudflare block, same as the rest of NYFA.
- **MTA Music** (mta.info/agency/arts-design/music): 403 Access Denied for scripts. The MTA Submittable page (section 4) still loads.
- **DCLA Funding for Artists** (nyc.gov/site/dcla/cultural-funding/funding-for-artists.page): useful. It names the official borough grant partners and links their pages: Bronx Council on the Arts, Brooklyn Arts Council, LMCC (Manhattan), Staten Island Arts, and NYFA. This confirmed the borough partner list and is where the Brooklyn Arts Council grants page came from.

### Second crawl (writers, poets, dancers, actors, musicians, comedians)
Crawled about 40 more NYC organizations with a time limit per site. Pages with a stated future deadline:
- **Staten Island Arts:** DCLA Art Fund Grant, DCLA Premier Grants, NYSCA Encore Grant (due Jan 31, 2027) and Arts-in-Education Grants (Feb 7, 2027). All added.
- **Movement Research** (dance, Manhattan): Artist-In-Residence, due Nov 10. Added.
- **HERE** (performance, Manhattan): Performance Lab, due Oct 31. Added.
- **Smack Mellon** (visual art, Brooklyn): 2027-28 Artist Studio Program and Emerging Artist Summer 2027 Group Exhibition, both due Dec 1. Added.
- **Flushing Town Hall** (Queens): arts grants, due Dec 1. Added.
- **Lower East Side Printshop** (visual art, Manhattan): Keyholder Residency and Summer Keyholder Residency. Added.
- **Brooklyn Arts Council:** the grants page at /what-we-do/grants (not /grants) lists four programs. Their 2027 cycle closed Oct 11, so they drop out until the next cycle. Added to the source list.
- **Brooklyn Poets:** pages for a mentorship program (Nov 4?) and fellowships. The dates are unclear, so not added. **Lead for poets.**
- **Franklin Furnace:** grants for performance art (Feb 2027?). The page gives no borough, so not added.
- **Poets & Writers:** writing contests with deadlines (for example Oct 30 and Oct 31). They are national, not NYC, so not added.
- **No stated deadlines found** on Dance/NYC, Danspace Project, Gallim, Kundiman, Dixon Place, The Tank (summer festival only), Ars Nova, Roulette, Bang on a Can, Pioneer Works, Creative Capital, SummerStage, Academy of American Poets, Actors' Equity, Theater for the New City and Writers Room. Several of these pages may carry deadlines in a form the date matcher misses.
- **Did not load** (time-outs, blocks or wrong addresses): Center for Fiction, Poets House, Cave Canem, Joyce Theater, La MaMa, Public Theater, Carnegie Hall, Queens Theatre, Governors Island Arts, Foundation for Contemporary Arts, Wave Hill, Socrates Sculpture Park, NYC Parks Art & Antiquities.

### New sources built
- **FireMics** ([backfill/firemics.py](backfill/firemics.py)): the NYC open mic schedule, about a week ahead. 50 recurring mics after collapsing repeats: Manhattan 40, Brooklyn 8, Queens 2. The page lists none in the Bronx or Staten Island. Each mic is one `open_mic` record with its next date. The page repeats every row for its mobile and desktop layouts, and day headers sit at the end of the previous day's last row. The parser handles both.
- **NYC arts organizations** ([backfill/orgs.py](backfill/orgs.py)): one list of 28 hand-picked program pages with borough, type and artist category written beside each. The title is set by hand and the deadline is read from the page text. 22 are stored; expired ones are dropped.

### Snapshot after this pass (2026-10-27 17:05)
- **99 records**, up from 27. By source: FireMics 50, A4 26, NYC arts organizations 22, NYC Parks 1.
- **By borough:** Manhattan 68, Brooklyn 12, Queens 8, Bronx 6, Staten Island 4, unknown 1.
- **By type:** open mics 50, grants 21, open calls 19, residencies 5, auditions 4.
- **By artist category:** Comedy 48, All disciplines 18, Visual art 13, Performing arts 6, Needs review 6, Dance 4, Film & media 2, Writing & publishing 1, Music 1. **Poetry and Singing have none.**
- [snapshot.md](data/snapshot.md) now starts with a link to the [dashboard](https://claude.ai/artifact/1KJoDsygR95xDTkuCN2dwU), whose data was refreshed to these 99 records.

### Gaps against Mara's target disciplines
- **Comedians:** covered by open mics (Manhattan, Brooklyn, Queens). No Bronx or Staten Island mics found.
- **Visual artists:** covered in every borough except Queens (only grants).
- **Dancers:** 4 records (Movement Research, Bronx Dance Fund, two A4 auditions).
- **Actors:** 4 audition records, all from A4. The audition boards (Backstage, Casting Networks, Actors Access) are blocked or gated.
- **Musicians and singers:** 1 record each at most. The music sources are blocked (MTA), gated (Sofar, Apollo are single programs) or national (Grants.gov).
- **Poets and writers:** 1 writing record, no poetry. Brooklyn Poets is the best lead. Poets & Writers lists national contests.
- **Bronx and Staten Island:** grants only, no open calls or mics.

### Next
1. Read the Brooklyn Poets pages for real fellowship and mentorship dates, and add them.
2. Find music and singing sources with open submissions in every borough. The curated entries (SOB's, Sofar, Apollo, MTA Music) are single records each.
3. Look for Bronx and Staten Island open mics and open calls.
4. Review the "Needs review" listings with Jon.

---

## 15. Browser crawler, session Extractor and your links (2026-10-27)

### How the pipeline works now
1. **Crawler** ([backfill/crawler.py](backfill/crawler.py)): renders each page in a real browser (Playwright), follows same-site links two levels deep, honors robots.txt, waits between requests, and saves each page's text to `data/pages/<site>/` (not committed). Seeds are in [backfill/seeds.json](backfill/seeds.json). A seed can carry a `follow` pattern so only matching links are followed (used for the Dance/NYC listings board).
2. **Extractor (this session, until the Claude API is attached):** reads the saved pages with [backfill/digest.py](backfill/digest.py) and writes one entry per opportunity into [backfill/extracted.json](backfill/extracted.json). Each entry carries a quote copied from the page.
3. **Validation** ([backfill/extracted.py](backfill/extracted.py)): an entry is stored only if its quote appears in the saved page, its type and borough are allowed, its deadline is a real date, and an entry with a "citywide" or "unknown" borough shows a quote proving it is in NYC. 22 of 22 entries pass.
4. **Backfill** reads `extracted.json` as one more source, so everything lands in the snapshot, the `.md`, the `.csv`, the `.json` and the dashboard.
5. **Pages saved by hand:** a page the crawler cannot reach can be saved as a `.txt` file in `data/pages/manual/`, with the first line `URL: <address>` and the page text below. It can then back a quote like any crawled page.

### Blocks, and what was and was not done
- Mara asked for the blocked pages to be bypassed. A normal headless browser is refused by nyc.gov (Access Denied), mta.info (Access Denied) and backstage.com (403). A request to try a visible browser window was refused by the tool as bot-check circumvention, and **no attempt was made to get past a block**. These stay unreachable by script.
- **Blocked during the crawl:** Center for Fiction, The Public Theater, Carnegie Hall. **No pages loaded:** Cave Canem, Bronx Music Heritage Center, Governors Island Arts.
- **Backstage dance gigs page** (Mara's link): 403 Cloudflare. Option: save the page by hand (see item 5).

### Crawl results (59 seeds)
56 sites loaded and were digested by discipline. Pages with stated future deadlines came from Poets House, GALLIM, Mabou Mines, Playbill Jobs, Dance/NYC, EastVille, The Tiny Cupboard and Brooklyn Poets. Sites with pages but no open call found: Roulette, Bang on a Can, City Parks Foundation, Queens Theatre (open-stage series is past events), Joyce, Danspace Project, Harlem Stage, La MaMa, Dixon Place, Ars Nova, The Tank (internships only), Actors' Equity (studio rentals), Central Casting, Kundiman, NYPL, Academy of American Poets, Writers Room, Bowery Poetry Club, Socrates Sculpture Park, Wave Hill, Foundation for Contemporary Arts, Creative Capital, Queens Museum, Pioneer Works, Sofar Sounds (no artist application text found), Apollo, Make Music New York, SOB's (careers only).

### Dance/NYC listings board (Mara's link)
[dance.nyc/for-artists/listings/Category-Auditions](https://www.dance.nyc/for-artists/listings/Category-Auditions) is a real board with categories for auditions, choreographic opportunities, funding, jobs and training. Listings are user-posted and include a Location line. 30 listing pages were saved. Stored: Kizuna Dance (Brooklyn), Harmony Blossom Prelude (Queens), Alison Clancy and Total Entertainment event casting (citywide), Harlem Tabernacle's play (Manhattan, auditions Nov 8), LDC Curates (due Oct 31), Red Hook Brooklyn Film Festival, Nico Dance Co. and gogo dancers (Manhattan, Oct 31). Skipped: other cities (Boston Dance Theater, MorDance in Dobbs Ferry), invitation-only auditions, jobs and classes.

### Entries added to the snapshot this pass (22 in extracted.json)
- **Poetry:** Brooklyn Poets Mentorship Program (due Nov 4, $6,295 tuition), Poets House Showcase submissions (due Nov 9, free).
- **Dance:** GALLIM audition (due Nov 23, Manhattan, $1,000 to $1,320 a week) plus the Dance/NYC entries above.
- **Theater and performance (Playbill Jobs):** Actors needed for "Yet a Stranger In This World", The People's Theatre NYC Equity Principal Auditions (Nov 5 and 6), Perfect Crime NYC appointments (due Oct 30), "Girl from the North Country" in Staten Island, Virgin Voyages NYC auditions for singers, dancers and drag artists, TheatreMAMA street team performers, a musician listing for The Burn Book Cabaret at 54 Below.
- **Residency:** Mabou Mines SUITE/space (NYC, due Nov 22, two $4,000 stipends, 100 hours of rehearsal space).
- **Comedy (Brooklyn):** EastVille Comedy Club daily open mics (sign up in person, one-drink minimum) and The Tiny Cupboard's application to perform on stand-up shows.
- **Also:** A4's "Free or Subsidized Space" listings are now kept (new `space` type): 2 records.

### Outcome of each link Mara sent this pass
- **Dance/NYC auditions board:** worked, see above.
- **Bronx Museum AIM Fellowship:** application closed October 25, 2026. Not stored. Applications usually open in September, so it should return next cycle.
- **Bronx River Art Center gallery call:** the page is stale (an old "Work In Progress" call with long-past dates). Not stored.
- **A4: 2027 Open Call for Curators, Bronx Council on the Arts:** deadline was September 10, 2026 and A4 has removed it from its board. Not stored.
- **Mabou Mines SUITE/space:** stored.
- **Bolster Arts residency:** applications closed October 4, 2026 (four months of rent-free studio space in Chinatown). The site's fellowship is invitation-only. Not stored. Worth rechecking next June, when applications reopen.
- **Backstage dance gigs:** blocked, see above.

### Snapshot after this pass (2026-10-27 17:59)
- **123 records**, up from 99. By source: FireMics 50, A4 28, extracted 22, NYC arts organizations 22, NYC Parks 1.
- **By borough:** Manhattan 72, Brooklyn 19, Queens 9, Citywide 9, Bronx 6, Staten Island 5, unknown 3.
- **By type:** open mics 51, open calls 27, grants 21, auditions 16, residencies 6, spaces 2.
- **By artist category:** Comedy 50, All disciplines 19, Visual art 13, Dance 12, Music 9, Performing arts 8, Needs review 6, Film & media 3, Poetry 2, Writing & publishing 1. **Singing has none.**
- The dashboard's data was refreshed to these 123 records.

### Gaps against Mara's target disciplines
- **Poets and writers:** 3 records. Poetry Project's Lisa Brannan Prize has no stated deadline. NYC writers' fellowships are not yet found.
- **Singers:** 1 audition (Virgin Voyages) that includes singers. No dedicated singer source.
- **Musicians:** 9, mostly from the Playbill listing and a few A4 items.
- **Actors:** 8 or so from Playbill and A4.
- **Bronx and Staten Island:** grants, plus one Staten Island production. No open mics or open calls.
- **Comedy outside Manhattan and Brooklyn:** none found.

### Next
1. Attach the Claude API key so the Extractor runs on every crawl instead of this session.
2. Read the remaining listing boards (the Dance/NYC funding and choreographic categories, more Playbill Jobs pages).
3. Find singer, poet and writer sources with real boards, as Dance/NYC is for dancers.
4. Review the "Needs review" records with Jon.

---

## 16. Volume sources: Craigslist, Dance/NYC, Playbill Jobs (2026-10-27)

Mara's point: most of the snapshot came from the one or two sites she had handed over, and a count of 123 for all of NYC was too small. This pass built three more sources that return listings in bulk, each as code that reads a structured board (no hand-reading), so a rerun refreshes them.

### What each source reads
- **Craigslist New York** ([backfill/craigslist.py](backfill/craigslist.py)): talent gigs, creative gigs, writing gigs and musician listings, one search per borough (Manhattan, Brooklyn, Queens, Bronx, Staten Island) and category, up to 60 newest each. The borough comes from the search address, so every borough gets coverage. A title must match the kind of work its category is for, which drops listings like nursing jobs and paid focus groups. Search pages only, no posts opened. robots.txt allows search pages. **Craigslist's terms prohibit scraping and it has sued scrapers**; the decision to proceed is Mara's (section 7), and the project is non-commercial.
- **Dance/NYC board** ([backfill/dancenyc.py](backfill/dancenyc.py)): auditions, choreographic opportunities and funding, five pages of each (8 listings a page). Each recent listing is opened for its Location line; only New York City locations are kept (Boston, Watertown and Dobbs Ferry listings are dropped). Deadlines are read only when the text names the year.
- **Playbill Jobs** ([backfill/playbill.py](backfill/playbill.py)): the job tiles, kept only for Performer and Musician categories in New York; each kept listing is opened for its description and deadline.

### Result
- **499 records**, up from 123. By source: Craigslist 311, Dance/NYC 61, FireMics 50, A4 28, NYC arts organizations 22, Playbill Jobs 20, extracted by hand 6, NYC Parks 1.
- **By borough:** Manhattan 185, Brooklyn 128, Queens 66, Staten Island 24, Bronx 19, New York with no borough stated 76, citywide 1.
- **By type:** gigs 315, auditions 59, open mics 51, open calls 39, grants 27, residencies 6, spaces 2.
- **By artist category:** Music 168, Performing arts 109, Dance 67, Visual art 66, Comedy 50, All disciplines 18, Writing and publishing 11, Needs review 6, Film and media 2, Poetry 2.
- The 16 hand-extracted Playbill and Dance/NYC entries were removed from extracted.json because these sources now cover the same boards in full.

### Honest limits
- **Craigslist is 62% of the snapshot** and the quality is mixed: mostly real musician, casting and creative requests, with some noise that passes the title filter (a product design collaborator, a band-forming post). Gigs have no deadline and no posted date in the search view, so they cannot be expired; they are whatever is live on the search page at the time of the run.
- **Dance/NYC listings with no stated deadline can be stale**: the board keeps listings by posting month, and a listing that says "open until September 10th" can still appear. The borough is usually "New York, NY", so it is stored as unknown.
- **Playbill Jobs shows about 180 listings on its main page;** a `?page=` parameter was assumed for more and not confirmed.
- **Poetry (2) and writing (11) are still thin.** Craigslist writing gigs are mostly copywriting and ghostwriting, not literary calls. Singers are inside the Music and Performing arts counts, not separate.
- **Meetup** (open mics, poetry slams, songwriter circles) loads in the browser and has real NYC mics, but its event pages give no machine-readable location (many are New Jersey or virtual), so it was not built. Reddit returns 403 to scripts.
- The dashboard is now shared by link, so these records, which include Craigslist titles and links, are visible to anyone with the link. Listing text was never stored in the dashboard data, only titles, labels and links.

---

## Appendix: browser crawl log (2026-10-27)

Moved here from data/crawl_log.txt. 59 seed sites crawled with the Playwright crawler (up to 20 pages each, 2 levels deep), 1006 pages saved in all.

**Blocked by the site (no pages, no workaround attempted):** Center for Fiction, Public Theater, Carnegie Hall.

**No pages loaded:** Cave Canem, Bronx Music Heritage Center, Governors Island Arts.

**Pages saved per site:**

- Brooklyn Poets: 20
- Poetry Project: 20
- Poets House: 19
- Kundiman: 20
- Asian American Writers Workshop: 19
- NYPL Cullman Center: 20
- Academy of American Poets: 17
- Writers Room: 20
- Bowery Poetry Club: 8
- Dance/NYC: 20
- Danspace Project: 20
- Gallim: 20
- Joyce Theater: 19
- Movement Research: 19
- Harlem Stage: 20
- Dixon Place: 20
- La MaMa: 18
- Ars Nova: 20
- The Tank: 20
- Theater for the New City: 17
- Actors Equity: 20
- Playbill Jobs: 15
- Central Casting: 20
- Roulette: 19
- Bang on a Can: 20
- City Parks Foundation: 20
- Queens Theatre: 20
- Flushing Town Hall: 20
- Snug Harbor: 20
- Sofar Sounds: 18
- Apollo Theater: 20
- Make Music New York: 20
- Colored Colors: 20
- SOBs: 20
- New York Comedy Club: 20
- EastVille Comedy Club: 20
- Tiny Cupboard: 18
- Socrates Sculpture Park: 10
- Wave Hill: 20
- Foundation for Contemporary Arts: 20
- Creative Capital: 19
- Queens Museum: 20
- Bronx Museum: 20
- Pioneer Works: 11
- Franklin Furnace: 20
- Residency Unlimited: 20
- ISCP: 20
- NARS Foundation: 20
- Queens Arts Fund (Flushing): 20
- Bronx Council on the Arts: 20
- Staten Island Arts: 20
- Brooklyn Arts Council: 20
- LMCC: 20

### Corrections to the volume sources (2026-10-27, later the same day)
Mara sent a Playbill listing ("Actors for Student Written and Directed One-Act Plays") that exposed two deadline bugs. Both are fixed, and the full backfill was rerun.
- **Playbill read deadlines from the "Related Jobs" list** at the bottom of each job page, so a listing could inherit another listing's deadline (this one showed Nov 9 from a Vermont theater's audition). The source now reads only the job's own description.
- **The date matcher could skip past a deadline to a later date:** "before 10/31 DURATION Nov 9, 2026" came out as Nov 9. A deadline word may now be followed by a date only if no digit or slash sits between them, and a numeric date with no year ("before 10/31") is read as the next one coming. The Dance/NYC deadlines were checked against their source text and were already correct.
- **Snapshot after the fixes: 500 records** (Craigslist 312, Dance/NYC 61, FireMics 50, A4 28, NYC arts organizations 22, Playbill Jobs 20, extracted by hand 6, NYC Parks 1). By borough: Manhattan 185, Brooklyn 128, Queens 67, Staten Island 24, Bronx 19, New York with no borough stated 76, citywide 1. By type: gigs 316, auditions 59, open mics 51, open calls 39, grants 27, residencies 6, spaces 2. 58 tests pass.
- The dashboard's data was refreshed to these 500 records.

### Playbill Jobs fixes, round two (2026-10-27, evening)
Mara sent three more Playbill listings. They exposed three more problems, all fixed and the backfill rerun.
- **Listings with a vague place were dropped.** "Auditions for a New Boricua Play" (Flamboyan Theatre) has the place "NY" on its tile, but its description gives the audition address (AMDA Studios, 250 W 54th St, New York, NY 10019, November 15). A tile with no city, or only "NY", now falls back to the description: an NYC zip code, borough name or "NYC". A listing clearly in another state is only kept if its title names NYC (for example "New York City Auditions"). Playbill went from 20 to 46 records, mostly NYC Equity Principal Auditions (EPAs) and "submit for NYC appointments" calls.
- **The title's deadline now wins** over a date in the description ("Much Ado About Nothing, Deadline: 11.09.26" had been stored as Nov 5).
- **Show-run dates are not deadlines.** "Through March 14, 2027" had been read as an audition deadline, so listings of work now use stricter deadline wording than the grant boards do. An EPA listing takes its audition date from the title, "NYC EPA (11.05.26)".
- 23 Playbill records now carry a deadline; each was checked against its title.

### Pages that stay blocked
- **Casting Networks** [NYC casting calls](https://www.castingnetworks.com/new-york-city-casting-calls/) (Mara's link): 403 Forbidden, the same as its home page and robots.txt. Backstage returns the same. No attempt was made to get past the block. Option: screenshots or a hand-saved copy taken in a normal browser, which can be read and added.

### Snapshot after these fixes: 526 records
- By source: Craigslist 312, Dance/NYC 61, FireMics 50, Playbill Jobs 46, A4 28, NYC arts organizations 22, extracted by hand 6, NYC Parks 1.
- By borough: Manhattan 186, Brooklyn 128, New York with no borough stated 101, Queens 67, Staten Island 24, Bronx 19, citywide 1.
- By type: gigs 316, auditions 85, open mics 51, open calls 39, grants 27, residencies 6, spaces 2.
- 63 tests pass. The dashboard's data was refreshed to these 526 records.

---

## 17. Master list: every site tried (2026-10-27)

**Yes** = the pages loaded and were read. **Partly** = the home page or one page loaded and little else was read. **No** = blocked, unreachable, empty, parked or closed. **Not tried** = skipped on purpose (robots.txt names Anthropic crawlers, robots disallows all crawling, or it needs a login). The 60 seeds in [backfill/seeds.json](backfill/seeds.json) were crawled with a real browser; the earlier sites were checked with plain requests or the first crawler.

### Open data and APIs
- **Yes:** NYC Parks events feed (built), NYC Open Data catalog, Temporary Art Program, Permitted Event Information, Parks Public Programs Special Events (2019 to 2020 ranger events, not useful), Grants.gov API (federal institutional grants, not a fit), DCLA "Funding for Artists" page.
- **Catalog only:** DCLA Cultural Organizations, Percent for Art, DCLA Programs Funding, Public Design Commission inventory.
- **No:** Simpler.Grants.gov API (401, needs a key).

### Visual art, grants and residencies
- **Yes:** A4 (built), Hyperallergic, Residency Unlimited, ISCP, Flux Factory, Bronx Council on the Arts, apexart, NARS Foundation, LMCC, Brooklyn Arts Council, Staten Island Arts, Flushing Town Hall, Bronx Museum, Queens Museum, Franklin Furnace, Socrates Sculpture Park, Wave Hill, Pioneer Works, Creative Capital, Foundation for Contemporary Arts, Smack Mellon, Lower East Side Printshop, Studio Museum, MoMA PS1, Public Art Fund, Weeksville, Culture Lab LIC, Kupferberg Center, Bronx River Art Center (page out of date), Bolster Arts, Mabou Mines, FABnyc, HERE, Poets & Writers (national).
- **Partly:** CaFE, ArtConnect, TransArtists, Submittable Discover (loaded, terms read; CaFE and ArtConnect prohibit scraping), Dumbo Arts (1 page), New Museum (1 page).
- **No:** NYFA (403), BRIC (403), Queens Council on the Arts (403), nyc.gov DCLA public art opportunities page (Access Denied), Brooklyn Museum, The Kitchen, Artists Space, Governors Island Arts and NYC Parks Art & Antiquities (no pages loaded), NY Art Beat (shut down).
- **Not tried:** EFA (robots.txt names Anthropic crawlers).

### Actors and casting
- **Yes:** Playbill Jobs (built), Central Casting (services and login pages only), Actors' Equity (studio rentals only).
- **Partly:** Actors Access (home page and terms; breakdowns need a login), NYCastings (just a redirect to DirectSubmit).
- **No:** Backstage (403, including the dance gigs page), Casting Networks (403, including the NYC casting calls page), DirectSubmit (empty JavaScript page, likely gated).

### Musicians and singers
- **Yes:** SOB's, Sofar Sounds, Apollo Theater, Make Music New York, Colored Colors, Roulette, Bang on a Can, City Parks Foundation, Queens Theatre, Snug Harbor, Harlem Stage, Flushing Town Hall.
- **Partly:** Musicalchairs (home page, no feed found), MTA Music (its Submittable page loaded; the mta.info page is blocked).
- **No:** MTA Music page on mta.info (Access Denied), Carnegie Hall (blocked), Bronx Music Heritage Center (no pages loaded), String Orchestra of Brooklyn (my address guess failed).
- **Not tried:** Bandsintown (needs written consent), VenuePilot.

### Comedy
- **Yes:** FireMics (built), New York Comedy Club, EastVille Comedy Club, The Tiny Cupboard.
- **Partly:** New York Comedy Festival (home page; submissions closed until July 2027, per Mara).
- **No:** OpenMYC (the addresses I had are parked pages), Gotham Comedy Club (403), Bushwick Comedy Club (the address redirects to The Tiny Cupboard).
- **Not tried:** Brooklyn Comedy Collective and The PIT (robots.txt names Anthropic crawlers).

### Dance, theater and writing
- **Yes:** Dance/NYC listings (built), Danspace Project, GALLIM, Joyce Theater, Movement Research, Dixon Place, La MaMa, Ars Nova, The Tank, Theater for the New City, Brooklyn Poets, Poetry Project, Poets House, Kundiman, Asian American Writers Workshop, NYPL Cullman Center, Academy of American Poets, Writers Room, Bowery Poetry Club.
- **No:** The Public Theater (blocked), Center for Fiction (blocked), Cave Canem (no pages loaded).

### Aggregators and general sites
- **Yes:** Craigslist New York (built, search pages for all five boroughs).
- **Partly:** Meetup (renders in the browser but gives no location, so not built).
- **No:** Reddit (403).
- **Not tried:** Eventbrite (robots.txt disallows all crawling).

### Totals
About 127 sites and datasets were tried: **80 yes, 12 partly, 25 no, 6 not tried on purpose, and 4 data sets seen only in the catalog.** Eight sources feed the snapshot (Craigslist, Dance/NYC, FireMics, Playbill Jobs, A4, NYC arts organizations, pages read by hand, NYC Parks).
