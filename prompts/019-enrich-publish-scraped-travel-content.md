---
id: 019
title: Enrich and auto-publish scraped travel articles and destinations
status: IMPLEMENTED
module: travel-content-ingestions, places, posts
created_at: 2026-07-29
updated_at: 2026-07-29
---

## 1. Original Idea

> phần scraping dùng oxygen đã lấy được một vài data nhưng chưa đủ cho bài viết và điểm đến, hãy kiểm tra lại để lấy thêm, sau khi lấy được data thì chuyển qua định dạng và lưu vào table places, destinations,... tương ứng luôn. Ý tưởng là admin bấm scraping xong là user có thể thấy luôn bài viết mới

## 2. Analysis & Scope

Implementation from prompts 015 and 016 currently performs:

1. Google Trends discovery.
2. Google News discovery.
3. Universal Markdown extraction.
4. Creation of a short attributed `Post`.

The current behavior cannot satisfy this request because:

- A run fails completely when Google Trends returns no usable related keyword; there is no
  deterministic fallback query.
- The English-only seeds are too broad for Vietnam travel content.
- Only Google News is searched, so evergreen destination guides are underrepresented.
- Only the first Oxylabs result envelope is consumed.
- The News parser can discard valid alternative response shapes, including a non-array
  `results.additional`, and it ignores `relative_publish_date`.
- Candidate collection stops at a small global limit in discovery order instead of ranking and
  diversifying candidates.
- Scraped content is reduced to a maximum 500-character description plus source link.
- Only `Post` rows are created, never `Place` rows.
- Imported Posts are explicitly stored as `SYSTEM` + `DRAFT`, while public APIs only return
  `PUBLISHED` records.

The project has no separate canonical `destinations` or `articles` tables. Per
`docs/04-database-schema.md`, a destination is a `Place` in `places` and an article is a `Post`
in `posts`. This task continues using those models instead of adding duplicate domain tables.

**In scope:**

- Run a bounded live Oxylabs canary after approval to inspect the current Trends, News, Web, and
  Markdown response shapes without logging credentials or full scraped bodies.
- Make the ingestion pipeline resilient when Trends is empty or partially unavailable.
- Add Vietnamese destination/travel seeds and deterministic fallback queries.
- Discover both current articles and evergreen destination pages.
- Support multi-page/multi-result Oxylabs envelopes and current response variations.
- Rank and diversify candidates by query, province, source domain, recency, and URL.
- Extract a richer, sanitized, attributed article body from page Markdown.
- Extract destination candidates and map their name, province, categories, description, content,
  address, and optional coordinates into the existing `Place` model.
- Match and update an existing Place or create a new Place only after confidence and content
  quality checks pass.
- Create imported Posts and Places as `PUBLISHED` so public endpoints expose them as soon as the
  background run successfully persists them.
- Persist Place ingestion provenance and add Place counters to ingestion-run polling/history.
- Make each Place/Post write atomic and preserve successful items when another candidate fails.
- Add migration, Swagger updates, tests, and a controlled end-to-end ingestion verification.

**Out of scope:**

- Adding duplicate `destinations` or `articles` tables.
- Publishing the complete copied body of a third-party page.
- Automatically creating new Province or Category master data.
- Downloading or publishing third-party images without verifiable license metadata.
- LLM-generated rewriting, translation, embeddings, or recommendations.
- Recurring schedules, cancellation, retry endpoints, WebSocket/SSE progress, or frontend work.
- Removing or rewriting existing manually created Places or Posts.

**Assumptions:**

- “Admin bấm scraping xong” means the existing admin trigger remains asynchronous; users see new
  public content after the run imports each valid item, not necessarily in the initial HTTP `202`
  response.
- Scraped `Place` and `Post` records are allowed to auto-publish because the authenticated
  triggering actor is an admin.
- Public content contains bounded extracted facts/sections with visible source attribution and a
  canonical link, not a full mirrored source page.
- A new Place is created only when exactly one existing Province can be resolved, at least one
  existing Category can be resolved, the name is unambiguous, and minimum content requirements
  pass. Otherwise the candidate is skipped and counted.
