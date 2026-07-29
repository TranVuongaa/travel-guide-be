---
id: 015
title: Crawl trending travel articles with Oxylabs
status: IMPLEMENTED
module: travel-content-ingestion, posts, places
created_at: 2026-07-29
updated_at: 2026-07-29
---

## 1. Original Idea

> use [oxylabs-web-scraper](.agents/skills/oxylabs-web-scraper/) to get google_trends_explore (keywords for travel as this project) then save to our Database

**User clarifications:**

> I mean articles with keyworks are travel, destination,..

> ý tưởng là dùng oxylabs để lấy các bài viết về điểm đến, du lịch xu hướng rồi lưu vào DB trong table như places, destination, articale,... Xem docs thử oxylabs có chạy quét tự động không, ngoài ra tạo thêm 1 api mà gọi tới là thực hiện quy trình quét data và lưu này, cần quyền admin.

## 2. Analysis & Scope

The requested feature is a multi-stage content-ingestion pipeline rather than a keyword-only
import:

1. Discover travel/destination topics with `google_trends_explore`.
2. Search Google News for current articles related to the selected trend keywords.
3. Scrape the selected article pages with Oxylabs `universal` and Markdown output.
4. Validate, deduplicate, classify, and match the articles to existing destinations.
5. Store reviewable article records in the project database.

The current project already models a destination as `Place` (`places`) and an article as `Post`
(`posts`). This task will reuse those canonical tables instead of introducing duplicate
`destination` or `article` models.

**In scope:**

- Add an admin-only API that starts the complete ingestion pipeline as a background job.
- Use these Oxylabs sources/features:
  - `google_trends_explore` for travel/destination trend discovery.
  - `google_search` with News Search context and structured parsing for article discovery.
  - `universal` with Markdown output for validating and extracting article-page content.
- Target Vietnam and use broad travel/destination seed terms.
- Save trend keyword provenance and an auditable ingestion-run record.
- Deduplicate source articles by canonical source URL.
- Create imported articles in the existing `posts` table as `SYSTEM` + `DRAFT`.
- Link an imported Post to an existing `Place` only when an existing Place name can be matched
  confidently in the article title, description, or extracted text.
- Add external-source metadata to imported Posts.
- Enforce bounded request counts, concurrency, timeouts, SSRF protection, error handling, and
  partial-success reporting.
- Add Prisma migrations, Swagger documentation, unit tests, and an admin authorization e2e test.

**Out of scope:**

- Automatically publishing scraped Posts.
- Copying and publishing the complete third-party article body.
- Automatically creating new `Place`, `Province`, or `Category` records from unverified scraped
  text.
- Adding duplicate `Destination` or `Article` tables.
- Images, media downloading, translation, LLM-generated rewriting/summarization, or semantic
  embeddings.
- Creating an Oxylabs Scheduler schedule in the customer's Oxylabs account.
- A recurring application schedule in this iteration; the same queue orchestration can be reused
  by a scheduled trigger in a follow-up task.
- A public endpoint for ingestion runs.

**Assumptions:**

- Default trend seeds are `travel`, `destination`, `travel guide`, `places to visit`, and
  `things to do`.
- Trend searches use `geo_location: VN`, `web_search`, Travel category `67`, and the trailing
  12 months.
- Google News searches use Vietnam localization and request structured desktop results.
- The initial job selects at most 10 unique top/rising trend keywords and imports at most 20
  unique articles in total. These limits cap Oxylabs usage and runtime.
- The authenticated admin who triggers the run becomes `authorId`/`createdById` for imported
  system Posts and any run provenance.
- A Post stores the article title, bounded source excerpt/description, source attribution, and a
  canonical link. Full third-party text is used transiently for relevance/place matching and is
  not republished or retained as Post content.
- Imported Posts require manual review through the existing draft workflow before publication.

## 3. Proposed Technical Details

### 3.1 Oxylabs automatic-scraping finding

Oxylabs Web Scraper API provides a free Scheduler feature:

- Create a recurring schedule with a cron expression, static job `items`, and `end_time`.
- Inspect schedules, runs, and jobs through dedicated endpoints.
- Activate or deactivate an existing schedule.
- Each scheduled scrape still consumes billable scraping usage, and Oxylabs advises testing with
  limited items/repeats first.

The Scheduler is suitable for repeating known/static jobs. It is not the orchestrator for this
feature because later requests depend on dynamic keywords and URLs returned by earlier requests,
and Oxylabs cannot directly write the processed result into this PostgreSQL domain model. This
task therefore uses a NestJS/BullMQ processor for the dependent workflow and calls Oxylabs for
each scraping stage. A future scheduled BullMQ trigger can invoke exactly the same processor
without changing the pipeline.

