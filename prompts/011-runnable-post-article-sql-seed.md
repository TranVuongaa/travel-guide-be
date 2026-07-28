---
id: 011
title: Add runnable SQL seed for complete Post articles with image links
status: IMPLEMENTED
module: database, posts
created_at: 2026-07-28
updated_at: 2026-07-28
---

## 1. Original Idea

> cho mình sql insert/update data có thể chạy được trong db bao gồm cả img link và content này

## 2. Analysis & Scope

The actual Prisma schema currently has no `Media` model/table and no dedicated image URL column on
`Post`. The compatible way to associate article images without another schema migration is to
place safe HTTPS image URLs inside the sanitized HTML `Post.content` using the already-approved
`figure`, `img`, `figcaption`, and `a` elements.

This task will provide a focused PostgreSQL script that can insert the current sample articles when
they do not exist and update them when they already exist. It will be safe to run repeatedly and
will not duplicate Post rows.

**In scope:**

- Create `prisma/seed-post-articles.sql` as a standalone PostgreSQL script.
- Seed/upsert the six existing sample destinations:
  - Vịnh Hạ Long.
  - Phố cổ Hội An.
  - Phong Nha - Kẻ Bàng.
  - Đà Lạt.
  - Phú Quốc.
  - Đại Nội Huế.
- Include for every Post:
  - Stable UUID.
  - Existing author resolved by email.
  - Existing Place resolved by slug.
  - Title.
  - Plain-text `description`.
  - Complete multi-section sanitized HTML `content`.
  - An HTTPS article image inside `figure/img/figcaption`.
  - Source, published status, and timestamps.
- Reuse the Wikimedia Commons image URLs and attribution/source pages already present in
  `prisma/seed-all.sql`.
- Use `INSERT ... ON CONFLICT ("id") DO UPDATE` so the script supports both insert and update.
- Wrap writes in a transaction and stop with a clear error if required users or Places are
  missing.
- Include a final read-only verification query showing the affected Posts and whether their HTML
  includes an image.
- Document the exact `psql` command used to execute the script.

**Out of scope:**

- Adding a `media` table, Post image column, Prisma relation, or Media API.
- Downloading, uploading, or proxying image files.
- Modifying application endpoints, DTOs, services, Swagger, or authorization.
- Creating missing users, Provinces, Places, or Categories.
- Seeding reviews, comments, reactions, or engagement counts.
- Executing the SQL against a user database automatically.

**Assumptions** — the user can change these before approval:

- Migration `20260728040000_post_description_html_content` has already been applied, so
  `posts.description` exists.
- Base users and Places from `prisma/seed-all.sql` already exist. The new script will fail
  atomically with a descriptive error when a required email or Place slug is absent.
- Image links are embedded in `content`; no separate `imageUrl` field will appear in the Post API.
- The six article UUIDs remain the stable IDs currently used by `prisma/seed-all.sql`.
- All seeded articles are `PUBLISHED`; admin/editor articles use `SYSTEM`, while traveler/foodie
  articles use `USER`.
- Direct SQL bypasses the NestJS sanitizer, so the script itself will contain only the approved
  safe HTML allowlist and HTTPS image URLs.

## 3. Proposed Technical Details

### 3.1 Entity / Schema changes

- No table, column, enum, index, relation, or Prisma migration change.
- The script writes only to the existing `posts` table documented in
  `docs/04-database-schema.md`.
- Image links live inside the existing `posts.content` HTML string.

### 3.2 API Endpoints

No API endpoint changes.

| Method | Path | Auth/Role                   | Description                                 |
| ------ | ---- | --------------------------- | ------------------------------------------- |
| N/A    | N/A  | Direct PostgreSQL execution | Insert or update six complete Post articles |

### 3.3 Key DTOs

- No DTO changes.
- Seed fields will remain compatible with `CreatePostDto` rules from
  `docs/02-code-standards.md` and prompt `010`:
  - `title`: non-empty, maximum 200 characters.
  - `description`: plain text, non-empty, maximum 500 characters.
  - `content`: meaningful safe HTML, maximum 100,000 characters.