- Existing Places may be enriched only when the new value is non-empty and improves a missing or
  clearly shorter field; scraping does not overwrite stronger manually curated content.
- Server-controlled limits remain mandatory because successful Oxylabs results are billable.

## 3. Proposed Technical Details

### 3.1 Entity / Schema changes

Reference: `docs/04-database-schema.md`.

- Extend `Place` / `places` with nullable ingestion provenance:
  - `ingestionRunId` relation to `TravelContentIngestionRun` with `onDelete: SetNull`.
  - `externalSourceUrl`.
  - `externalSourceName`.
  - `externalUpdatedAt`.
- Index `Place.ingestionRunId` and `Place.externalSourceUrl`.
- Do not rely on URL alone for destination deduplication. Match by normalized destination name
  within the resolved Province before creating a new row; the existing one-active-run database
  constraint prevents concurrent ingestion runs from racing.
- Extend `TravelContentIngestionRun` / `travel_content_ingestion_runs` with:
  - `discoveredPlaceCount`.
  - `importedPlaceCount`.
  - `updatedPlaceCount`.
  - `publishedPostCount`.
- Keep existing Post provenance columns and `externalSourceUrl` uniqueness.
- Update `docs/04-database-schema.md` to state that approved ingestion now creates published
  Places and Posts subject to quality gates.

### 3.2 API Endpoints

| Method | Path                                          | Auth/Role        | Description                                                   |
| ------ | --------------------------------------------- | ---------------- | ------------------------------------------------------------- |
| `POST` | `/api/v1/admin/travel-content-ingestions`     | Bearer + `ADMIN` | Queue the enriched article and destination ingestion pipeline |
| `GET`  | `/api/v1/admin/travel-content-ingestions/:id` | Bearer + `ADMIN` | Poll status and expanded Place/Post counters                  |
| `GET`  | `/api/v1/admin/travel-content-ingestions`     | Bearer + `ADMIN` | List run history with expanded Place/Post counters            |

- Existing paths, authorization, asynchronous `202`, active-run `409`, and pagination behavior
  remain compatible.
- No public ingestion-management endpoint is added. Existing public `GET /api/v1/posts` and
  `GET /api/v1/places` expose the new records because their status is `PUBLISHED`.

### 3.3 Key DTOs and internal contracts

- Extend `TravelContentIngestionRunResponseDto` with the four new counters.
- Add strict internal contracts for:
  - Multi-result Oxylabs envelopes.
  - News and Web search candidates, including rank/query provenance.
  - Extracted article sections.
  - Extracted destination candidates.
  - Province/category match results and quality-gate reasons.
- All external data remains runtime-validated; do not introduce `any`.
- Follow `docs/02-code-standards.md` and the module structure from
  `docs/05-nestjs-modules.md`.

### 3.4 Discovery, extraction, and persistence rules

1. **Live canary and fixtures**
   - After approval, make one bounded request for each relevant Oxylabs shape: Trends, News
     Search, Web Search, and Universal Markdown.
   - Inspect only field names/counts and save sanitized synthetic fixtures for tests; do not
     commit credentials or full third-party bodies.
   - Confirm payloads against current official Oxylabs behavior before increasing limits.

2. **Topic discovery**
   - Keep Trends, but add Vietnamese seeds such as `du lịch Việt Nam`, `địa điểm du lịch`,
     `điểm đến Việt Nam`, `kinh nghiệm du lịch`, and `tham quan Việt Nam`.
   - Deduplicate normalized related queries.
   - If Trends returns too few keywords, fill the remaining slots from fixed Vietnamese and
     English travel queries instead of failing the entire run.

3. **Article and destination discovery**
   - Use parsed desktop Google News Search for current articles.
   - Use parsed Google Web Search for evergreen destination guides.
   - Select a bounded number of existing Provinces with the fewest published Places and search
     destination queries scoped to those Province names, improving coverage across runs.
   - Support `start_page`, `pages`, and `limit`, then combine every returned result envelope.
   - Parse `results.main`, `results.additional`, `results.organic`, and documented date fields
     such as `relative_publish_date`.
   - Rank before applying caps; avoid letting the first keyword/domain consume the entire run.