Official references:

- https://developers.oxylabs.io/scraping-solutions/web-scraper-api/features/scheduler
- https://developers.oxylabs.io/scraping-solutions/web-scraper-api/integration-methods
- https://developers.oxylabs.io/scraping-solutions/web-scraper-api/targets/google/trends-explore
- https://developers.oxylabs.io/scraping-solutions/web-scraper-api/targets/google/search/news-search
- https://developers.oxylabs.io/scraping-solutions/web-scraper-api/features/result-processing-and-storage/output-types/markdown-output

### 3.2 Entity / Schema changes

Reference: `docs/04-database-schema.md`.

- Add `TravelContentIngestionRun` mapped to `travel_content_ingestion_runs`:
  - UUID `id`.
  - `requestedById` relation to the triggering admin.
  - status enum: `QUEUED`, `RUNNING`, `COMPLETED`, `PARTIAL`, `FAILED`.
  - JSON request parameters/seeds.
  - counters for trend keywords, discovered URLs, imported Posts, duplicates, skipped items, and
    failed items.
  - nullable bounded `errorSummary`.
  - `createdAt`, nullable `startedAt`, nullable `completedAt`.
  - indexes for status/time and requester/time.
- Add `TravelTrendKeyword` mapped to `travel_trend_keywords`:
  - UUID `id`, `runId`, `seedKeyword`, discovered `keyword`.
  - trend type enum: `TOP` or `RISING`.
  - nullable numeric `value` and nullable `formattedValue`.
  - nullable Oxylabs job ID/source link.
  - uniqueness on `(runId, seedKeyword, trendType, keyword)`.
  - index for `(keyword, trendType)`.
- Extend `Post`/`posts` with nullable ingestion metadata:
  - `ingestionRunId` relation to `TravelContentIngestionRun`.
  - `externalSourceUrl` with a unique constraint for cross-run deduplication.
  - `externalSourceName`.
  - `externalPublishedAt`.
- No physical `places` columns are changed. An imported Post uses the existing nullable
  `placeId` relation when a confident Place match exists.
- Update `docs/04-database-schema.md` with the new tables, relations, retention, and source
  attribution contract.

### 3.3 API Endpoints

| Method | Path                                      | Auth/Role        | Description                                                    |
| ------ | ----------------------------------------- | ---------------- | -------------------------------------------------------------- |
| `POST` | `/api/v1/admin/travel-content-ingestions` | Bearer + `ADMIN` | Create a run and enqueue the travel content ingestion pipeline |

- Successful response: HTTP `202 Accepted`.
- Response data contains the new run ID and `QUEUED` status; it does not keep the HTTP connection
  open while Oxylabs jobs execute.
- No HTTP request body is required in this iteration; bounded defaults are server-controlled to
  prevent accidental high-cost jobs.
- Concurrent `QUEUED`/`RUNNING` runs are rejected with HTTP `409`.
- Non-admin authenticated users receive `403`; unauthenticated requests receive `401`.
- Apply a dedicated strict throttle to reduce accidental repeated/billable runs.

### 3.4 Key DTOs

- `TravelContentIngestionRunResponseDto`: run ID, status, counters, timestamps, and safe bounded
  error summary.
- Strict internal interfaces for:
  - Oxylabs response envelopes and failures.
  - Google Trends interest/related-query content.
  - Parsed Google News main/additional results.
  - Universal Markdown response content.
- Every external response is runtime-validated before business logic uses it; no `any`.

### 3.5 Pipeline and business rules

1. The controller authorizes `ADMIN`, delegates to the service, and returns `202`.
2. The service atomically rejects an active run or creates a `QUEUED` run, then enqueues a
   BullMQ job containing only the run ID and admin ID.
3. The worker marks the run `RUNNING`.
4. Trend discovery:
   - Send one `google_trends_explore` request for each approved seed.
   - Persist valid top/rising related queries with provenance.
   - Rank/deduplicate them and keep at most 10.
5. Article discovery:
   - Send a parsed Google News Search request for each selected keyword using
     `source: google_search` and News context.
   - Collect structured title, source, excerpt, relative publish date, rank, and URL.
   - Keep no more than 20 unique canonical public HTTP(S) URLs.
6. Article validation/extraction:
   - Reject non-HTTP(S), localhost, private/reserved IP targets, invalid redirects, oversized
     results, unsupported content, empty pages, and clearly irrelevant pages.
   - Scrape selected URLs through `universal` with Markdown output using bounded concurrency.
   - Normalize canonical URLs and recheck database duplicates.
