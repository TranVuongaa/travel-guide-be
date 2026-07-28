---
id: 010
title: Add post descriptions and sanitized HTML article content
status: IMPLEMENTED
module: posts, database
created_at: 2026-07-28
updated_at: 2026-07-28
---

## 1. Original Idea

> mình muốn các bài viết ngoài đoạn description ngắn còn thêm nội dung. Sẽ bao gôm string httml để bài viết hoàn chỉnh như bài báo

## 2. Analysis & Scope

The current implementation has `Post.title` and a required plain-string `Post.content`, but it
does not have a separate short description. This task will distinguish the two editorial fields:
`description` is the short summary used for previews, while `content` is the complete article body
represented as an HTML string.

Because all authenticated users can create posts and public clients will render the stored HTML,
the backend must sanitize HTML before persistence. Validation alone is not sufficient to prevent
stored cross-site scripting.

**In scope:**

- Add a required, non-null `description` column to `posts`.
- Keep the existing `content` column and redefine its API contract as sanitized HTML.
- Accept and return both `description` and `content` in Post create, update, list, detail, and
  current-user responses.
- Sanitize `content` on every create/update before it is stored.
- Allow a documented article-oriented HTML subset, including paragraphs, headings, lists, text
  emphasis, blockquotes, links, images, figures/captions, line breaks, horizontal rules, and
  code/preformatted blocks.
- Remove unsafe elements and attributes, including scripts, embedded executable content, inline
  event handlers, inline styles, and unsafe URL schemes such as `javascript:`.
- Update normalized post search to cover `title`, `description`, and the readable text extracted
  from HTML `content`.
- Backfill descriptions for existing posts and preserve their existing content safely.
- Update the full SQL seed so seeded posts have short descriptions and realistic multi-section
  HTML article bodies.
- Update Prisma schema documentation, Swagger schemas/examples, unit tests, and content e2e tests.

**Out of scope:**

- Building or changing a rich-text editor in a frontend application.
- Uploading article images, proxying remote images, or changing the Media module.
- Supporting arbitrary HTML, JavaScript, iframes, forms, embedded video, or custom CSS.
- Article revisions, autosave, content versioning, scheduled publishing, SEO metadata, or slugs.
- Changing post authorization, moderation, pagination, reactions, comments, or soft-delete rules.
- Returning a different lightweight DTO from list endpoints; existing response shapes will be
  extended instead of removing `content`.

**Assumptions** — the user can change these before approval:

- `description` is required for all newly created posts, is plain text, is trimmed, and has a
  maximum length of 500 characters.
- `content` remains required, must contain meaningful text after HTML is stripped, and its maximum
  input length increases from 20,000 to 100,000 characters to support complete articles.
- Sanitization uses an explicit allowlist. Links allow only safe web/mail schemes and receive safe
  link attributes; image sources allow only `https` URLs.
- Existing rows receive a description derived from the first 500 characters of their current
  plain-text content. Existing content is preserved because plain text is also safe when rendered
  as HTML.
- The public list and detail endpoints both continue returning full `content` to avoid removing an
  existing response field. A future payload-optimization task may introduce a summary-only list
  DTO if needed.

## 3. Proposed Technical Details

### 3.1 Entity / Schema changes

- Update `Post` in `prisma/schema.prisma` and the reference model in
  `docs/04-database-schema.md`:
  - Add `description String`.
  - Keep `content String`, documented as sanitized HTML.
- Add a new Prisma SQL migration that:
  - Adds `posts.description`.
  - Backfills it for every existing row before enforcing `NOT NULL`.
  - Recreates the generated `posts.search_text` column and its trigram index so the source text is
    `title + description + readable content text`, excluding HTML tag names.
- Update `prisma/seed-all.sql` so its idempotent Post insert/upsert writes `description` and
  complete sanitized HTML `content`.
- Add a maintained HTML-sanitization runtime dependency and its TypeScript types when required.

### 3.2 API Endpoints

No routes or authorization rules change.

