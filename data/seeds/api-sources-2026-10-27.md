# API and structured-source expansion

Prioritize artist compensation and grants, then free participation. Adapters live in `ingest/apis.py` (tests in `ingest/test_apis.py`). They produce candidate records only; a candidate joins a snapshot after the usual verification (quote on the record's own page, URL returns 200).

Scope is the 12 jurisdictions within reach of an NYC artist: NY, NJ, CT, PA, MA, RI, VT, NH, ME, DE, MD, DC.

| Source | Priority | Intended use | Access | Status (2026-10-28) |
|---|---|---|---|---|
| [Grants.gov opportunity search](https://www.grants.gov/api/common/search2) | high | Posted Arts and Humanities grants open to individuals; organization-only awards are dropped. Federal calls are tagged `region: "national"`. | none | Adapter `grants_gov` runs live. 22 posted AR/HU grants today, all organization-only, so 0 candidates. |
| [SAM.gov contract opportunities](https://open.gsa.gov/api/get-opportunities-public-api/) | high | Paid creative contracts; searched by six creative NAICS codes nationwide (fits the 10 requests a day a personal key gets), then filtered to the 12 jurisdictions by place of performance. | API key (`SAM_API_KEY`) | Adapter `sam_gov` built and unit-tested; not run live, no key. |
| [USAJOBS job search](https://developer.usajobs.gov/api-reference/get-api-search) | high | Salaried arts-related positions. | API key | Not built: the API host's robots.txt disallows all agents. |
| [NYC City Record Online open data](https://catalog.data.gov/dataset/city-record-online) | high | Creative-service solicitations and commissions from NYC agencies. | none (Socrata) | Adapter `city_record` runs live. 196 open solicitations today, none creative, so 0 candidates. |
| [NYC Jobs Postings](https://data.cityofnewyork.us/City-Government/Jobs-NYC-Postings/kpav-sd4t) | high | Paid creative NYC government jobs (designers, writers, media) with salary. External postings only; internal ones are open only to current city employees. Engineering "design" and procurement "writer" titles are excluded. | none (Socrata) | Adapter `nyc_jobs` runs live: 5 of about 1,300 open postings. |
| [NYC Event Calendar API](https://api-portal.nyc.gov) | medium | Participatory NYC workshops and classes (Arts and Culture category). | API key (`NYC_API_KEY`) | Adapter `nyc_events` built and unit-tested; not run live, no key. |
| [Eventbrite API](https://www.eventbrite.com/platform/api) | low | Re-reads events we already found on crawled venue pages (`data/api/eventbrite_ids.json`). Eventbrite shut down public event search on 2019-12-12, so the API cannot discover new events; the organizer-events endpoint the adapter uses is no longer in the docs. | private token (`EVENTBRITE_TOKEN`) | Adapter `eventbrite` built and unit-tested; not run live, no token. |
| [The Events Calendar public REST API](https://dev.theeventscalendar.com/knowledgebase/introduction-to-the-events-calendar-rest-api/) | medium | Organizer workshops, jams and participatory programs, from the sites listed in `data/api/tribe_origins.json`. Public endpoint existence does not grant reuse rights. | none, per organizer site | Adapter `tribe_events` runs live: 21 sites (11 found by sweeping all 334 seed and lead origins), 68 candidates from 12 of them, 40 not yet in the snapshot. Society of Illustrators, NYC Parks and New Museum disallow the path; Monira Foundation is held (robots blocks AI crawlers on its homepage). |
| [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) | low | Venue/program discovery only. Ticket price is an attendee cost, not artist compensation. | API key | Not built: attendee tickets, not opportunities for artists. |

Every request passes one gate: the paid display-only denylist, then robots.txt for the exact URL (query string included) for ClaudeBot, anthropic-ai, Claude-User and `*`. Requests identify as `OpportunityResearch/1.0`, the same identity as the crawler.

Use provider IDs and canonical URLs to deduplicate across APIs and existing records. Normalize compensation separately from application/participation costs. Recurring Events Calendar occurrences are grouped into one record with `event_dates`. Confirm provider terms, attribution, retention and rate limits before enabling ingestion. No API keys or subscriptions have been created; keyed adapters skip with a message until their environment variable is set.

Grants.gov and Simpler.Grants.gov are alternative interfaces to overlapping federal opportunities; do not double-count them.

Run:

```
python3 -m ingest.apis --out data/api/<date>/candidates.json            # all adapters; keyed ones skip without keys
python3 -m ingest.apis tribe_events --out data/api/<date>/candidates.json
```
