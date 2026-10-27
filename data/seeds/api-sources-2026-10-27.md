# API and structured-source expansion

Prioritize artist compensation and grants, then free participation. These are documentation-checked integration candidates, not harvested opportunities or functioning adapters.

| Source | Priority | Intended use | Access |
|---|---|---|---|
| [Grants.gov opportunity search](https://www.grants.gov/api/common/search2) | high | Funded arts projects and grants; screen applicant types because many awards require organizations. | none documented for public search |
| [SAM.gov contract opportunities](https://open.gsa.gov/api/get-opportunities-public-api/) | high | Paid creative contracts; restrict place of performance to NY/NJ/CT and distinguish solicitations from awards or informational notices. | API key required |
| [USAJOBS job search](https://developer.usajobs.gov/api-reference/get-api-search) | high | Salaried arts-related positions; retain salary units, hiring eligibility and actual work location. | API key required |
| [NYC City Record Online open data](https://catalog.data.gov/dataset/city-record-online) | high | Creative-service solicitations and commissions; exclude award notices, hearings and expired solicitations. This is a documented JSON export, not a tested live adapter. | public export; verify query/token requirements before integration |
| [The Events Calendar public REST API](https://dev.theeventscalendar.com/knowledgebase/introduction-to-the-events-calendar-rest-api/) | medium | Organizer workshops, jams and participatory programs; discover actual organizer origins. Public endpoint existence does not grant reuse rights. | public events where organizer enables access |
| [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) | low | Venue/program discovery only unless explicit performer or participant access is advertised. Ticket price is an attendee cost, not artist compensation. | API key required |

Use provider IDs and canonical URLs to deduplicate across APIs and existing records. Normalize compensation separately from application/participation costs. Keep recurring programs separate from dated sessions. Confirm provider terms, attribution, retention and rate limits before enabling ingestion. No API keys or subscriptions have been created.

Grants.gov and Simpler.Grants.gov are alternative interfaces to overlapping federal opportunities; do not double-count them. National sources require regional eligibility/location filters.

Eventbrite and library-vendor internal endpoints are not assumed to offer unrestricted public discovery APIs. Add authorized integrations or documented public feeds only after checking provider access. Public iCalendar/RSS feeds can supplement these APIs when offered by organizers.
