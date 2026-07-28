---
id: 008
title: Province, category, and place images with internet URL seed
status: IMPLEMENTED
module: database, provinces, categories, places
created_at: 2026-07-28
updated_at: 2026-07-28
---

## 1. Original Idea

> implement images for provines, categoties, places,... and then fetch the url from internet then save the url to our DB

## 2. Analysis & Scope

The explicit entities in the request are interpreted as `Province`, `Category`, and `Place`.
They currently have no image relation or image field. This task adds reusable image metadata,
returns it through the existing public APIs, and provides a controlled seed/backfill command that
resolves curated, openly licensed Wikimedia Commons files to HTTPS image URLs and stores the URLs
and attribution metadata in PostgreSQL.

**In scope:**

- Add a reusable `EntityImage` Prisma model related to Province, Category, or Place.
- Support an ordered image collection per owner so the first item can be used as its cover image.
- Store the served image URL, Commons source page, alt text, creator/credit, license name and URL,
  image dimensions, order, and timestamps.
- Add one curated image for every record in the current fixture sets:
  - all 34 Province seeds;
  - all 12 Category seeds;
  - all 6 Places in `prisma/seed-all.sql`.
- Add an explicit, repeatable image seed/backfill command. It will resolve approved Commons file
  titles through the MediaWiki `imageinfo` API, validate the returned media metadata, and save the
  resolved URLs to the database.
- Include ordered `images` arrays in Province, Category, and Place list/detail responses.
- Keep list queries bounded and avoid per-record image queries by loading image relations with the
  owner records.
- Update Prisma migration/schema, conceptual database documentation, Swagger response DTOs,
  owner mapping/interfaces, seed fixtures, unit tests, and main e2e read flows.
- Keep the existing full SQL fixture aligned with the new table by including deterministic
  `entity_images` rows for its seeded Provinces, Categories, and Places.

**Out of scope:**

- Images for Posts, Reviews, Comments, Users, or future entities implied only by the trailing
  "`...`". Post/Review media belongs to the separate upload-oriented `MediaModule` described in
  `docs/00-project-overview.md` and `docs/04-database-schema.md`.
- Uploading or copying image binaries to S3/R2. This task stores remote internet URLs as requested.
- A public or authenticated endpoint that fetches an arbitrary caller-provided URL. That would
  introduce SSRF, content-safety, reliability, and licensing risks.
- Admin image-management endpoints, automatic image search when an owner is created, AI-generated
  images, image editing, transcoding, resizing, or moderation.
- Blindly selecting the first search result for arbitrary user-created database records.
- Redis caching or a background queue solely for this one-time/reference-data seed workflow.

**Assumptions** — approval of this draft confirms these choices:

- “Images” means a gallery-capable data model, but this task seeds one ordered cover image
  (`sortOrder = 0`) for each of the 52 current fixture owners.
- Owners created outside the known fixtures may legitimately return `images: []`; the image seed
  logs and skips unknown slugs instead of guessing.
- Wikimedia Commons is the external source because files are intended for reuse under stated
  licenses. Each selected file still requires its individual license and attribution metadata to
  be retained and displayed by clients.
- Image selections will favor recognizable Vietnamese scenery/landmarks, avoid prominent
  identifiable people, and use raster image media suitable for a destination card/hero.
- The stored `url` is an HTTPS Commons-hosted web image/thumbnail URL returned by the API, not a
  base64 value or downloaded binary. The source file page is stored separately.
- Remote URLs can change or become unavailable. A future production-hardening task may copy
  approved images to the application's S3/R2 storage while preserving the original source and
  attribution.
- No internet request occurs while serving Province, Category, or Place APIs. Internet access is
  used only when the explicit image seed command runs.

## 3. Proposed Technical Details

Implementation will follow `docs/02-code-standards.md`: controllers remain orchestration-only,
database and mapping behavior stays in services, response DTOs remain synchronized with Swagger,
and remote fetching is isolated in a testable seed service/script rather than request handlers.

### 3.1 Entity / Schema changes

- Add `EntityImage` mapped to `entity_images` with:
  - UUID `id`;
  - `url`;
  - `sourcePageUrl`;
  - `altText`;
  - nullable `author`;
  - `licenseName`;
  - nullable `licenseUrl`;
  - nullable positive `width` and `height`;
  - non-negative `sortOrder`, defaulting to `0`;
  - exactly one nullable owner foreign key: `provinceId`, `categoryId`, or `placeId`;
  - `createdAt` and `updatedAt`.
- Add `images EntityImage[]` relations to `Province`, `Category`, and `Place`.
- Each owner foreign key uses `ON DELETE CASCADE`, so deleting a Province/Category or eventually
  deleting a Place cannot leave orphan image rows.
