---
id: 014
title: Treat an empty Post source query as no filter
status: IMPLEMENTED
module: posts
created_at: 2026-07-29
updated_at: 2026-07-29
---

## 1. Original Idea

> source= as “no filter,” pls

## 2. Analysis & Scope

`GET /api/v1/posts` currently validates the optional `source` query parameter as a `PostSource`
enum. Although the property is optional, an explicit `source=` is received as an empty string
rather than as an omitted value, so enum validation returns HTTP 400. The requested behavior is to
normalize exactly that empty query value to an omitted value before validation and therefore list
published Posts without a source filter.

**In scope:**

- Normalize an empty-string `source` value in `QueryPostDto` to `undefined`.
- Preserve the existing `SYSTEM` and `USER` filters.
- Preserve HTTP 400 validation for all other invalid non-empty `source` values.
- Document the empty-value behavior in the generated Swagger schema.
- Add regression coverage for the empty and invalid cases.

**Out of scope:**

- Changing the `PostSource` enum or database schema.
- Changing how a Post's source is derived during creation.
- Applying empty-string normalization to unrelated query parameters or endpoints.
- Treating non-empty whitespace or arbitrary invalid values as no filter.

**Assumptions:**

- Only the exact empty string produced by `?source=` means “no filter.”
- Existing pagination, sorting, publication visibility, and soft-delete behavior remain unchanged.

## 3. Proposed Technical Details

### 3.1 Entity / Schema changes

- None. The `Post.source` column and `PostSource` enum documented in
  `docs/04-database-schema.md` remain unchanged.

### 3.2 API Endpoints

| Method | Path            | Auth/Role | Description |
|---|---|---|---|
| `GET`  | `/api/v1/posts` | Public    | Treat `source=` as an omitted source filter |

### 3.3 Key DTOs

- Update `QueryPostDto.source` with a `class-transformer` normalization that maps only `''` to
  `undefined` before the existing `@IsOptional()` and `@IsEnum(PostSource)` validation.
- Update `@ApiPropertyOptional` metadata to state that an empty value applies no source filter.
- Keep the DTO structure and validation aligned with `docs/02-code-standards.md`.

### 3.4 Important business rules

- Omitted `source` and `source=` produce an unfiltered published Post feed.
- `source=SYSTEM` filters to system Posts.
- `source=USER` filters to user Posts.
- Values such as `source=OTHER` continue to fail request validation with HTTP 400.

### 3.5 Side effects / Async jobs / Cache invalidation

- None.

## 4. Impact on the Existing System

- Dependent modules: Posts request validation and Posts e2e coverage.
- Database impact: none.
- Breaking changes: none; this is a backward-compatible relaxation for one previously invalid
  optional query representation.

## 5. Open Questions / Needs User Decision

- None.

## 6. Acceptance Criteria Checklist

- [x] `GET /api/v1/posts?...&source=&...` returns HTTP 200 and does not add a source filter.
- [x] Omitting `source` continues to return Posts from either source.
- [x] `source=SYSTEM` and `source=USER` continue to filter correctly.
- [x] A non-empty invalid source continues to return HTTP 400 with the existing validation error.
- [x] Pagination, sorting, public visibility, and response shape remain unchanged.
- [x] Regression tests cover the empty-source and invalid-source request cases.
- [x] Swagger documents the empty value as no filter.
- [x] Implementation follows `docs/02-code-standards.md`.

## 7. Status Log

| Date       | Status | Notes |
|---|---|---|
| 2026-07-29 | DRAFT  | Agent created the first draft |
| 2026-07-29 | APPROVED | User approved implementation |
| 2026-07-29 | IMPLEMENTED | Updated `QueryPostDto` empty-source normalization and Swagger metadata; added e2e coverage in `test/content.e2e-spec.ts`; verified targeted lint, Prettier, 17 content e2e tests, and the Nest production build |
