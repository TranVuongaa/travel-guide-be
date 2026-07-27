---
id: 001
title: Destination (Place) CRUD with search and pagination
status: IMPLEMENTED
module: places
created_at: 2026-07-27
updated_at: 2026-07-27
---

## 1. Original Idea

> implement a full Destination function, include search, pagination

## 2. Analysis & Scope

The project documentation names a travel destination `Place`. This task will implement the first
complete `PlacesModule` and expose destinations through the documented `/api/v1/places` routes.
Because the repository currently contains only the default NestJS starter, the task also includes
the minimum shared infrastructure required to make the module functional, validated, documented,
and testable.

**In scope:**

- Configure Prisma for PostgreSQL and implement the documented `Province`, `Category`, `Place`,
  and `PlaceCategory` models plus the `ContentStatus` enum from
  `docs/04-database-schema.md`.
- Add the shared Prisma module/service used by `PlacesModule`.
- Add global URI versioning, request validation, Swagger, normalized success responses, and
  normalized domain-error responses required by the architecture documents.
- Add shared pagination types/utilities.
- Implement public destination listing with filtering, case-insensitive search, sorting, and
  page-based pagination.
- Implement public destination detail lookup.
- Implement create, update, and soft-remove operations for destinations.
- Validate referenced province and category records, category ID uniqueness, coordinates, text
  lengths, pagination limits, sorting fields, and UUID route/query values.
- Generate stable unique slugs from destination names.
- Return province and category details with destination responses.
- Add Swagger documentation, unit tests for every public service method, and e2e coverage for the
  main public destination flow.
- Update application/module wiring and required dependencies/configuration examples.

**Out of scope:**

- Province and category CRUD endpoints or seed/import jobs. Destination writes require those
  records to already exist.
- Authentication, JWT issuance, and user management. These are separate documented modules that
  are not present yet.
- Redis caching, Elasticsearch, fuzzy search, autocomplete, geospatial/radius search, and
  recommendation ranking.
- Destination media/gallery support, posts, reviews, rating recalculation jobs, bookmarks, and
  localization.
- Hard deletion of destination rows.
- Production deployment or creation of a real production database.

**Assumptions** — approval of this draft confirms these choices:

- “Destination” is the product term for the documented `Place` domain; code, database models, and
  routes use `Place`/`places` for consistency with docs `00`–`05`.
- A list query searches `name`, `description`, and `address` case-insensitively using PostgreSQL
  `contains`; blank search text is ignored after trimming.
- Public list/detail endpoints return only `PUBLISHED` destinations.
- Pagination defaults to `page=1` and `limit=20`, with a maximum limit of `100`.
- Supported sorting fields are `name`, `avgRating`, `createdAt`, and `updatedAt`; defaults are
  `createdAt` descending, with `id` as a deterministic secondary sort.
- List filters support `provinceId` and `categoryId`.
- Detail lookup uses a UUID route parameter. Slug lookup is not a separate endpoint in this task.
- Create and update return a destination with its province and categories.
- Removing a destination is a soft removal implemented by changing its status to `HIDDEN`, so
  related content is preserved and the row disappears from public reads.
- `createdById` remains a string as documented. Until Auth is implemented, write methods accept
  the authenticated user ID at the service boundary, while HTTP write endpoints are documented
  and prepared for the future `CurrentUser`/role guards. They must not use insecure spoofable
  headers as an authentication substitute.
- Tests use a mocked Prisma service for unit tests and an isolated test database/configuration for
  e2e tests.

## 3. Proposed Technical Details

The file/module structure will follow `docs/02-code-standards.md` and the canonical Places example
in `docs/05-nestjs-modules.md`: controller orchestration only, business logic in the service,
validated DTOs, centralized domain exceptions, and service tests.

### 3.1 Entity / Schema changes

- Add Prisma configuration and an initial migration for the following definitions from
  `docs/04-database-schema.md`:
  - `ContentStatus`: `DRAFT`, `PENDING`, `PUBLISHED`, `REJECTED`, `HIDDEN`.
  - `Province`: UUID `id`, unique `name`, unique `slug`.
  - `Category`: UUID `id`, unique `name`, unique `slug`.
  - `Place`: UUID `id`, unique `slug`, destination content/location fields, `provinceId`,
    denormalized rating fields, `status`, `createdById`, and timestamps.
  - `PlaceCategory`: composite primary key of `placeId` and `categoryId`, with cascading cleanup
    of join rows.
- Keep the documented index on `places.province_id` and add query-supporting indexes for public
  pagination/filtering where justified by the generated migration (notably status/sort and
  category joins).
