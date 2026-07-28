---
id: 004
title: Province and Category CRUD with reference-data seed
status: IMPLEMENTED
module: provinces, categories
created_at: 2026-07-28
updated_at: 2026-07-28
---

## 1. Original Idea

> implement CRUD/seed dữ liệu Province, Category.

## 2. Analysis & Scope

The `Province` and `Category` models already exist because `Place` depends on them, but they have
no dedicated modules, HTTP endpoints, or repeatable seed workflow. This task adds the missing
reference-data management APIs and provides initial data required to create Places.

**In scope:**

- Implement complete `ProvincesModule` and `CategoriesModule` structures following
  `docs/02-code-standards.md` and the module blueprint in `docs/05-nestjs-modules.md`.
- Add public paginated list/detail APIs for provinces and categories.
- Support case-insensitive name/slug search plus deterministic name sorting on list APIs.
- Add admin-only create, partial update, and delete APIs.
- Generate normalized ASCII slugs server-side from names; clients cannot set slugs directly.
- Handle missing records, duplicate names/slugs, and delete constraints through stable domain
  errors.
- Add an idempotent Prisma seed command for Vietnam's current 34 province-level administrative
  units and an initial travel-category taxonomy.
- Wire both modules into `AppModule`, fully document their endpoints in Swagger, and add service
  unit tests plus e2e coverage for their primary API and authorization flows.
- Extract the existing Place slug normalization into a shared utility so all three modules use
  the same Vietnamese-safe slug behavior without changing the Places API contract.

**Out of scope:**

- District/ward/commune data, administrative boundaries, coordinates, maps, regions, old-to-new
  province mappings, and migration of legacy 63-province datasets.
- Adding official administrative codes or a province/city type column. The existing documented
  `Province` schema stores only `id`, `name`, and `slug`.
- Category hierarchy, icons, descriptions, translations, ordering/featured flags, or category
  soft deletion.
- Automatic seed execution during application startup, migration deployment, Docker startup, or
  production deployment.
- Deleting or reconciling manually created records that are not in the seed arrays.
- Redis caching or cache invalidation because the application does not currently have a cache.

**Assumptions** — approval of this draft confirms these choices:

- Province seed data follows the 34 province-level units effective under Resolution
  `202/2025/QH15` and the official list in Decision `19/2025/QD-TTg`, rather than the former
  63-province list.
- Stored province names omit the generic `Tỉnh`/`Thành phố` prefix because the current model has no
  administrative-type field. For example, values are `Hà Nội`, `Huế`, and `Hồ Chí Minh`.
- Public list/detail routes are useful as Place filters and selectors. Only `ADMIN` may mutate
  reference data; `EDITOR` can use Province/Category records when managing Places but cannot
  alter the taxonomy or administrative list.
- List APIs use the shared pagination defaults (`page=1`, `limit=20`, maximum `100`), default to
  `name asc`, and use `id asc` as a deterministic secondary sort.
- Names are trimmed, non-empty, limited to 100 characters, and remain unique according to the
  current database constraints.
- Updates that change a name also regenerate its slug. Duplicate name or generated-slug conflicts
  return HTTP `409` domain errors; slugs are not silently suffixed for these reference entities.
- Delete is a hard delete because the current schema has no active/deleted state:
  - A Province referenced by any Place cannot be deleted and returns a stable HTTP `409` error,
    matching the existing restrictive foreign key.
  - Deleting a Category also deletes its `PlaceCategory` associations through the existing
    cascading foreign key, but never deletes a Place.
- The seed is additive and repeatable: it upserts the approved records by stable slug, updates
  their canonical display names, preserves existing IDs, and does not remove extra records.
- Seed execution is explicit through `npm run db:seed`; it is never coupled to API startup.

## 3. Proposed Technical Details

The implementation will follow `docs/02-code-standards.md`: controllers perform orchestration
only, services contain business rules and Prisma access, all request properties use matching
validation and Swagger decorators, and every public service method has unit coverage.

