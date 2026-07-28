---
id: 002
title: Fix Prisma QueryMode build error
status: IMPLEMENTED
module: places
created_at: 2026-07-28
updated_at: 2026-07-28
---

## 1. Original Idea

> RUN npm run build:
> 9.352
> 9.352 199                   mode: Prisma.QueryMode.insensitive,
> 9.352                                    ~~~~~~~~~
> 9.352 src/modules/places/places.service.ts:205:32 - error TS2339: Property 'QueryMode' does not exist on type 'typeof Prisma'.
> 9.352
> 9.352 205                   mode: Prisma.QueryMode.insensitive,

## 2. Analysis & Scope

The Places search query currently accesses `QueryMode` as a runtime property of the imported
`Prisma` namespace. That property is not available in the generated Prisma client used by the
reported build environment, so TypeScript fails while compiling all three case-insensitive search
filters. Prisma's `PlaceWhereInput` context accepts the string literal `'insensitive'`, which is
also the form documented in `docs/05-nestjs-modules.md` and already asserted by the service test.

**In scope:**

- Replace the three failing `Prisma.QueryMode.insensitive` expressions in the Places search filter
  with the Prisma-supported `'insensitive'` literal.
- Verify the production NestJS build.
- Run the Places service unit test to guard the search-query behavior.

**Out of scope:**

- Changing search behavior, searched fields, pagination, filtering, or sorting.
- Upgrading or downgrading Prisma or other dependencies.
- Regenerating or modifying the database schema or migrations.
- Fixing unrelated TypeScript or test-suite issues.

**Assumptions** — approval of this draft confirms these choices:

- The expected behavior remains PostgreSQL case-insensitive matching across `name`,
  `description`, and `address`.
- A source-level compatibility fix is preferred over depending on a generated runtime enum export.

## 3. Proposed Technical Details

The change follows `docs/02-code-standards.md` and retains the service-layer query structure from
`docs/05-nestjs-modules.md`.

### 3.1 Entity / Schema changes

- None. No tables, columns, enums, migrations, or generated Prisma schema definitions change.

### 3.2 API Endpoints

No endpoint contract changes.

| Method | Path | Auth/Role | Description |
|---|---|---|---|
| `GET` | `/api/v1/places` | Public | Retains existing case-insensitive destination search behavior |

### 3.3 Key DTOs

- No DTO changes.

### 3.4 Important business rules

- When `search` is present, all three string filters continue to use Prisma query mode
  `'insensitive'`.
- The filter remains typed through `Prisma.PlaceWhereInput`; no unsafe cast or `any` is added.

### 3.5 Side effects / Async jobs / Cache invalidation

- None.

## 4. Impact on the Existing System

- **Dependent modules:** only the Places service implementation is affected.
- **Database tables affected:** none.
- **Breaking changes:** none.
- The code no longer relies on `QueryMode` being exposed as a runtime member of the generated
  `Prisma` namespace.

## 5. Open Questions / Needs User Decision

- [x] No blocking questions. Approving this draft authorizes the narrow compatibility fix above.

## 6. Acceptance Criteria Checklist

- [x] `src/modules/places/places.service.ts` no longer references
  `Prisma.QueryMode.insensitive`.
- [x] Search filters for `name`, `description`, and `address` still use
  `mode: 'insensitive'`.
- [x] `npm run build` passes.
- [x] The Places service unit test passes.
- [x] No schema, migration, dependency, DTO, or API contract changes are introduced.

## 7. Status Log

| Date | Status | Notes |
|---|---|---|
| 2026-07-28 | DRAFT | Agent created the build-fix plan after reviewing docs `00`–`05`, the Prisma schema, generated client types, and Places search tests |
| 2026-07-28 | APPROVED | User approved the implementation |
| 2026-07-28 | IMPLEMENTED | Replaced runtime `Prisma.QueryMode` access with typed string literals; build and 11 Places service tests pass |

### Implementation file log

Created:

- `prompts/002-fix-prisma-query-mode-build.md`

Modified:

- `src/modules/places/places.service.ts`
- `prompts/002-fix-prisma-query-mode-build.md`

Verification:

- `npm run build`: passed.
- `npm test -- places.service.spec.ts --runInBand`: 11 tests passed.