- No new destination-specific columns beyond the documented v1 schema.
- Soft removal uses the existing `ContentStatus.HIDDEN` value and therefore needs no deletion
  column.
- `createdById` will not receive a foreign key until the separate User/Auth schema is implemented;
  this avoids introducing a partial identity module in this task.

### 3.2 API Endpoints

All paths are URI-versioned under the global `/api/v1` prefix.

| Method | Path | Auth/Role | Description |
|---|---|---|---|
| `GET` | `/places` | Public | List published destinations with search, filters, sorting, and pagination |
| `GET` | `/places/:id` | Public | Get one published destination by UUID |
| `POST` | `/places` | Editor/Admin when Auth exists | Create a destination and its category links |
| `PATCH` | `/places/:id` | Editor/Admin when Auth exists | Partially update a destination and optionally replace category links |
| `DELETE` | `/places/:id` | Admin when Auth exists | Soft-remove a destination by setting status to `HIDDEN` |

`GET /places` query contract:

- `page`: integer, minimum `1`, default `1`.
- `limit`: integer from `1` to `100`, default `20`.
- `search`: optional trimmed text matched across name, description, and address.
- `provinceId`: optional UUID.
- `categoryId`: optional UUID.
- `sortBy`: optional enum of `name`, `avgRating`, `createdAt`, `updatedAt`.
- `sortOrder`: optional `asc` or `desc`.

The list response contains `items` and pagination metadata: `page`, `limit`, `totalItems`, and
`totalPages`, inside the application's standard success envelope.

### 3.3 Key DTOs

- `PaginationDto`: transforms numeric query strings, applies defaults/ranges, and validates sort
  order.
- `QueryPlaceDto`: extends `PaginationDto` with search, filter, and allowed sort-field inputs.
- `CreatePlaceDto`: validates name, description, optional address/coordinates, province UUID, and
  a non-empty unique array of category UUIDs.
- `UpdatePlaceDto`: a partial create payload; category IDs, when supplied, replace the complete
  category association set.
- Response/pagination interfaces or DTOs that expose the documented destination fields,
  province, and flattened category records without leaking join-table internals.

Every request DTO field will have matching `class-validator` and Swagger decorators as required
by `docs/02-code-standards.md`.

### 3.4 Important business rules

- Listing and count queries use the exact same Prisma `where` object and execute in one Prisma
  transaction to return consistent pagination metadata.
- Public `findOne` must treat missing and non-`PUBLISHED` records identically as
  `PLACE_NOT_FOUND`.
- Create/update verifies the referenced province and all category IDs exist before writing.
- Duplicate category IDs are rejected with a domain-specific validation error.
- Writes that update a place and its category joins run atomically in a Prisma transaction.
- Slugs are normalized from names and made unique deterministically by appending a suffix when a
  collision exists; an unchanged name preserves the current slug.
- Coordinate validation permits either both latitude and longitude or neither, preventing partial
  coordinates.
- Update and remove first verify that the destination exists.
- Soft-remove is idempotent only for an existing visible record; a missing/already-hidden record
  returns `PLACE_NOT_FOUND`.
- Domain errors use centralized error codes including `PLACE_NOT_FOUND`,
  `PROVINCE_NOT_FOUND`, `CATEGORY_NOT_FOUND`, and `PLACE_SLUG_CONFLICT` where applicable.
- Controllers contain no Prisma access or business logic.
- Write routes will not be falsely presented as secure before Auth exists. The controller/service
  design will be ready to add the documented `@Roles` and `@CurrentUser` integration when the Auth
  prompt is implemented; e2e coverage in this task focuses on public routes, while write behavior
  is covered at service level.

### 3.5 Side effects / Async jobs / Cache invalidation

- No async jobs are introduced.
- No Redis cache exists yet, so there is no cache to invalidate.
- Create/update/remove behavior will be kept behind service methods so cache invalidation can be
  added later without changing controllers.

## 4. Impact on the Existing System

- **Dependent modules/files:** root `AppModule`, bootstrap in `main.ts`, new database/common
  infrastructure, Prisma schema/migration, environment example, package dependencies, and test
  setup.
- **Database tables affected:** new `provinces`, `categories`, `places`, and `place_categories`
  tables.
- **Dependencies to add:** Prisma client/tooling, `class-validator`, `class-transformer`,
  Swagger support, and a maintained slug-generation utility (or a small internal slug utility if
  dependency review favors that).
- **Breaking changes:** none to an existing feature API; the default starter root endpoint may
  remain available unless cleanup is needed for application wiring.
- **Future dependency:** Auth/Users must later connect `Place.createdById` to a user and activate
  editor/admin HTTP write authorization. Province/Category management or seeding is needed before
  destination creation can be used end to end through HTTP.