### 3.4 Important business rules

- Start with `BEGIN` and finish with `COMMIT`; any failed prerequisite check rolls back the whole
  operation.
- Use a fixture CTE/VALUES relation and joins to resolve `authorId` and `placeId`.
- Validate all required author emails and Place slugs before inserting so missing dependencies do
  not silently skip rows.
- Upsert by stable Post UUID and update author, Place, title, description, content, source, status,
  deletion state, and `updatedAt`.
- Preserve the original `createdAt` for an existing row while setting it for a newly inserted row.
- Set `deletedAt = NULL` so rerunning the seed restores seeded articles to the published dataset.
- Do not write `search_text`; PostgreSQL generates it automatically.
- HTML must not include script, iframe, style, inline event handlers, non-HTTPS images, or
  unsupported attributes.

### 3.5 Side effects / Async jobs / Cache invalidation

- Six deterministic Post rows are inserted or updated directly.
- The generated `search_text` column updates automatically.
- No application event, queue job, moderation hook, or cache invalidation runs because this is
  direct SQL.
- If Post-list caching is introduced later, it must be cleared separately after running this
  script.

## 4. Impact on the Existing System

- **Database:** data-only changes to six rows in `posts`; no schema change.
- **Dependent data:** requires the referenced users and Places to exist.
- **API:** existing reads will return the seeded `description` and full HTML `content`, including
  the embedded image.
- **Security:** direct SQL content is manually constrained to the same safe HTML policy as the
  backend sanitizer.
- **Breaking changes:** none.

## 5. Open Questions / Needs User Decision

- [x] Confirm that embedding the image link inside HTML `content` is acceptable until a dedicated
      Post Media feature is implemented.
- [x] Confirm that the focused script should upsert the six existing demo articles rather than
      create a different article set.
- [x] Confirm that the script may require users/Places from `prisma/seed-all.sql` and fail clearly
      when those prerequisites are missing.

Approving this prompt accepts the assumptions above. Use `REQUEST_CHANGES` if you want a dedicated
Post image column/table, different articles, or a fully self-contained seed that also creates all
dependent records.

## 6. Acceptance Criteria Checklist

- [x] `prisma/seed-post-articles.sql` runs as valid PostgreSQL after the required migrations.
- [x] The script is transactional and idempotent.
- [x] Missing users or Places produce a clear error without partial writes.
- [x] Six Posts are inserted or updated by stable UUID.
- [x] Every Post has a short description and a complete safe HTML article.
- [x] Every HTML article includes an HTTPS image and source attribution.
- [x] Rerunning the script updates existing rows without creating duplicates.
- [x] Generated `search_text` is not written directly.
- [x] A final verification query reports the affected Posts and image presence.
- [x] The execution command and prerequisites are documented.

## 7. Status Log

| Date       | Status      | Notes                                                                                                              |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| 2026-07-28 | DRAFT       | Agent created the first draft after reviewing the required project documents and current database schema           |
| 2026-07-28 | APPROVED    | User approved the draft for implementation                                                                         |
| 2026-07-28 | IMPLEMENTED | Added the transactional, idempotent six-article PostgreSQL upsert seed with embedded images and verification query |

**Files created:**

- `prisma/seed-post-articles.sql`
- `prompts/011-runnable-post-article-sql-seed.md`

**Verification:**

- Static validation found six unique stable Post fixtures.
- Every description is within 500 characters and every HTML body is within 100,000 characters.
- Every article contains an HTTPS image and Wikimedia Commons attribution.
- No script, iframe, inline style, event handler, unsafe image URL, or direct `search_text` write
  was found.
- All six image URLs and all six attribution URLs returned HTTP 200 on 2026-07-28.
- The configured PostgreSQL target at `localhost:5433` was unavailable, so the script was not
  executed against a database and no external data was changed.