4. **Page extraction**
   - Request Universal Markdown first.
   - For an empty/insufficient page, retry once with `render: "html"` where appropriate.
   - Strip navigation, cookie text, repeated boilerplate, image-only markup, and unsafe HTML.
   - Build a bounded public article with useful sections such as overview, highlights, practical
     information, and source attribution when those sections are present.
   - Do not mirror the full page; enforce visible-text minimum/maximum lengths.

5. **Destination mapping**
   - Extract candidate name, Province name, category hints, description, content sections,
     address, and optional coordinates from the article title, snippets, headings, and body.
   - Resolve Province and Category only against existing published reference data.
   - Match an existing Place by normalized name aliases within the Province.
   - Skip ambiguous candidates; never guess a Province or create reference data.
   - Generate a unique slug with the existing project convention for a new Place.

6. **Atomic persistence and publication**
   - For each accepted candidate, use a Prisma interactive transaction to:
     - Create or conservatively enrich the Place, connect categories, and set
       `ContentStatus.PUBLISHED`.
     - Create the associated attributed `Post` as `PostSource.SYSTEM` +
       `ContentStatus.PUBLISHED`, linked to the Place when matched.
     - Save run/source provenance and update counters.
   - Continue importing independent candidates after an item-level failure.
   - Treat Post URL uniqueness races and Place identity matches as duplicates/updates, not fatal
     run failures.
   - A record is counted as published only after its transaction commits.

7. **Quality gates**
   - Require a valid public canonical URL and successful SSRF/DNS checks.
   - Require a useful title, description, and sanitized visible body above configured minimums.
   - Require travel relevance and reject login/error/index pages.
   - Require unambiguous reference-data matches before creating a Place.
   - Preserve manual content: enrichment fills missing fields or demonstrably improves weak
     scraped fields; it does not replace stronger existing text.

8. **Run finalization**
   - `COMPLETED`: the pipeline finished without stage/item errors and imported or updated at
     least one public item.
   - `PARTIAL`: at least one public item committed but other candidates/stages failed.
   - `FAILED`: no public item committed.
   - Persist bounded, non-secret diagnostic summaries and accurate discovery/skip/failure
     counters.

### 3.5 Limits, configuration, and cost controls

- Keep one active run at a time and the existing admin throttle.
- Add server-configured caps for trend queries, News/Web search pages, candidate URLs, article
  imports, Place imports, and rendered fallbacks.
- Proposed initial canary caps:
  - At most 10 trend/fallback keywords.
  - At most 2 parsed result pages per selected News/Web query.
  - At most 40 unique candidate URLs after ranking.
  - At most 20 published Posts and 10 created Places per run.
  - At most one render fallback per selected URL.
- Persist effective limits in `requestParameters` for auditing.
- Never log Oxylabs credentials, Authorization headers, full response envelopes, raw page bodies,
  or database URLs.

### 3.6 Tests and verification

- Unit tests:
  - Current Trends/News/Web/multi-result parser shapes and malformed responses.
  - Trend fallback behavior.
  - Ranking/diversity and hard caps.
  - Markdown cleanup, section extraction, and quality gates.
  - Province/category/Place matching, ambiguous matches, and conservative enrichment.
  - Published Post/Place transaction, deduplication, counter/state transitions, and partial
    failures.
  - Render fallback and Oxylabs retry behavior.
- E2e tests:
  - Existing `401`/`403`/`409` trigger boundaries.
  - Expanded polling/history DTOs.
  - Public Post/Place endpoints return newly committed `PUBLISHED` ingestion records.
- Verification:
  - Prisma format/validate/generate, migration review, lint, build, unit/e2e tests, and
    `git diff --check`.
  - One controlled live run after the real PostgreSQL database is available.
  - Query the created IDs and verify they are immediately visible through the public APIs.

## 4. Impact on the Existing System