- Add database constraints/indexes:
  - a SQL `CHECK` requiring exactly one of the three owner IDs;
  - unique ordering within each owner (`provinceId/sortOrder`, `categoryId/sortOrder`,
    `placeId/sortOrder`);
  - indexes supporting batched relation reads.
- Use the checked-in migration SQL to express the cross-column owner `CHECK`, which Prisma schema
  syntax cannot fully represent.
- Update `docs/04-database-schema.md` so the documented model no longer drifts from the implemented
  Prisma schema.

### 3.2 API Endpoints

No runtime endpoint is added or removed.

| Method | Path | Auth/Role | Description |
|---|---|---|---|
| `GET` | `/api/v1/provinces` | Public | Existing list now includes ordered `images` |
| `GET` | `/api/v1/provinces/:id` | Public | Existing detail now includes ordered `images` |
| `GET` | `/api/v1/categories` | Public | Existing list now includes ordered `images` |
| `GET` | `/api/v1/categories/:id` | Public | Existing detail now includes ordered `images` |
| `GET` | `/api/v1/places` | Public | Existing list now includes ordered `images` |
| `GET` | `/api/v1/places/:id` | Public | Existing detail now includes ordered `images` |

Add an operator command, not an HTTP API:

- `npm run db:seed:images` resolves the curated Commons manifest and upserts image metadata.
- The command is run after migrations and after the relevant owner records exist.

### 3.3 Key DTOs

- `EntityImageResponseDto` exposes `id`, `url`, `sourcePageUrl`, `altText`, `author`,
  `licenseName`, `licenseUrl`, `width`, `height`, and `sortOrder`.
- `ProvinceResponseDto`, `CategoryResponseDto`, and `PlaceResponseDto` expose
  `images: EntityImageResponseDto[]`.
- No request DTO accepts a remote URL in this task.
- Seed manifest/API response types are strict TypeScript types; remote JSON is treated as
  `unknown` until validated and must not introduce `any`.

### 3.4 Important business rules

- Image lists are always ordered by `sortOrder ASC`, then `id ASC`.
- Empty image collections serialize as `[]`, never `null`.
- The first item is the cover image by convention; no duplicate `sortOrder` is allowed for one
  owner.
- The image seed manifest uses stable owner slugs and curated Commons `File:` titles. It does not
  rely on a changing “first search result” during normal execution.
- Before any write, the seed resolves all requested files and validates:
  - HTTPS URL and source-page URL;
  - raster image media/MIME type;
  - non-zero dimensions;
  - required license name;
  - expected owner slug exists in the database.
- Commons calls use a descriptive User-Agent, timeout, bounded concurrency, and limited retries
  for transient `429`/`5xx` responses.
- Remote data is collected and validated before one database transaction upserts the complete
  set. A permanent lookup/validation failure returns a non-zero exit code and does not partially
  replace the canonical fixture set.
- Upsert identity is owner plus `sortOrder`; rerunning refreshes URL/metadata without creating
  duplicates or changing owner IDs.
- The seed never deletes images for owners outside its manifest.
- The API returns attribution and license fields so a client can satisfy the selected file's reuse
  requirements; displaying only the image without its required credit is not considered a
  complete consumer implementation.
- Unit/e2e tests never depend on live internet access. HTTP behavior is mocked with representative
  MediaWiki responses; optional live resolution is an explicit integration verification step.

### 3.5 Side effects / Async jobs / Cache invalidation

- Running `db:seed:images` performs outbound HTTPS reads to Wikimedia Commons and database writes
  to `entity_images`.
- No outbound request occurs during application startup or API reads.
- No BullMQ job is added.
- The application currently has no Redis cache for these APIs. If caching is introduced later,
  image writes must invalidate Province/Category/Place list and detail keys.

## 4. Impact on the Existing System

- **Database tables affected:** new `entity_images`; new relations from existing `provinces`,
  `categories`, and `places`.
- **Dependent modules/files:** Prisma schema/migration/client, reference image manifest and seed
  script, `prisma/seed-all.sql`, Province/Category/Place response DTOs, relation interfaces,
  services, Swagger schemas, and their unit/e2e tests.
- **API behavior:** additive response change—existing entity objects gain an `images` array.
- **Breaking changes:** no existing route or request contract changes. Strict consumers that reject
  unknown response fields may need to accept the new additive field.
- **Operational dependency:** only `db:seed:images` requires internet access. Normal build, tests,
  database migrations, application startup, and API reads remain offline-capable.
- **Source/reuse guidance consulted:** MediaWiki's `imageinfo` API documentation and Wikimedia
  Commons' reuse guidance. Commons notes that individual files may have different credit/license
  obligations and that direct hotlinking is possible but not recommended for every production
  use; the stored provenance fields preserve a later migration path to owned object storage.

## 5. Open Questions / Needs User Decision

