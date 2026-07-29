---
id: 017
title: Add sanitized HTML content to destinations
status: IMPLEMENTED
module: places, database
created_at: 2026-07-29
updated_at: 2026-07-29
---

## 1. Original Idea

> phần destination bổ sung content lưu string dạng html như story và cập nhật lại api

## 2. Analysis & Scope

The project represents a destination with the `Place` model and exposes it through
`/api/v1/places`. A Place currently has only a plain-text `description`. This task will preserve
`description` as the short summary and add `content` as the complete destination body stored as a
sanitized HTML string, following the same security contract already used by Post/story content.

**In scope:**

- Add a required `content` column to `places`.
- Keep `description` as required plain text for cards, previews, and short summaries.
- Accept `content` in Place create and update requests.
- Return `content` from Place list, detail, create, update, and soft-remove responses.
- Sanitize destination HTML before every create/update persistence operation.
- Reuse the Post/story HTML allowlist and meaningful-visible-text validation instead of
  maintaining two different HTML policies.
- Refactor the existing Post-specific sanitizer into a shared article HTML sanitizer usable by
  both Posts and Places without changing current Post behavior.
- Extend normalized destination search to include visible text extracted from HTML `content`
  without indexing tag names.
- Backfill existing Place rows and update the complete SQL seed so the new non-null column can be
  introduced without losing current data.
- Update Prisma schema documentation, Swagger, unit tests, and Place e2e tests.

**Out of scope:**

- Renaming the `Place` model/module/routes to `Destination`.
- Removing or changing the meaning of the existing `description` field.
- Adding a frontend rich-text editor or changing frontend HTML rendering.
- Supporting arbitrary HTML, scripts, iframes, video embeds, forms, inline event handlers, or
  custom inline CSS.
- Changing destination routes, authorization, roles, pagination, category/province relations,
  images, ratings, or soft-remove behavior.
- Adding content versioning, localization, SEO metadata, or a separate destination-content table.

**Assumptions** — approval of this draft confirms these choices:

- “Story” refers to the existing Post article behavior implemented by prompt `010`; destination
  `content` uses the same sanitized HTML contract.
- `content` is required for newly created destinations, is limited to 100,000 input characters,
  and must contain meaningful visible text after sanitization.
- Existing Place rows are backfilled with their current plain-text `description`. Plain text is a
  valid safe HTML fragment and avoids inventing editorial content during migration.
- Full `content` remains present in list responses as well as detail responses so every existing
  Place response shape is consistently extended. Payload optimization can be a separate task.
- Search continues matching `name`, `description`, and `address`, and additionally matches visible
  text from `content`.

## 3. Proposed Technical Details

The implementation will follow `docs/02-code-standards.md` and the Places module blueprint in
`docs/05-nestjs-modules.md`: validated Swagger DTOs, controller orchestration only, service-level
sanitization/business logic, Prisma migrations, and automated tests.

### 3.1 Entity / Schema changes

- Update `Place` in `prisma/schema.prisma` and the reference model in
  `docs/04-database-schema.md`:
  - Keep `description String` as the short plain-text summary.
  - Add `content String` as the sanitized HTML destination body.
- Add a Prisma SQL migration that:
  - Adds nullable `places.content`.
  - Backfills every existing row from `places.description`.
  - Enforces `NOT NULL` after the backfill.
  - Drops and recreates the generated `places.search_text` column and
    `places_search_text_trgm_idx` index so search sources are `name`, `description`, `address`,
    and visible text from HTML `content`.
- Update the Place insert/upsert section in `prisma/seed-all.sql` to write `content`.
- No new table, relation, enum, or runtime dependency is needed; the project already depends on
  the HTML sanitizer used by Posts.

### 3.2 API Endpoints

No route or authorization rule changes. Existing payloads and responses gain `content`.

| Method | Path | Auth/Role | Description |
|---|---|---|---|
| `GET` | `/api/v1/places` | Public | List published destinations including sanitized HTML `content` |
| `GET` | `/api/v1/places/:id` | Public | Return destination detail including sanitized HTML `content` |
| `POST` | `/api/v1/places` | EDITOR, ADMIN | Create a destination with required HTML `content` |
| `PATCH` | `/api/v1/places/:id` | EDITOR, ADMIN | Optionally update and re-sanitize HTML `content` |
| `DELETE` | `/api/v1/places/:id` | ADMIN | Existing soft-remove response also includes `content` |

### 3.3 Key DTOs

- `CreatePlaceDto`
  - Preserve `description` as required plain text.
  - Add required `content`: trimmed string, non-empty, maximum 100,000 input characters.
  - Add Swagger description/example identifying it as sanitized HTML.
- `UpdatePlaceDto`
  - Inherit optional `content` with the same validation through the existing `PartialType`.
- `PlaceResponseDto`
  - Add required `content`, documented as sanitized HTML.
- `QueryPlaceDto`
  - Update Swagger search documentation to include readable destination content.

Every changed request/response field will keep matching `class-validator`, transformation, and
Swagger metadata as required by `docs/02-code-standards.md`.

### 3.4 Important business rules

- Move the current Post HTML policy into a shared, independently tested utility with neutral
  naming; Posts and Places call the same implementation.