| Method | Path                 | Auth/Role                   | Description                                                                |
| ------ | -------------------- | --------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/v1/posts`      | Public                      | List published posts with `description` and sanitized HTML `content`       |
| GET    | `/api/v1/posts/mine` | Authenticated               | List the caller's posts with both editorial fields                         |
| GET    | `/api/v1/posts/:id`  | Public                      | Return one published article with its short description and full HTML body |
| POST   | `/api/v1/posts`      | USER, EDITOR, ADMIN         | Create a post from a plain-text description and HTML content               |
| PATCH  | `/api/v1/posts/:id`  | Author: USER, EDITOR, ADMIN | Update either editorial field and re-sanitize content when supplied        |
| DELETE | `/api/v1/posts/:id`  | Author or ADMIN             | Existing soft-delete behavior; response includes both fields               |

### 3.3 Key DTOs

Following `docs/02-code-standards.md` and the existing Posts module structure:

- `CreatePostDto`
  - Add required `description`: trimmed, non-empty plain string, maximum 500 characters.
  - Keep required `content`: non-empty HTML string, maximum 100,000 input characters.
  - Add Swagger descriptions and examples that clearly distinguish summary text from HTML body.
- `UpdatePostDto`
  - Add optional `description` with the same validation.
  - Update `content` validation and Swagger metadata for HTML.
  - Treat `description` as a valid field in the existing at-least-one-field rule.
- `PostResponseDto`
  - Add required `description`.
  - Document `content` as sanitized HTML.
- `QueryPostDto`
  - Update search documentation to mention title, description, and article text.

### 3.4 Important business rules

- Sanitize HTML in `PostsService` through a focused, independently testable utility/service before
  passing data to Prisma.
- Reject content that is empty or contains no meaningful visible text after sanitization; an
  article made only of removed tags or images is not valid.
- Persist and return only the sanitized HTML, never the raw submitted HTML.
- Sanitize only when `content` is supplied on update; updating another field must not mutate the
  stored body.
- A changed `description` or `content` follows the existing moderation rule: editing a published
  user post may send it back to `PENDING`.
- Preserve the current ownership, role, publication intent, Place validation, and soft-delete
  behavior.
- The frontend must still render HTML using a deliberate HTML-rendering mechanism; escaping it as
  ordinary text will display the markup rather than the article.

### 3.5 Side effects / Async jobs / Cache invalidation

- No new queue job or cache invalidation is required.
- The generated normalized search column remains database-managed and is automatically updated
  when title, description, or content changes.
- Full HTML bodies make list responses larger, but keeping them in list responses preserves the
  current API contract for this task.

## 4. Impact on the Existing System

- **Database:** `posts` gains a non-null `description`; `posts.search_text` and its GIN trigram
  index are recreated by migration.
- **Dependent modules:** Posts DTOs/service/tests, Prisma client generation, database seed, and
  search documentation are updated. Comments and Reactions continue targeting Post IDs unchanged.
- **Security:** stored user HTML is constrained to a safe allowlist to reduce stored-XSS risk.
- **Client impact:** create requests must add `description`; response consumers receive one new
  field. Existing `content` remains present but now has a documented sanitized-HTML contract.
- **Breaking changes:** POST `/api/v1/posts` will reject old create payloads that omit
  `description`. No endpoint, response field, or existing Post field is removed.

## 5. Open Questions / Needs User Decision

- [x] Confirm that a required plain-text `description` of at most 500 characters is appropriate.
- [x] Confirm that `content` may be up to 100,000 characters and may contain safe `https` images
      but no iframe/video embeds or custom inline styling.
- [x] Confirm whether full HTML should remain in list responses. The current draft preserves it for
      compatibility; a summary-only list would be a separate response-contract change.

Approving this prompt accepts the assumptions above. Use `REQUEST_CHANGES` to choose different
limits, HTML elements, or list-response behavior.

## 6. Acceptance Criteria Checklist

- [x] A migration adds and backfills the non-null `posts.description` column without losing
      existing posts.
- [x] Create and update APIs validate a short plain-text description and accept a complete HTML
      article body.
- [x] Unsafe tags, attributes, and URL schemes are removed before content is persisted.
- [x] Content with no meaningful visible text after sanitization is rejected.
- [x] Every Post response includes `description` and sanitized `content`.
- [x] Post search matches title, description, and visible article text without indexing HTML tag
      names, while preserving case/accent-insensitive behavior.
- [x] Existing moderation, authorization, ownership, pagination, and soft-delete behavior remains
      unchanged.
- [x] The idempotent full SQL seed writes descriptions and realistic HTML article bodies.
- [x] Unit tests cover sanitization, DTO/service behavior, moderation transitions, and response
      mapping.
- [x] E2E tests cover create, update, read, search, unsafe HTML removal, and invalid empty HTML.
- [x] Swagger and `docs/04-database-schema.md` accurately describe the two editorial fields.
- [x] Prisma generation, build, lint, unit tests, and content e2e tests pass.

## 7. Status Log

| Date       | Status      | Notes                                                                                                         |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| 2026-07-28 | DRAFT       | Agent created the first draft after reviewing the required project documents and current Posts implementation |
| 2026-07-28 | APPROVED    | User approved the draft for implementation                                                                    |
| 2026-07-28 | IMPLEMENTED | Added Post descriptions, sanitized HTML content, search/backfill migration, seed data, Swagger, and tests     |

**Files created:**

- `prisma/migrations/20260728040000_post_description_html_content/migration.sql`
- `src/modules/posts/post-content-sanitizer.ts`
- `src/modules/posts/post-content-sanitizer.spec.ts`
- `prompts/010-post-description-html-content.md`

**Files modified:**

- `docs/04-database-schema.md`
- `package.json`
- `package-lock.json`
- `prisma/schema.prisma`
- `prisma/seed-all.sql`
- `src/modules/posts/dto/create-post.dto.ts`
- `src/modules/posts/dto/update-post.dto.ts`
- `src/modules/posts/dto/post-response.dto.ts`
- `src/modules/posts/dto/query-post.dto.ts`
- `src/modules/posts/posts.service.ts`
- `src/modules/posts/posts.service.spec.ts`
- `test/content.e2e-spec.ts`

**Verification:**

- Prisma schema validation and client generation passed.
- ESLint and NestJS production build passed.
- Unit tests: 19 suites, 120 tests passed.
- E2E tests: 4 suites, 36 tests passed.