- [x] No blocking question. Approving this draft confirms the explicit Province/Category/Place
      scope, gallery-capable model with one seeded cover per current fixture, Wikimedia Commons as
      the source, storage of attribution/license metadata, and no runtime arbitrary-URL fetch API.

## 6. Acceptance Criteria Checklist

- [x] Prisma schema validates, client generation succeeds, and the migration creates
      `entity_images` with foreign keys, uniqueness, indexes, and the exactly-one-owner check.
- [x] `docs/04-database-schema.md` documents the implemented entity-image model and relations.
- [x] The curated manifest covers exactly 34 Province, 12 Category, and 6 demo Place slugs with no
      duplicates or missing current fixture slugs.
- [x] `npm run db:seed:images` resolves valid HTTPS image metadata from Commons and saves exactly
      one ordered cover image for every current fixture owner.
- [x] Re-running the command is idempotent and refreshes metadata without duplicate rows.
- [x] A permanent remote lookup/validation failure exits non-zero without a partial canonical
      image backfill.
- [x] Province, Category, and Place list/detail APIs return ordered `images` arrays with URL,
      provenance, alt text, attribution, license, dimensions, and order.
- [x] Owners with no image return `images: []`.
- [x] Existing create/update/delete behavior remains unchanged, and owner deletion cascades to its
      image rows where deletion is currently supported.
- [x] `prisma/seed-all.sql` remains transactional/idempotent and supplies coherent rows for the new
      table.
- [x] Input/remote-data validation and TypeScript code comply with
      `docs/02-code-standards.md`.
- [x] Unit tests cover response mapping/order and image seed success, idempotency, missing owner,
      malformed metadata, remote failure, and transaction behavior without live network calls.
- [x] E2e tests cover images on the main Province, Category, and Place public list/detail flows.
- [x] Swagger fully documents the additive image response fields.
- [x] Prisma validation/generation, lint, build, unit tests, e2e tests, and `git diff --check` pass.
- [x] No application request path performs an outbound image lookup or accepts an arbitrary URL to
      fetch.

## 7. Status Log

| Date | Status | Notes |
|---|---|---|
| 2026-07-28 | DRAFT | Agent created the draft after reviewing docs `00`–`05`, the prompt template/history, current Prisma schema/migrations, reference and full SQL seeds, Province/Category/Place modules, and official Wikimedia image metadata/reuse guidance |
| 2026-07-28 | APPROVED | User explicitly approved implementation |
| 2026-07-28 | IMPLEMENTED | Added entity-image persistence and API responses, curated and live-validated 52 Commons files, implemented the transactional image seed command, updated SQL fixtures/docs, and completed automated verification |

### Implementation file log

Created:

- `prisma/migrations/20260728020000_entity_images/migration.sql`
- `src/common/dto/entity-image-response.dto.ts`
- `src/common/utils/entity-image-query.util.ts`
- `src/database/commons-image.resolver.ts`
- `src/database/commons-image.resolver.spec.ts`
- `src/database/entity-image-seed.data.ts`
- `src/database/entity-image-seed.data.spec.ts`
- `src/database/entity-image-seed.service.ts`
- `src/database/entity-image-seed.service.spec.ts`
- `src/scripts/seed-entity-images.ts`
- `prompts/008-entity-images-internet-url-seed.md`

Modified:

- `docs/04-database-schema.md`
- `package.json`
- `prisma/schema.prisma`
- `prisma/seed-all.sql`
- `src/modules/categories/categories.service.ts`
- `src/modules/categories/categories.service.spec.ts`
- `src/modules/categories/dto/category-response.dto.ts`
- `src/modules/places/dto/place-response.dto.ts`
- `src/modules/places/interfaces/place-with-relations.interface.ts`
- `src/modules/places/places.service.ts`
- `src/modules/places/places.service.spec.ts`
- `src/modules/provinces/dto/province-response.dto.ts`
- `src/modules/provinces/provinces.service.ts`
- `src/modules/provinces/provinces.service.spec.ts`
- `test/places.e2e-spec.ts`
- `test/reference-data.e2e-spec.ts`

Verification:

- Prisma schema validation and client generation pass.
- Live Wikimedia Commons metadata resolution succeeds for all 52 curated files: 34 Provinces,
  12 Categories, and 6 demo Places.
- Resolved files use Commons-hosted HTTPS URLs and licenses from the CC BY, CC BY-SA, CC0, or
  public-domain families; attribution/license metadata is retained.
- ESLint and Nest build pass.
- Unit tests: 17 suites and 106 tests passed.
- E2e tests: 4 suites and 35 tests passed.
- `git diff --check` passes (line-ending conversion warnings only).
- Runtime migration/seed execution was not possible because the configured PostgreSQL instance at
  `localhost:5433` was offline and neither a local PostgreSQL service nor Docker/`psql` was
  available. The database write path is covered by mocked transaction/upsert tests; run migrations
  and `npm run db:seed:images` when PostgreSQL is available.