### 3.1 Entity / Schema changes

- No Prisma model or database migration is required. The existing models and constraints remain:
  - `Province`: UUID `id`, unique `name`, unique `slug`, and required one-to-many relation from
    `Place`.
  - `Category`: UUID `id`, unique `name`, unique `slug`, and many-to-many relation to `Place`
    through `PlaceCategory`.
  - `Place.provinceId` uses `ON DELETE RESTRICT`.
  - `PlaceCategory.categoryId` uses `ON DELETE CASCADE`.
- Add Prisma seed configuration and source files:
  - `prisma/seed.ts` as the executable entry point.
  - Typed seed-data constants separated from execution logic so the exact dataset is reviewable
    and testable.
  - A `db:seed` package script using the project's existing TypeScript/Prisma toolchain.
- Seed the following 34 canonical province-level names, based on official current data:
  - `An Giang`, `Bắc Ninh`, `Cà Mau`, `Cần Thơ`, `Cao Bằng`, `Đà Nẵng`, `Đắk Lắk`,
    `Điện Biên`, `Đồng Nai`, `Đồng Tháp`, `Gia Lai`, `Hà Nội`, `Hà Tĩnh`, `Hải Phòng`, `Huế`,
    `Hưng Yên`, `Khánh Hòa`, `Lai Châu`, `Lâm Đồng`, `Lạng Sơn`, `Lào Cai`, `Nghệ An`,
    `Ninh Bình`, `Phú Thọ`, `Quảng Ngãi`, `Quảng Ninh`, `Quảng Trị`, `Sơn La`, `Tây Ninh`,
    `Thái Nguyên`, `Thanh Hóa`, `Hồ Chí Minh`, `Tuyên Quang`, and `Vĩnh Long`.
- Seed the following initial Vietnamese travel categories:
  - `Biển & đảo`
  - `Núi & cao nguyên`
  - `Thiên nhiên`
  - `Di tích lịch sử`
  - `Văn hóa`
  - `Tâm linh`
  - `Ẩm thực`
  - `Sinh thái`
  - `Nghỉ dưỡng`
  - `Phiêu lưu`
  - `Vui chơi & giải trí`
  - `Làng nghề`

Official province-data references:

- [Resolution 202/2025/QH15](https://vanban.chinhphu.vn/?classid=1&docid=213930&orggroupid=1&pageid=27160)
- [Decision 19/2025/QD-TTg](https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/19ttg.signed.pdf)

### 3.2 API Endpoints

All paths use the existing global `/api/v1` prefix and standard response/error envelope.

| Method   | Path              | Auth/Role | Description                                                  |
| -------- | ----------------- | --------- | ------------------------------------------------------------ |
| `GET`    | `/provinces`      | Public    | List provinces with search and pagination                    |
| `GET`    | `/provinces/:id`  | Public    | Get one province by UUID                                     |
| `POST`   | `/provinces`      | `ADMIN`   | Create a province                                            |
| `PATCH`  | `/provinces/:id`  | `ADMIN`   | Update a province name and regenerate its slug               |
| `DELETE` | `/provinces/:id`  | `ADMIN`   | Delete an unused province; reject when referenced by a Place |
| `GET`    | `/categories`     | Public    | List categories with search and pagination                   |
| `GET`    | `/categories/:id` | Public    | Get one category by UUID                                     |
| `POST`   | `/categories`     | `ADMIN`   | Create a category                                            |
| `PATCH`  | `/categories/:id` | `ADMIN`   | Update a category name and regenerate its slug               |
| `DELETE` | `/categories/:id` | `ADMIN`   | Delete a category and its PlaceCategory links                |

`GET /provinces` and `GET /categories` share this query contract:

- `page`: integer, minimum `1`, default `1`.
- `limit`: integer from `1` to `100`, default `20`.
- `search`: optional trimmed string, maximum `100`, matched case-insensitively against `name` and
  `slug`.
- `sortOrder`: optional `asc` or `desc`, default `asc`; the only sort field is `name`.

### 3.3 Key DTOs

- `CreateProvinceDto` / `CreateCategoryDto`: required validated `name`; slug is output-only.
- `UpdateProvinceDto` / `UpdateCategoryDto`: partial create DTO with at least one allowed field
  enforced by the global validation contract.
- `QueryProvinceDto` / `QueryCategoryDto`: shared pagination and sort order plus optional search.
- `ProvinceResponseDto` / `CategoryResponseDto`: `id`, `name`, and `slug`, with paginated success
  response DTOs for Swagger.
- Existing Place response shapes remain unchanged.

### 3.4 Important business rules

- Public list and detail methods expose all stored Province/Category records because these models
  do not have publication or deletion states.
- List data/count queries share one Prisma `where` object and run in a Prisma transaction for
  consistent pagination metadata.
- Controllers use the existing `@Public()`, `@Roles(Role.ADMIN)`, bearer-auth decorators,
  `ParseUUIDPipe`, guards, response interceptor, and exception filter; no shared security
  infrastructure is duplicated.
- Services trim names again at the business boundary, generate a shared normalized slug, and
  check both unique fields before create/update.
- Database unique-constraint races are caught and mapped to stable conflict errors instead of
  leaking Prisma errors.
- Detail/update/delete on a missing UUID returns HTTP `404` with `PROVINCE_NOT_FOUND` or
  `CATEGORY_NOT_FOUND`. Existing Places relation validation retains HTTP `400` behavior for an
  invalid referenced ID.
- Province deletion checks for Place references and also maps a database foreign-key race to
  `PROVINCE_IN_USE`.
- Category deletion intentionally relies on the current `PlaceCategory` cascade. Its response is
  the deleted Category record; affected Place records remain intact.
- Seed runs Province and Category upserts transactionally per dataset, disconnects Prisma in a
  `finally` path, and exits non-zero on failure without logging credentials or connection strings.
- Seed slugs are generated by the same shared utility used by CRUD, and a validation test ensures
  seed names/slugs are non-empty and unique before database execution.

### 3.5 Side effects / Async jobs / Cache invalidation

- Province and Category writes immediately affect which reference records and Place filters are
  available.
- Deleting a Category removes its existing PlaceCategory join rows by database cascade.
- No async jobs or Redis cache changes are introduced.
- Seed execution changes database reference data only when explicitly invoked.

## 4. Impact on the Existing System

- **Dependent modules/files:** `AppModule`, `PlacesModule` slug utility import, shared error codes
  and exceptions, Prisma seed configuration, package scripts, Swagger document, and e2e setup.
- **Database tables affected at runtime:** CRUD/seed writes to `provinces` and `categories`;
  Category delete may also delete matching `place_categories` rows.
- **Database schema/migrations:** no changes.
- **API compatibility:** existing Places and Identity endpoints and response shapes remain
  unchanged.
- **Authorization:** current JWT/role guards are reused. Unauthenticated mutation returns `401`;
  authenticated `USER`/`EDITOR` mutation returns `403`; `ADMIN` mutation is allowed.
- **User-owned file:** the existing untracked `prompts/note.md` is not modified.

## 5. Open Questions / Needs User Decision

- [x] No blocking questions. Approving this draft confirms the 34-province post-2025 dataset, the
      12-category Vietnamese taxonomy, admin-only mutations, paginated public reads, hard-delete
      behavior, and additive/non-destructive seed semantics described above.

## 6. Acceptance Criteria Checklist

- [x] All ten endpoints work with the validation, pagination, response, and authorization
      contracts in section 3.2.
- [x] Public Province/Category lists support trimmed case-insensitive search and deterministic
      pagination.
- [x] Create/update generate canonical Vietnamese-safe ASCII slugs and return domain conflicts for
      duplicate names/slugs.
- [x] Missing detail/update/delete targets return the correct domain-specific `404`.
- [x] Deleting a referenced Province returns `PROVINCE_IN_USE` without changing data.
- [x] Deleting a Category removes only that Category and its PlaceCategory links, not Places.
- [x] `npm run db:seed` creates/updates exactly 34 approved provinces and 12 approved categories,
      can run repeatedly without duplicates, and does not delete extra data.
- [x] Input is fully validated and controllers contain no business logic or direct Prisma access,
      per `docs/02-code-standards.md`.
- [x] Unit tests cover every public method in both services, important unique/FK error races, and
      seed-data uniqueness.
- [x] E2e tests cover public reads, admin CRUD success, `401`/`403` write denial, validation
      failures, duplicate conflicts, Province-in-use rejection, and Category-link cascading with
      deterministic test doubles or the existing isolated test setup.
- [x] Swagger fully documents request/response DTOs, bearer authorization, and expected errors for
      every endpoint.
- [x] Existing Places behavior and response shapes remain unchanged after the slug utility
      extraction.
- [x] Prisma validation/client generation, non-mutating lint, build, unit tests, e2e tests, and
      `git diff --check` pass.
- [x] No unrelated files or user-owned changes are modified.

## 7. Status Log

| Date       | Status      | Notes                                                                                                                                                                           |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-28 | DRAFT       | Agent created the first draft after reviewing docs `00`–`05`, prompts `001`–`003`, current Prisma relations, Places/Auth integration, tests, and official current province data |
| 2026-07-28 | APPROVED    | User explicitly approved implementation                                                                                                                                         |
| 2026-07-28 | IMPLEMENTED | Province/Category CRUD, authorization, idempotent seed, shared slug utility, Swagger, unit tests, and e2e tests completed                                                       |

### Implementation file log

Created:

- `prisma.config.ts`
- `prisma/seed.ts`
- `src/common/exceptions/reference-data.exceptions.ts`
- `src/common/utils/slug.util.ts`
- `src/database/reference-seed.data.ts`
- `src/database/reference-seed.data.spec.ts`
- `src/modules/categories/categories.controller.ts`
- `src/modules/categories/categories.module.ts`
- `src/modules/categories/categories.service.ts`
- `src/modules/categories/categories.service.spec.ts`
- `src/modules/categories/dto/category-response.dto.ts`
- `src/modules/categories/dto/create-category.dto.ts`
- `src/modules/categories/dto/query-category.dto.ts`
- `src/modules/categories/dto/update-category.dto.ts`
- `src/modules/provinces/provinces.controller.ts`
- `src/modules/provinces/provinces.module.ts`
- `src/modules/provinces/provinces.service.ts`
- `src/modules/provinces/provinces.service.spec.ts`
- `src/modules/provinces/dto/create-province.dto.ts`
- `src/modules/provinces/dto/province-response.dto.ts`
- `src/modules/provinces/dto/query-province.dto.ts`
- `src/modules/provinces/dto/update-province.dto.ts`
- `test/reference-data.e2e-spec.ts`

Modified:

- `package.json`
- `src/app.module.ts`
- `src/common/constants/error-code.enum.ts`
- `src/common/exceptions/category-not-found.exception.ts`
- `src/common/exceptions/province-not-found.exception.ts`
- `src/modules/places/places.service.ts`
- `prompts/004-province-category-crud-seed.md`

Deleted:

- `src/modules/places/utils/place-slug.util.ts` (replaced by the shared slug utility)

Verification:

- Prisma schema validation and client generation pass.
- Prisma config and seed TypeScript entrypoint compile successfully.
- Non-mutating ESLint, Prettier check, Nest build, and `git diff --check` pass.
- Unit tests: 56 passed across 7 suites.
- E2e tests: 19 passed across 3 suites.
- Production dependency audit reports zero vulnerabilities.
- The seed command was not executed against the configured database to avoid mutating an
  environment outside the test setup; seed data and upsert behavior are covered by typed source,
  unit tests, and Prisma command/config validation.
- The existing untracked `prompts/note.md` was preserved unchanged.