7. Place matching:
   - Compare normalized existing Place/province names with the article title, excerpt, and a
     bounded extracted-text window.
   - Link only an unambiguous existing Place match; otherwise leave `Post.placeId` null.
   - Never create or modify a Place automatically in this task.
8. Post creation:
   - Create `PostSource.SYSTEM` + `ContentStatus.DRAFT`.
   - Use the triggering admin as author.
   - Store a bounded plain-text description/excerpt.
   - Store sanitized HTML containing the excerpt, source attribution, and canonical “read original
     article” link, not the full copied body.
   - Save external source metadata and ingestion run relation.
   - Handle a `P2002` URL race as a duplicate rather than a fatal failure.
9. Finalization:
   - `COMPLETED` when all selected items are handled without errors.
   - `PARTIAL` when at least one Post is imported but one or more stages/items fail.
   - `FAILED` when no usable Post is imported because the run cannot complete.
   - Persist counters and a bounded non-secret error summary.

Additional rules:

- Follow `docs/02-code-standards.md`: controllers contain no business logic, service/processor
  methods are unit-tested, DTOs are validated/documented, and domain errors use stable codes.
- Read credentials only from `OXY_WSA_USERNAME` and `OXY_WSA_PASSWORD`; never persist or log
  credentials, Authorization headers, database URLs, or raw environment data.
- Configure request timeout/retry with bounded exponential backoff for transient `429`/`5xx`
  failures. Do not retry validation/authentication `4xx` errors.
- Do not log scraped article bodies.
- A failed item must not roll back previously imported valid items; each Post import and its
  provenance update is transactional.

### 3.6 Side effects / Async jobs / Cache invalidation

- Adds a dedicated BullMQ queue and processor for travel content ingestion.
- One manual run performs up to:
  - 5 Google Trends requests.
  - 10 Google News Search requests.
  - 20 Universal article requests.
- The exact number can be lower after deduplication or empty results.
- Calls are billable Oxylabs operations. The API throttle and active-run lock prevent accidental
  request amplification.
- Imported Posts are drafts, so public Post feeds and caches are unaffected until an admin
  deliberately publishes them through an approved follow-up workflow.
- No Place cache invalidation is required because Places are read-only in this task.

### 3.7 Expected file/module structure

Per `docs/02-code-standards.md` and `docs/05-nestjs-modules.md`:

- `src/modules/travel-content-ingestions/`
  - module, admin controller, service, queue processor.
  - DTOs, Oxylabs interfaces/client, parsers, URL safety/canonicalization, and Place matcher.
  - service/client/processor/parser tests.
- Prisma schema and a new reviewed SQL migration.
- App/config/error-code/queue wiring and `.env.example`.
- Swagger response documentation and an e2e authorization/queue test.
- `docs/04-database-schema.md`.

## 4. Impact on the Existing System

- Dependent modules: `PostsModule`, `PlacesModule`, `PrismaModule`, global auth/roles guards,
  configuration, Redis/BullMQ, Swagger, and e2e setup.
- Database tables added: `travel_content_ingestion_runs`, `travel_trend_keywords`.
- Existing table modified: nullable external-ingestion metadata columns on `posts`.
- Existing records modified/deleted: none.
- Existing public APIs remain compatible because all new Post fields are nullable and are not
  exposed unless explicitly added to the safe Post response contract.
- Runtime dependency: Redis must be available to enqueue/process the ingestion job.
- Operational dependency: valid Oxylabs credentials and sufficient account usage quota.
- Breaking changes: none; deployment must apply the migration and provide Oxylabs environment
  variables before the admin endpoint is used.

## 5. Open Questions / Needs User Decision

- [x] Proposed canonical mapping: `Place` is destination and `Post` is article; do not create
      duplicate destination/article tables.
- [x] Proposed safety/moderation rule: imported Posts are always drafts and do not republish the
      full third-party body.
- [x] Proposed Place rule: match existing Places only; do not auto-create destinations from
      unverified text.
- [x] Proposed automation scope: implement the manual admin trigger now. Oxylabs Scheduler exists,
      but a recurring end-to-end trigger is deferred because the pipeline is dynamic and must be
      orchestrated by the application.

Reply `APPROVE` to accept these decisions, `REQUEST_CHANGES` with the desired behavior (for
example, automatic Place creation or recurring schedule), or `REJECT`.

## 6. Acceptance Criteria Checklist

- [x] The admin endpoint returns `202` with a persisted queued run and enqueues exactly one
      background job.
- [x] Unauthenticated/non-admin calls return `401`/`403`, active concurrent runs return `409`,
      and strict throttling limits repeated billable triggers.
- [x] The pipeline uses Google Trends, parsed Google News Search, and Universal Markdown in the
      documented order with approved localization and hard usage caps.
