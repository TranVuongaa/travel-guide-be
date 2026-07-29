---
id: 018
title: Temporarily disable request throttling
status: IMPLEMENTED
module: app
created_at: 2026-07-29
updated_at: 2026-07-29
---

## 1. Original Idea
> Paste the user's exact words here, verbatim, without rewording.

tạm thời không chặn cái này lại, chỉ commet các phần liên quan

## 2. Analysis & Scope

**In scope:**
- Temporarily stop `@nestjs/throttler` from rejecting requests with HTTP 429.
- Comment out only the global `ThrottlerGuard` import and provider registration in
  `src/app.module.ts`.
- Preserve the throttler module configuration, environment variables, and route-level
  `@Throttle()` decorators so enforcement can be restored easily.
- Run formatting/lint and build verification after the change.

**Out of scope:**
- Correcting the named-throttler policy design.
- Changing any rate-limit values or environment variables.
- Removing `@nestjs/throttler` or deleting throttling-related code.
- Changing authentication, authorization, API behavior, database schema, DTOs, Swagger, cache,
  or async jobs.

**Assumptions** — filled in by the agent when the idea is unclear; the user can edit this section
directly:
- “Không chặn” means disabling throttling for all API routes temporarily, not only one endpoint.
- “Chỉ comment” means the relevant lines remain in source control as comments rather than being
  deleted.
- JWT and role guards must remain enabled.

## 3. Proposed Technical Details

### 3.1 Entity / Schema changes
- None. No tables, columns, enums, or Prisma migrations are affected; see
  `docs/04-database-schema.md`.

### 3.2 API Endpoints
| Method | Path | Auth/Role | Description |
|---|---|---|---|
| All | All existing paths | Unchanged | Requests are no longer rejected by the throttler guard |

### 3.3 Key DTOs
- None.

### 3.4 Important business rules
- Follow `docs/02-code-standards.md`.
- Comment out the `ThrottlerGuard` symbol in the `@nestjs/throttler` import.
- Comment out only the `APP_GUARD` provider whose `useClass` is `ThrottlerGuard`.
- Keep `ThrottlerModule`, all named policy configuration, and every `@Throttle()` decorator
  unchanged.
- Keep `JwtAuthGuard` and `RolesGuard` registered globally.

### 3.5 Side effects / Async jobs / Cache invalidation
- No cache invalidation or async jobs.
- Rate-limit response headers and HTTP 429 throttler responses will no longer be produced while
  the guard is disabled.

## 4. Impact on the Existing System
- Dependent modules: all HTTP controllers are affected because throttling is currently global.
- Breaking changes: no API contract change, but the temporary removal of request-rate protection
  increases exposure to spam, brute-force attempts, and repeated billable ingestion requests.
- Re-enabling the commented guard without first correcting named-policy selection will restore
  the existing unintended 1-request-per-5-minute behavior on ordinary routes.

## 5. Open Questions / Needs User Decision
- [x] Confirm whether throttling should be disabled globally: assumed yes based on the request.

## 6. Acceptance Criteria Checklist
- [x] The global `ThrottlerGuard` import and provider registration are commented, not deleted.
- [x] `ThrottlerModule`, named policies, environment settings, and route decorators remain intact.
- [x] JWT authentication and role authorization guards remain active.
- [x] HTTP requests are no longer rejected by `@nestjs/throttler`.
- [x] No database, endpoint, DTO, Swagger, cache, or async-job changes are introduced.
- [x] Formatting/lint and build checks pass.

## 7. Status Log
| Date | Status | Notes |
|---|---|---|
| 2026-07-29 | DRAFT | Agent created the first draft; awaiting user approval |
| 2026-07-29 | APPROVED | User approved implementation |
| 2026-07-29 | IMPLEMENTED | Commented the global `ThrottlerGuard` import/provider in `src/app.module.ts`; `npm run lint` and `npm run build` passed. Modified files: `src/app.module.ts`, `prompts/018-temporarily-disable-request-throttling.md` |
