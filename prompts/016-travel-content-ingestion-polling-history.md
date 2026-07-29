---
id: 016
title: Add travel content ingestion polling and history APIs
status: IMPLEMENTED
module: travel-content-ingestions
created_at: 2026-07-29
updated_at: 2026-07-29
---

## 1. Original Idea

> có hỗ trợ thêm api trả về polling/lịch sử được không

## 2. Analysis & Scope

Prompt 015 added an admin-only asynchronous ingestion trigger that returns a `runId`. This
follow-up adds read APIs so an admin client can poll that run until it reaches a terminal status
and browse previous ingestion runs.

**In scope:**

- Add an admin-only endpoint for polling one ingestion run by UUID.
- Add an admin-only paginated ingestion-run history endpoint.
- Support optional history filtering by run status.
- Return run counters, timestamps, request parameters, and bounded error summary.
- Include a terminal-state indicator and a recommended polling delay so clients do not need to
  duplicate status interpretation.
- Add Swagger documentation, service unit tests, and e2e authorization/response tests.

**Out of scope:**

- WebSocket/SSE push notifications.
- Cancelling, retrying, deleting, or restarting a run.
- Returning scraped article bodies or Oxylabs credentials/job payloads.
- Public/non-admin access.
- Changes to the ingestion worker, Oxylabs usage limits, scheduling, or Post creation rules.
- Database schema or migration changes.

**Assumptions:**

- Polling is ordinary HTTP polling using `GET`; the backend does not hold a long-lived request.
- `COMPLETED`, `PARTIAL`, and `FAILED` are terminal statuses.
- Active runs (`QUEUED`, `RUNNING`) return `pollAfterMs: 3000`; terminal runs return
  `pollAfterMs: null`.
- History defaults to newest-first ordering and uses the shared pagination defaults.
- Any admin can inspect every run; history is not restricted to runs they triggered.

## 3. Proposed Technical Details

### 3.1 Entity / Schema changes

- None. Reuse `travel_content_ingestion_runs` created by prompt 015.
- The existing `(status, createdAt)` and `(requestedById, createdAt)` indexes support the proposed
  filters and ordering.

### 3.2 API Endpoints

| Method | Path                                          | Auth/Role        | Description                |
| ------ | --------------------------------------------- | ---------------- | -------------------------- |
| `GET`  | `/api/v1/admin/travel-content-ingestions/:id` | Bearer + `ADMIN` | Poll one ingestion run     |
| `GET`  | `/api/v1/admin/travel-content-ingestions`     | Bearer + `ADMIN` | List ingestion-run history |

Polling response fields:

- `id`, `status`, `isTerminal`, `pollAfterMs`.
- All six run counters.
- `requestParameters`.
- `errorSummary`.
- `createdAt`, `startedAt`, and `completedAt`.

History query:

- Shared `page`, `limit`, and `sortOrder`.
- Optional `status` enum filter.
- Maximum `limit` remains the shared pagination maximum.

History items use the same safe run response shape as polling. Results use the existing
`items/page/limit/totalItems/totalPages` contract.

### 3.3 Key DTOs

- `QueryTravelContentIngestionDto` extends `PaginationDto` and adds optional validated
  `TravelContentIngestionStatus`.
- Extend `TravelContentIngestionRunResponseDto` with:
  - `requestParameters`.
  - `isTerminal`.
  - nullable `pollAfterMs`.
- Add paginated data and standard success-wrapper Swagger DTOs.

### 3.4 Important business rules

- Apply `@Roles(Role.ADMIN)` and bearer authentication to both endpoints.
- Parse `:id` using UUID v4 validation.
- Missing run returns HTTP `404` with a stable `TRAVEL_INGESTION_NOT_FOUND` domain error.
- The service selects only the documented fields and never returns the requesting User relation,
  credentials, authorization headers, Post bodies, or raw Oxylabs responses.
- History executes list and count in one Prisma transaction for a consistent page.
- Ordering is deterministic: `createdAt` followed by `id`, both using the requested sort order.
- Controllers remain orchestration-only per `docs/02-code-standards.md`.

### 3.5 Side effects / Async jobs / Cache invalidation

- None. Both endpoints are read-only.
- Polling does not enqueue jobs, call Oxylabs, or modify run state.
- Existing global throttling applies; no billable Oxylabs usage is caused by these APIs.

## 4. Impact on the Existing System

- Dependent modules: `TravelContentIngestionsModule`, shared pagination DTO, error codes, Swagger,
  and e2e tests.
- Database impact: read-only queries against `travel_content_ingestion_runs`.
- Breaking changes: none. The existing `POST` trigger remains unchanged.
- Public APIs and Post/Place response contracts remain unchanged.

## 5. Open Questions / Needs User Decision

- [x] Proposed polling interval: 3 seconds while active.
- [x] Proposed visibility: every admin can inspect every ingestion run.
- [x] Proposed endpoint set: one detail/polling endpoint and one paginated history endpoint.

Reply `APPROVE` to accept these defaults, `REQUEST_CHANGES` with adjustments, or `REJECT`.

## 6. Acceptance Criteria Checklist

- [x] Admin can poll a run by UUID and receive current status, counters, timestamps,
      `isTerminal`, and `pollAfterMs`.
- [x] Active runs recommend polling after 3000 ms; terminal runs return a null polling delay.
- [x] Missing or malformed run IDs return documented `404`/`400` responses.
- [x] Admin can list run history with pagination, deterministic ordering, and optional status
      filtering.
- [x] Unauthenticated and non-admin requests return `401` and `403`.
- [x] Read endpoints never enqueue work, invoke Oxylabs, or mutate database rows.
- [x] Responses do not expose secrets, raw article bodies, raw Oxylabs content, or User relations.
- [x] Swagger documents both endpoints, query fields, response wrappers, and important errors.
- [x] Service unit tests cover polling, terminal interpretation, not-found behavior, pagination,
      filtering, count, and ordering.
- [x] E2e tests cover successful polling/history and the `400`/`401`/`403`/`404` boundaries.
- [x] Prisma validation, lint, build, unit tests, e2e tests, and `git diff --check` pass.

## 7. Status Log

| Date       | Status      | Notes                                                                                                                                                  |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-29 | DRAFT       | Agent created the polling/history follow-up plan after prompt 015 was implemented                                                                      |
| 2026-07-29 | APPROVED    | User approved adding GET history and GET polling methods to the existing resource                                                                      |
| 2026-07-29 | IMPLEMENTED | Added admin history and polling methods on the existing ingestion resource, with safe DTOs, pagination/filtering, polling metadata, Swagger, and tests |

### Implementation file log

Created:

- `src/modules/travel-content-ingestions/dto/query-travel-content-ingestion.dto.ts`
- `prompts/016-travel-content-ingestion-polling-history.md`

Modified:

- `src/common/constants/error-code.enum.ts`
- `src/common/exceptions/travel-content-ingestion.exceptions.ts`
- `src/modules/travel-content-ingestions/dto/travel-content-ingestion-response.dto.ts`
- `src/modules/travel-content-ingestions/travel-content-ingestions.controller.ts`
- `src/modules/travel-content-ingestions/travel-content-ingestions.service.ts`
- `src/modules/travel-content-ingestions/travel-content-ingestions.service.spec.ts`
- `test/auth.e2e-spec.ts`

Verification:

- Prisma schema validation passes; no schema migration was required.
- Strict targeted ESLint and Nest production build pass.
- Unit tests: 143 passed across 25 suites.
- E2e tests: 44 passed across 4 suites.
- `git diff --check` passes.
- The new read APIs were verified with mocks only and did not call Oxylabs or mutate database
  rows.
