---
id: 009
title: Case-insensitive and Vietnamese accent-insensitive search
status: IMPLEMENTED
module: database, provinces, categories, places, posts, users
created_at: 2026-07-28
updated_at: 2026-07-28
---

## 1. Original Idea

> các chức năng search cho phép chữ thường, chữ hoa, tiếng việt có dấu, không dấu vẫn tìm thấy

## 2. Analysis & Scope

The current Prisma `contains` filters use case-insensitive matching, so they handle uppercase and
lowercase but do not reliably treat accented and unaccented Vietnamese text as equivalent. This
task will make every existing `search` query parameter use the same Unicode-aware,
accent-insensitive behavior.

**In scope:**

- Upgrade all five existing search flows:
  - Provinces: `name`, `slug`.
  - Categories: `name`, `slug`.
  - Places: `name`, `description`, `address`.
  - Published posts: `title`, `content`.
  - Admin user list: `email`, `displayName`.
- Normalize both stored searchable text and the incoming search term so uppercase/lowercase and
  Vietnamese accents do not affect matching.
- Handle Vietnamese `đ`/`Đ` as equivalent to `d`/`D`, in addition to removing combining tone and
  vowel marks.
- Preserve substring matching, existing filters, sorting, pagination, response shapes, and
  authorization.
- Add database indexes suitable for normalized substring search.
- Add automated tests covering lowercase, uppercase, accented, and unaccented queries.
- Update `docs/04-database-schema.md` with the internal normalized-search fields and database
  requirements.

**Out of scope:**

- Typo tolerance, fuzzy matching, relevance ranking, autocomplete, or Elasticsearch.
- Adding new `search` parameters to reviews, comments, reactions, or other endpoints that do not
  currently support search.
- Translating content or matching semantically related words.
- Changing uniqueness rules for names, slugs, emails, or other business fields.

**Assumptions** — filled in by the agent when the idea is unclear; the user can edit this section
directly:

- “Các chức năng search” means every API query parameter named `search` that exists in the current
  codebase.
- Matching remains partial/substring-based. For example, `da nang`, `ĐÀ NẴNG`, and `Đà Nẵng`
  must all match stored text containing `Đà Nẵng`.
- Only the search comparison changes; returned text keeps its original casing and Vietnamese
  accents.
- Leading/trailing whitespace continues to be trimmed, and repeated internal whitespace in the
  normalized search term may be collapsed for consistent matching.
- Database migrations may enable the standard PostgreSQL `unaccent` and `pg_trgm` extensions.

## 3. Proposed Technical Details

### 3.1 Entity / Schema changes

Reference: `docs/04-database-schema.md`.

- Add an internal generated `search_text` column to each table that currently supports search:
  - `provinces`: normalized combination of `name` and `slug`.
  - `categories`: normalized combination of `name` and `slug`.
  - `places`: normalized combination of `name`, `description`, and nullable `address`.
  - `posts`: normalized combination of `title` and `content`.
  - `users`: normalized combination of `email` and `display_name`.
- Add a migration that:
  - Enables PostgreSQL `unaccent` and `pg_trgm`.
  - Defines a schema-qualified immutable normalization helper suitable for stored generated
    columns.
  - Generates lowercase, accent-free searchable text from the source columns, including the
    Vietnamese `đ`/`Đ` mapping.
  - Backfills existing rows automatically through stored generated-column expressions; no manual
    seed rewrite is required.
  - Adds a GIN trigram index to every `search_text` column so `%term%` matching does not require a
    full table scan as data grows.
- Map the generated columns in Prisma so services can filter on them without writing them.
- Explicitly omit `search_text` from all Prisma result payloads so this implementation field does
  not alter API responses.
- Keep the original source columns and all current unique/index constraints unchanged.

### 3.2 API Endpoints

No routes are added or removed.