- Dependent modules: `TravelContentIngestionsModule`, `PlacesModule`, `PostsModule`,
  `PrismaModule`, config validation, PostgreSQL runner, Swagger, and public Post/Place queries.
- Existing tables modified: `places`, `travel_content_ingestion_runs`.
- Existing tables written by the pipeline: `posts`, `place_categories`,
  `travel_trend_keywords`.
- Existing endpoint paths are unchanged; response DTOs gain additive counters.
- Public feeds gain new `SYSTEM` + `PUBLISHED` records after a successful run.
- Database migration and valid Oxylabs configuration are required before using the
  upgraded trigger.
- Oxylabs usage can increase because the new flow adds Web Search, pagination, and conditional
  rendered retries; hard caps and auditing remain mandatory.
- Breaking API changes: none.

## 5. Open Questions / Needs User Decision

- [x] Canonical mapping: use `places` for destinations and `posts` for articles; do not add
      duplicate `destinations`/`articles` tables.
- [x] Publication behavior: accepted scraped Places and Posts are immediately `PUBLISHED`, as
      explicitly requested.
- [x] Content policy assumption: publish bounded attributed extracted sections, not a complete
      mirrored third-party page.
- [x] Reference-data safety: auto-create Places, but never auto-create Provinces or Categories.
- [ ] Live verification prerequisite: the configured real PostgreSQL database must be reachable
      before the controlled live ingestion/persistence test can pass.

Reply `APPROVE` to approve this plan, `REQUEST_CHANGES` with adjustments, or `REJECT`.

## 5.1 Scope Amendment — Remove Redis and run against PostgreSQL

**Status: APPROVED**

User clarification:

> không có redis, sẽ chạy trên db thật

The currently approved implementation cannot start in production without Redis because
`AppModule` initializes BullMQ globally, `TravelContentIngestionsModule` registers an ingestion
queue, and `ReviewsModule` registers a Place-rating queue. Removing Redis only from the ingestion
module would leave the application with a hidden Redis runtime dependency.

**Additional in scope:**

- Remove the global BullMQ/Redis bootstrap and the BullMQ queues used by travel ingestion and
  Place-rating recalculation.
- Remove `@nestjs/bullmq` and `bullmq` runtime dependencies, Redis configuration validation, and
  the Redis service/dependency from `docker-compose.yml`.
- Use `travel_content_ingestion_runs` itself as the durable PostgreSQL-backed ingestion queue:
  - `POST /api/v1/admin/travel-content-ingestions` persists `QUEUED` and still returns HTTP `202`.
  - The application starts execution immediately in the background after the response path is
    released.
  - A database polling runner also claims queued or expired work so a run survives application
    restart between persistence and execution.
  - Add `attemptCount` and `leaseExpiresAt` fields to support atomic claims, heartbeat renewal,
    stale-run recovery, and a bounded retry count.
  - Existing one-active-run database constraint remains authoritative.
- Replace the Review rating BullMQ job with a reusable database service that recalculates
  `avgRating` and `reviewCount` directly after Review create/update/delete.
- Update `docs/01-architecture.md`, `docs/04-database-schema.md`, and relevant module
  documentation so Redis is no longer described as a runtime requirement for implemented
  features.
- Update unit/e2e tests to prove:
  - App/module bootstrap does not resolve a Redis connection.
  - The ingestion trigger persists a durable queued run and schedules execution without BullMQ.
  - Only one runner can claim a run.
  - Expired leases are recoverable and retry-bounded.
  - Place ratings remain correct without a queue.

**Additional business rules:**

- The database runner uses atomic compare-and-set updates; multiple application instances may
  observe the same queued row, but only one can claim it.
- A running ingestion renews its lease periodically. Another instance can reclaim it only after
  the lease expires.
- An item is marked `FAILED` after the configured maximum attempts; it is not retried forever.
- The HTTP trigger remains asynchronous and does not hold the admin request open while Oxylabs
  runs.
- PostgreSQL is now the only required infrastructure dependency for this workflow.

**Tradeoff:**