## 5. Open Questions / Needs User Decision

- [x] No blocking questions. Approving this draft confirms the assumptions in section 2,
  especially the canonical `/places` naming and the decision not to implement insecure
  unauthenticated HTTP writes before the Auth module exists.

## 6. Acceptance Criteria Checklist

- [x] Prisma schema validates, Prisma client generation succeeds, and the migration defines the
  approved destination tables/constraints/indexes.
- [x] `GET /api/v1/places` returns only published destinations and supports the approved search,
  province/category filters, sorting, and deterministic pagination.
- [x] Pagination metadata is correct for empty, partial, and multi-page result sets.
- [x] `GET /api/v1/places/:id` returns province/categories and a domain-specific 404 for missing,
  hidden, or unpublished destinations.
- [x] Service create validates relationships, creates a unique slug, and atomically creates
  category links.
- [x] Service update supports partial fields and atomically replaces category links when supplied.
- [x] Service remove hides the destination without deleting its database row.
- [x] Invalid UUIDs, query values, coordinates, text lengths, sorting fields, and duplicate
  category IDs are rejected.
- [x] Input is fully validated per `docs/02-code-standards.md`.
- [x] Unit tests cover every public `PlacesService` method, including success and important error
  paths.
- [x] E2e tests cover the main public list/search/filter/pagination/detail flow.
- [x] Swagger fully documents all implemented endpoints and DTOs.
- [x] Success and error responses follow the standard envelopes in `docs/01-architecture.md`.
- [x] `npm run build`, `npm run lint`, unit tests, and e2e tests pass.
- [x] No breaking changes are introduced to existing APIs/features.

## 7. Status Log

| Date | Status | Notes |
|---|---|---|
| 2026-07-27 | DRAFT | Agent created the first draft after reviewing docs `00`–`05` and the starter repository |
| 2026-07-27 | APPROVED | User explicitly approved implementation |
| 2026-07-27 | IMPLEMENTED | Places API, Prisma schema/migration, shared request infrastructure, Swagger, and tests completed |

### Implementation file log

Created:

- `.env.example`
- `prisma/schema.prisma`
- `prisma/migrations/20260727000000_init_places/migration.sql`
- `src/configure-app.ts`
- `src/database/prisma.module.ts`
- `src/database/prisma.service.ts`
- `src/common/constants/error-code.enum.ts`
- `src/common/decorators/current-user.decorator.ts`
- `src/common/decorators/public.decorator.ts`
- `src/common/decorators/roles.decorator.ts`
- `src/common/dto/pagination.dto.ts`
- `src/common/dto/response-meta.dto.ts`
- `src/common/exceptions/category-not-found.exception.ts`
- `src/common/exceptions/domain.exception.ts`
- `src/common/exceptions/place-category-duplicate.exception.ts`
- `src/common/exceptions/place-not-found.exception.ts`
- `src/common/exceptions/place-slug-conflict.exception.ts`
- `src/common/exceptions/province-not-found.exception.ts`
- `src/common/filters/all-exceptions.filter.ts`
- `src/common/guards/authentication.guard.ts`
- `src/common/guards/roles.guard.ts`
- `src/common/interceptors/transform-response.interceptor.ts`
- `src/common/interfaces/auth-user.interface.ts`
- `src/common/interfaces/paginated-result.interface.ts`
- `src/common/middlewares/request-id.middleware.ts`
- `src/common/types/express.d.ts`
- `src/modules/places/dto/create-place.dto.ts`
- `src/modules/places/dto/place-response.dto.ts`
- `src/modules/places/dto/query-place.dto.ts`
- `src/modules/places/dto/update-place.dto.ts`
- `src/modules/places/interfaces/place-with-relations.interface.ts`
- `src/modules/places/utils/place-slug.util.ts`
- `src/modules/places/places.controller.ts`
- `src/modules/places/places.module.ts`
- `src/modules/places/places.service.ts`
- `src/modules/places/places.service.spec.ts`
- `test/jest-e2e.json`
- `test/places.e2e-spec.ts`

Modified:

- `package.json`
- `package-lock.json`
- `src/app.controller.ts`
- `src/app.module.ts`
- `src/main.ts`
- `src/app.service.ts` (format-only; no content change)
- `prompts/001-destination-place-crud-search-pagination.md`

Verification:

- Prisma schema validation and client generation pass.
- Generated empty-to-schema migration SQL matches the checked-in migration.
- Production dependency audit reports zero vulnerabilities.
- ESLint and Nest build pass.
- Unit tests: 11 passed.
- E2e tests: 4 passed.