| Method | Path                            | Auth/Role | Description                                                                                   |
| ------ | ------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/provinces?search=...`  | Public    | Search province name/slug without case or Vietnamese-accent sensitivity                       |
| GET    | `/api/v1/categories?search=...` | Public    | Search category name/slug without case or Vietnamese-accent sensitivity                       |
| GET    | `/api/v1/places?search=...`     | Public    | Search published place name/description/address without case or Vietnamese-accent sensitivity |
| GET    | `/api/v1/posts?search=...`      | Public    | Search published post title/content without case or Vietnamese-accent sensitivity             |
| GET    | `/api/v1/users?search=...`      | ADMIN     | Search user email/display name without case or Vietnamese-accent sensitivity                  |

### 3.3 Key DTOs

- Keep `QueryProvinceDto`, `QueryCategoryDto`, `QueryPlaceDto`, `QueryPostDto`, and
  `QueryUserDto` public contracts unchanged.
- Keep their current string validation and maximum lengths.
- Update Swagger descriptions/examples to state that `search` is case-insensitive and
  Vietnamese-accent-insensitive.
- Add a shared search-normalization utility under `src/common/utils/`, following
  `docs/02-code-standards.md`, for normalizing incoming query terms consistently.

### 3.4 Important business rules

- Normalize search terms with Unicode normalization, lowercase conversion, combining-mark
  removal, explicit `đ`/`Đ` conversion, trimming, and consistent whitespace handling.
- Search only when the normalized term is non-empty.
- Compare the normalized term against the generated normalized `search_text` column using
  substring matching.
- Preserve each service's current non-search predicates:
  - Places and posts remain limited to published/non-deleted public content.
  - Province/category/place/post filters remain combinable with search.
  - User role and active-status filters remain combinable with search.
- Preserve deterministic ordering and calculate `totalItems`/`totalPages` from the same normalized
  filter used to load page items.
- Do not expose `search_text` in list, detail, create, or update responses.
- Keep controllers orchestration-only and place all query behavior in services per
  `docs/02-code-standards.md`.

### 3.5 Side effects / Async jobs / Cache invalidation

- No async jobs are required.
- Stored generated columns update automatically whenever their source fields change, including
  Prisma writes, OAuth/registration writes, and SQL/Prisma seeds.
- No cache invalidation change is required because the affected list endpoints currently have no
  implemented response cache.
- Migration execution requires a PostgreSQL role allowed to create the `unaccent` and `pg_trgm`
  extensions. If the deployment provider preinstalls them, `CREATE EXTENSION IF NOT EXISTS`
  remains safe.

## 4. Impact on the Existing System

- Database tables affected: `provinces`, `categories`, `places`, `posts`, `users`.
- Dependent modules: database/Prisma, provinces, categories, places, posts, users, and auth write
  flows indirectly covered by database-generated values.
- Files are expected to follow the existing structure from `docs/02-code-standards.md`; likely
  changes include a Prisma migration/schema update, a shared normalization utility, the five
  services and query DTO Swagger metadata, their unit tests, relevant e2e tests, and
  `docs/04-database-schema.md`.
- Existing rows receive normalized values through the migration; new and updated rows stay
  synchronized automatically.
- Breaking changes: none to routes, request parameters, authorization, response DTOs, sorting, or
  pagination.
- Operational impact: the migration temporarily computes and indexes normalized text for existing
  rows; deployment should allow time proportional to the current table sizes.

## 5. Open Questions / Needs User Decision

- [x] No blocking question. The draft assumes all five current `search` parameters are included and
      that substring matching should remain unchanged.

## 6. Acceptance Criteria Checklist

- [x] All endpoints in section 3.2 work as specified.
- [x] Searching with lowercase, uppercase, accented, or unaccented Vietnamese returns the same
      matching records.
- [x] `d` matches stored `đ`, and `đ` matches stored `d`, without changing returned source text.
- [x] Search remains partial and works together with every existing filter, sort option, and
      pagination parameter.
- [x] Places/posts still enforce their existing publication/deletion visibility rules, and user
      search remains admin-only.
- [x] Empty or whitespace-only normalized search input does not create an unintended broad
      database condition.
- [x] Generated normalized fields stay correct after create, update, registration/OAuth, and seed
      operations without duplicated synchronization logic in those write paths.
- [x] `search_text` is never present in API responses.
- [x] PostgreSQL normalized-search indexes are created and documented.
- [x] Input remains fully validated per `docs/02-code-standards.md`.
- [x] Unit tests cover the normalization utility and all five service filters.
- [x] E2e coverage verifies request transformation/API behavior for representative accented and
      unaccented queries.
- [x] Prisma validation/client generation, lint, build, unit tests, e2e tests, and
      `git diff --check` pass.
- [x] Swagger and `docs/04-database-schema.md` are updated.
- [x] No breaking changes to existing APIs/features.

## 7. Status Log

| Date       | Status      | Notes                                                                  |
| ---------- | ----------- | ---------------------------------------------------------------------- |
| 2026-07-28 | DRAFT       | Agent created the first draft after auditing all existing search flows |
| 2026-07-28 | APPROVED    | User approved the implementation plan                                  |
| 2026-07-28 | IMPLEMENTED | Implemented and verified all approved search behavior                  |

### Implementation file log

Created:

- `prisma/migrations/20260728030000_vietnamese_accent_insensitive_search/migration.sql`
- `src/common/utils/search-text.util.ts`
- `src/common/utils/search-text.util.spec.ts`
- `prompts/009-vietnamese-accent-insensitive-search.md`

Modified:

- `docs/04-database-schema.md`
- `prisma/schema.prisma`
- `src/database/prisma.service.ts`
- `src/modules/provinces/provinces.service.ts`
- `src/modules/provinces/provinces.service.spec.ts`
- `src/modules/provinces/dto/query-province.dto.ts`
- `src/modules/categories/categories.service.ts`
- `src/modules/categories/categories.service.spec.ts`
- `src/modules/categories/dto/query-category.dto.ts`
- `src/modules/places/places.service.ts`
- `src/modules/places/places.service.spec.ts`
- `src/modules/places/dto/query-place.dto.ts`
- `src/modules/places/interfaces/place-with-relations.interface.ts`
- `src/modules/posts/posts.service.ts`
- `src/modules/posts/posts.service.spec.ts`
- `src/modules/posts/dto/query-post.dto.ts`
- `src/modules/posts/interfaces/post-with-relations.interface.ts`
- `src/modules/users/users.service.ts`
- `src/modules/users/users.service.spec.ts`
- `src/modules/users/dto/query-user.dto.ts`
- `test/reference-data.e2e-spec.ts`
- `test/places.e2e-spec.ts`
- `test/content.e2e-spec.ts`
- `test/auth.e2e-spec.ts`

Verification:

- Prisma schema validation and client generation pass.
- The full migration chain, including the new generated columns, normalization function, and five
  GIN trigram indexes, applies successfully to a clean PostgreSQL database.
- Runtime database checks pass for Users, Provinces, Categories, Places, and Posts using real
  accented Vietnamese source data and unaccented queries.
- Runtime create/update checks confirm generated fields stay synchronized, and global Prisma
  omission prevents `search_text` from being returned.
- ESLint and Nest build pass.
- Unit tests: 18 suites and 114 tests passed.
- E2e tests: 4 suites and 35 tests passed.
- `git diff --check` passes (line-ending conversion warnings only).