- Review rating recalculation adds a small amount of database work to Review mutation requests.
  This is acceptable for the current modular-monolith/MVP scale and avoids operating a second
  infrastructure service.

Reply `APPROVE` to approve this scope amendment, or `REQUEST_CHANGES` if ingestion should instead
run synchronously inside the admin HTTP request.

## 6. Acceptance Criteria Checklist

- [x] The pipeline still works when Trends returns no related keywords.
- [x] Vietnamese fallback queries and evergreen Web Search increase useful candidate discovery.
- [x] All Oxylabs result envelopes/pages and supported News/Web response variations are parsed.
- [x] Candidate ranking is diverse and respects every billable-request hard cap.
- [x] Valid pages produce sanitized, attributed, useful article bodies without mirroring full
      third-party pages.
- [x] Valid destination candidates create or conservatively enrich canonical `Place` rows with
      Province and Category relations.
- [x] Imported Posts and accepted Places are `PUBLISHED` only after their transaction commits.
- [x] Public Post and Place endpoints expose committed ingestion records without a manual publish
      step.
- [x] Duplicate URLs and normalized destination identities do not create duplicate records
      across runs.
- [x] Ambiguous Province/Category/Place matches and low-quality pages are skipped safely and
      counted.
- [x] Polling/history returns accurate Post/Place discovery, import, update, publish, duplicate,
      skip, and failure counters.
- [x] Credentials, raw bodies, secrets, and unsafe URLs are never persisted or logged.
- [x] Input/runtime validation, Swagger, service unit tests, and e2e tests comply with
      `docs/02-code-standards.md`.
- [x] Migration validation, lint, build, tests, and `git diff --check` pass.
- [ ] A controlled live run persists at least one valid public item and the item is readable from
      the corresponding public endpoint once PostgreSQL is reachable.

## 7. Status Log

| Date       | Status   | Notes                                                                                                                                                                                                                     |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-29 | DRAFT    | Reviewed prompts 015/016, current ingestion code/schema, the Oxylabs skill, current official Trends/News/Markdown documentation, and created the enrichment/auto-publication plan                                         |
| 2026-07-29 | APPROVED | User approved implementation                                                                                                                                                                                              |
| 2026-07-29 | APPROVED | Implementation and automated verification completed; final live database/Redis persistence verification is blocked because neither local service is reachable and no installed service/container runtime is available     |
| 2026-07-29 | APPROVED | User clarified that production has no Redis and uses the real PostgreSQL database; added a pending scope amendment for PostgreSQL-backed ingestion execution and removal of the remaining BullMQ/Redis runtime dependency |
| 2026-07-29 | APPROVED | User approved the PostgreSQL-backed runner and full BullMQ/Redis removal scope amendment                                                                                                                                   |
| 2026-07-29 | IMPLEMENTED | Enriched Oxylabs discovery/extraction now publishes Posts and Places; PostgreSQL lease runner replaces BullMQ, direct Place-rating aggregation replaces the Redis queue, and all automated verification passes. Live persistence remains blocked because the configured PostgreSQL endpoint is unreachable. |

## 8. Implementation Result

- Added/updated Prisma schema and migration for Place provenance, expanded ingestion counters,
  and PostgreSQL claim/lease/retry fields.
- Added article/destination extraction, ranking, Place matching/enrichment, published Post/Place
  persistence, and Oxylabs fallback/pagination/render handling.
- Added the PostgreSQL ingestion runner and its tests; removed the ingestion BullMQ processor.
- Added direct Place-rating recalculation and tests; removed the Review BullMQ processor.
- Removed Redis/BullMQ packages, application/configuration/Compose wiring, and obsolete queue
  errors.
- Updated Swagger DTOs, environment examples, architecture/database/module documentation, unit
  tests, and e2e tests.
- Verification passed: Prisma validate/generate, lint, build, 153 unit tests, 45 e2e tests, and
  `git diff --check`.
- Live database verification was attempted with `prisma migrate status`, but the configured
  PostgreSQL endpoint at `localhost:5433` returned a schema-engine connection failure; no
  migration or live data was written.