- [x] External response schemas are validated; missing credentials, timeouts, `429`, `5xx`,
      malformed results, and partial failures produce stable behavior without leaking secrets.
- [x] Trend keywords and run provenance/counters are persisted.
- [x] Valid unique articles create `SYSTEM` + `DRAFT` Posts with source attribution, canonical
      URL, triggering-admin author, and optional confident existing Place link.
- [x] Full third-party article bodies are neither republished in Posts nor logged.
- [x] Duplicate canonical URLs, including concurrent insertion races, do not create duplicate
      Posts.
- [x] URL validation blocks SSRF/private-network targets and unsafe redirect results before
      article requests are accepted.
- [x] The run reaches `COMPLETED`, `PARTIAL`, or `FAILED` with accurate counters and bounded
      non-secret error details.
- [x] Prisma migration/schema validation and client generation succeed; existing records and
      public API contracts remain compatible.
- [x] Unit tests cover request construction, parsing, canonicalization/SSRF defenses, Place
      matching, deduplication, state transitions, retry policy, Post creation, and partial failure.
- [x] E2e tests cover the admin endpoint response and `401`/`403` authorization.
- [x] Swagger, `.env.example`, configuration validation, and `docs/04-database-schema.md` are
      updated.
- [x] Targeted lint, formatting check, build, unit tests, e2e tests, and `git diff --check` pass.

## 7. Status Log

| Date       | Status      | Notes                                                                                                                                                                                                  |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-29 | DRAFT       | Agent created the keyword-only import draft                                                                                                                                                            |
| 2026-07-29 | DRAFT       | Updated seeds after user clarified travel/destination article topics                                                                                                                                   |
| 2026-07-29 | DRAFT       | Reworked into a full Trends → News → article-page → draft Post ingestion pipeline with an admin-only async API after reviewing Oxylabs Scheduler, integration, News Search, and Markdown documentation |
| 2026-07-29 | APPROVED    | User approved implementation                                                                                                                                                                           |
| 2026-07-29 | IMPLEMENTED | Implemented the admin API, background ingestion pipeline, database provenance, draft Post import, source deduplication, URL safety, tests, and documentation                                           |

### Implementation file log

Created:

- `prisma/migrations/20260729010000_travel_content_ingestion/migration.sql`
- `src/common/exceptions/travel-content-ingestion.exceptions.ts`
- `src/modules/travel-content-ingestions/dto/travel-content-ingestion-response.dto.ts`
- `src/modules/travel-content-ingestions/interfaces/travel-content.interface.ts`
- `src/modules/travel-content-ingestions/processors/travel-content-ingestion.processor.ts`
- `src/modules/travel-content-ingestions/processors/travel-content-ingestion.processor.spec.ts`
- `src/modules/travel-content-ingestions/oxylabs.client.ts`
- `src/modules/travel-content-ingestions/oxylabs.client.spec.ts`
- `src/modules/travel-content-ingestions/place-matcher.ts`
- `src/modules/travel-content-ingestions/place-matcher.spec.ts`
- `src/modules/travel-content-ingestions/travel-content-ingestions.constants.ts`
- `src/modules/travel-content-ingestions/travel-content-ingestions.controller.ts`
- `src/modules/travel-content-ingestions/travel-content-ingestions.module.ts`
- `src/modules/travel-content-ingestions/travel-content-ingestions.service.ts`
- `src/modules/travel-content-ingestions/travel-content-ingestions.service.spec.ts`
- `src/modules/travel-content-ingestions/travel-content.parsers.ts`
- `src/modules/travel-content-ingestions/travel-content.parsers.spec.ts`
- `src/modules/travel-content-ingestions/url-safety.util.ts`
- `src/modules/travel-content-ingestions/url-safety.util.spec.ts`
- `prompts/015-import-google-travel-trends.md`

Modified:

- `.env.example`
- `docs/04-database-schema.md`
- `prisma/schema.prisma`
- `src/app.module.ts`
- `src/common/constants/error-code.enum.ts`
- `src/config/configuration.ts`
- `src/config/validation.schema.ts`
- `src/modules/posts/posts.service.ts`
- `test/auth.e2e-spec.ts`
- `test/setup-env.ts`

Verification:

- Prisma format, schema validation, and client generation pass.
- Strict targeted ESLint passes.
- Nest production build passes.
- Unit tests: 139 passed across 25 suites.
- E2e tests: 41 passed across 4 suites.
- `git diff --check` passes.
- The migration was intentionally not applied and the live admin endpoint was intentionally not
  called, so no database rows were changed and no billable Oxylabs requests were made during
  implementation.
- Pre-existing user-owned changes in `skills-lock.json` and `.agents/` were preserved and are not
  part of this implementation.