- Continue allowing the current article-oriented HTML subset: paragraphs, headings, lists,
  emphasis, blockquotes, links, HTTPS images, figures/captions, line breaks, horizontal rules,
  and code/preformatted blocks.
- Continue removing scripts, executable/embed/form elements, event handlers, styles, unsafe URL
  schemes, protocol-relative image URLs, and unsupported tags/attributes.
- Reject HTML that is empty or has no meaningful visible text after sanitization.
- Persist and return only sanitized content, never the raw submitted HTML.
- Sanitize only when `content` is supplied on update; updating another Place field must not
  rewrite existing content.
- Preserve all current province/category validation, unique-slug generation, transaction
  boundaries, roles, publication visibility, and soft-remove rules.
- Controllers remain free of database and sanitization business logic.

### 3.5 Side effects / Async jobs / Cache invalidation

- No queue job or cache invalidation is required because the current Places module has neither.
- PostgreSQL automatically recalculates generated `search_text` whenever a Place content field
  changes.
- List responses become larger because they include the full destination HTML body.

## 4. Impact on the Existing System

- **Database:** `places` gains a non-null `content`; the generated Place search column and its GIN
  trigram index are recreated.
- **Dependent modules/files:** Places DTOs/service/tests, shared HTML sanitizer, Posts imports and
  sanitizer tests, Prisma client generation, full SQL seed, and database schema documentation.
- **Security:** destination HTML receives the same stored-XSS protection as Post/story HTML.
- **Client impact:** create requests must add `content`; all Place responses gain `content`.
- **Breaking changes:** `POST /api/v1/places` rejects older payloads that omit `content`. No route
  or existing response field is removed, and current Post behavior remains unchanged.

## 5. Open Questions / Needs User Decision

- [x] Confirm that destination `content` is required and limited to 100,000 characters.
- [x] Confirm that destination HTML should use exactly the same allowed elements and URL rules as
      Post/story HTML.
- [x] Confirm that list responses should include full `content`, not only destination detail.

Approving this prompt accepts the assumptions above. Use `REQUEST_CHANGES` to choose different
required/optional behavior, limits, HTML policy, search behavior, or response scope.

## 6. Acceptance Criteria Checklist

- [x] A migration adds and safely backfills non-null `places.content`.
- [x] Place create/update APIs validate, sanitize, persist, and return HTML `content`.
- [x] Unsafe tags, attributes, and URL schemes are removed before destination content is stored.
- [x] Content without meaningful visible text is rejected.
- [x] Every Place response includes sanitized `content`.
- [x] Destination search matches visible HTML text while preserving existing
      case/accent-insensitive behavior and other searchable fields.
- [x] Existing Post/story sanitization behavior remains unchanged after sharing the sanitizer.
- [x] Existing Place authorization, relationships, slugging, pagination, ratings, images, and
      soft-remove behavior remain unchanged.
- [x] The complete idempotent SQL seed writes valid destination content.
- [x] Unit tests cover sanitizer reuse and Place create/update/response mapping.
- [x] E2e tests cover Place request validation, create/update/read responses, unsafe HTML removal,
      invalid empty HTML, and the extended search contract.
- [x] Swagger and `docs/04-database-schema.md` accurately describe destination `description` and
      HTML `content`.
- [x] Prisma generation, build, lint, unit tests, and Place e2e tests pass.

## 7. Status Log

| Date | Status | Notes |
|---|---|---|
| 2026-07-29 | DRAFT | Agent created the draft after reviewing docs `00`–`05`, prompt `010`, and the current Places/Post implementations |
| 2026-07-29 | APPROVED | User explicitly approved implementation |
| 2026-07-29 | IMPLEMENTED | Added sanitized destination HTML content, search/backfill migration, API/seed/docs updates, shared sanitizer, and tests |

**Files created:**

- `prisma/migrations/20260729020000_place_html_content/migration.sql`
- `src/common/utils/article-html-sanitizer.ts`
- `src/common/utils/article-html-sanitizer.spec.ts`
- `prompts/017-destination-html-content.md`

**Files modified:**

- `docs/04-database-schema.md`
- `docs/05-nestjs-modules.md`
- `prisma/schema.prisma`
- `prisma/seed-all.sql`
- `src/modules/places/dto/create-place.dto.ts`
- `src/modules/places/dto/place-response.dto.ts`
- `src/modules/places/dto/query-place.dto.ts`
- `src/modules/places/places.service.ts`
- `src/modules/places/places.service.spec.ts`
- `src/modules/posts/posts.service.ts`
- `src/modules/travel-content-ingestions/travel-content-ingestions.service.ts`
- `test/auth.e2e-spec.ts`
- `test/content.e2e-spec.ts`
- `test/places.e2e-spec.ts`

**Files removed after moving the sanitizer to `common`:**

- `src/modules/posts/post-content-sanitizer.ts`
- `src/modules/posts/post-content-sanitizer.spec.ts`

**Verification:**

- Prisma schema validation and client generation passed.
- ESLint and NestJS production build passed.
- Unit tests: 25 suites, 140 tests passed.
- E2e tests: 4 suites, 43 tests passed.
