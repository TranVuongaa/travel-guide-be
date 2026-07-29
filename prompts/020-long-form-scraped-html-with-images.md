---
id: 020
title: Preserve longer scraped article HTML with safe inline images
status: IMPLEMENTED
module: travel-content-ingestions, posts, places
created_at: 2026-07-29
updated_at: 2026-07-29
---

## 1. Original Idea

> phần scraping data từ oxylabs có nội dung quá ngắn, mình muốn dài hơn và định dạng như kiểu bài gốc html có image

## 2. Analysis & Scope

The current Oxylabs page request asks for Markdown only. `extractArticle()` then:

- removes Markdown images;
- flattens headings, lists, links, figures, and captions into plain paragraphs;
- stops after 8 selected paragraphs or 6,000 visible characters;
- rebuilds the result as one generated `<h2>` followed by `<p>` elements.

The shared sanitizer already supports safe article tags such as headings, lists, links,
`figure`, `figcaption`, and HTTPS `img`, but the ingestion extractor never passes that rich
markup to it. The change therefore belongs primarily in Oxylabs result selection and HTML
extraction, not in the public Posts/Places API.

**In scope:**

- Request both raw HTML and Markdown for each selected Universal scrape, using the same bounded
  page job and the existing conditional rendered fallback.
- Extend the internal scraped-page contract so raw HTML is available for rich-content extraction
  while Markdown remains available for travel relevance, Place matching, and safe fallback.
- Locate the most likely article body instead of retaining the complete source document.
- Preserve a safe semantic subset of the article body: `h2`-`h4`, paragraphs, lists, emphasis,
  block quotes, links, line breaks, horizontal rules, code blocks, figures, captions, and images.
- Remove navigation, headers, footers, sidebars, forms, cookie banners, advertisements, related
  content, scripts, styles, embeds, trackers, and repeated boilerplate.
- Resolve relative article links and image URLs against the final redirected source URL.
- Support common lazy-loaded article images (`src`, `data-src`, and `srcset`) by selecting one
  canonical public HTTPS `src` before sanitization.
- Produce substantially longer imported Post bodies while enforcing server-side HTML,
  visible-text, block-count, and image-count limits.
- Preserve a smaller rich section for a newly extracted Place instead of flattening it to one
  paragraph; do not copy the entire Post body into `Place.content`.
- Keep visible source attribution and the canonical source link at the end of every imported
  Post/Place body.
- When the same `externalSourceUrl` is rediscovered, allow conservative enrichment of an existing
  ingestion-origin `SYSTEM` Post whose stored body is materially shorter than the new result.
- Add an `updatedPostCount` ingestion-run counter so a refresh is observable and final run status
  remains accurate.
- Add migration, Swagger DTO updates, focused unit/e2e tests, and documentation updates.

**Out of scope:**

- Mirroring the complete source page or preserving its CSS, classes, JavaScript, pixel-perfect
  layout, header/footer, comments, related-post widgets, or advertisements.
- Rewriting, summarizing, translating, or generating article content with an LLM.
- Downloading image binaries, copying them to S3/R2, creating `Media`/`EntityImage` rows, image
  transcoding, or claiming ownership/license rights.
- Allowing `data:`, `blob:`, `file:`, protocol-relative, private-network, SVG, or executable image
  URLs.
- Updating user-authored Posts or replacing manually curated Place content.
- Adding or changing public content endpoint paths.
- Frontend article styling; the backend will return semantic sanitized HTML and the frontend
  remains responsible for styling those tags responsively.

**Assumptions** — approval of this DRAFT confirms these defaults:

- “Định dạng như bài gốc HTML” means preserving the useful semantic structure of the source
  article, not storing the full untrusted DOM or the source site's visual styling.
- A Post may contain up to 20,000 visible characters, 40 retained content blocks, 100,000 HTML
  characters, and 8 retained article images.
- A Place may contain up to 10,000 visible characters, 20 retained content blocks, and 3 relevant
  article images.
- Images remain remote hotlinked HTTPS URLs. Each URL must pass public-host safety checks, appear
  inside the selected article body, and not look like a logo, avatar, icon, ad, tracking pixel, or
  duplicate.
- Existing imported Posts are refreshed only when `source = SYSTEM`, `externalSourceUrl` is set,
  and the new sanitized visible body is materially longer. A refresh never changes the original
  author, publication state, source URL/name, or original external publication date.
- Existing manually curated Place content keeps the conservative enrichment protection from
  prompt 019.
- Raw HTML/Markdown output and rendered fallback remain bounded by existing candidate/request caps
  because Oxylabs result volume is billable.

## 3. Proposed Technical Details

### 3.1 Entity / Schema changes

Reference: `docs/04-database-schema.md`.

- Add `updatedPostCount Int @default(0)` to `TravelContentIngestionRun` /
  `travel_content_ingestion_runs`.
- Extend `TravelContentIngestionRunResponseDto` with `updatedPostCount`.
- No change to `Post.content` or `Place.content`; both already store sanitized HTML as PostgreSQL
  text.
- No new image table or relation. Images remain part of the sanitized HTML body.
- Update `docs/04-database-schema.md` to document bounded semantic HTML, remote-image handling, and
  conservative refreshes of short ingestion-origin Posts.

### 3.2 API Endpoints

| Method | Path                                          | Auth/Role        | Description                                                        |
| ------ | --------------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| `POST` | `/api/v1/admin/travel-content-ingestions`     | Bearer + `ADMIN` | Existing trigger now imports longer semantic HTML with safe images |
| `GET`  | `/api/v1/admin/travel-content-ingestions/:id` | Bearer + `ADMIN` | Existing polling response gains `updatedPostCount`                 |
| `GET`  | `/api/v1/admin/travel-content-ingestions`     | Bearer + `ADMIN` | Existing history response gains `updatedPostCount`                 |
| `GET`  | `/api/v1/posts/:id`                           | Public           | Existing response exposes the richer sanitized `content`          |
| `GET`  | `/api/v1/places/:id`                          | Public           | Existing response may expose a richer extracted Place section      |

- Paths, request DTOs, authorization, asynchronous `202`, pagination, and response envelopes stay
  compatible.
- `updatedPostCount` is an additive response field.

### 3.3 Key DTOs and internal contracts

- Extend `ScrapedArticle` to carry:
  - raw HTML when Oxylabs returns a `raw` result;
  - Markdown when Oxylabs returns a `markdown` result;
  - the final redirected URL.
- Extend the Oxylabs result contract with the documented result `type` and group multi-format
  results belonging to the same target page.
- Extend `ExtractedArticle` / destination extraction contracts with bounded sanitized HTML and
  visible-text/image metadata needed for quality checks.
- Add a DOM parsing dependency suitable for server-side HTML traversal (proposed: `cheerio`);
  continue using the existing `sanitize-html` package as the final security boundary.
- Follow `docs/02-code-standards.md` and the existing
  `TravelContentIngestionsModule` structure from `docs/05-nestjs-modules.md`.

### 3.4 Important business rules

1. **Oxylabs result acquisition**
   - Use the official Realtime multi-format form with raw and Markdown results for Universal
     source pages.
   - Match results by their explicit `type`; do not assume array order.
   - Keep the current non-rendered request first. Retry once with `render: "html"` only when the
     raw/Markdown result has no sufficiently useful article body.
   - Do not log or persist raw page HTML or full Oxylabs envelopes.

2. **Article-body selection**
   - Parse raw HTML as untrusted input.
   - Prefer high-confidence containers such as `article`, `[itemprop="articleBody"]`, and useful
     `main` descendants, then score candidates by visible text, headings, paragraph/list density,
     and low link/boilerplate density.
   - Reject login, error, index, navigation-heavy, and low-text candidates.
   - Fall back to the existing Markdown-based safe extraction when raw HTML is absent or no
     trustworthy article container can be selected.

3. **Semantic HTML normalization**
   - Retain content in source order and preserve allowed headings, paragraphs, lists, quotes,
     links, figures, captions, and images.
   - Remove nested page chrome and non-content elements before enforcing bounds.
   - Strip all source `class`, `id`, `style`, event-handler, `srcset`, and unsupported attributes.
   - Normalize outbound links to absolute `http`/`https` URLs; external `_blank` links receive
     `rel="noopener noreferrer"`.
   - Pass the final result through `sanitizeArticleHtml()` before persistence.

4. **Image normalization and safety**
   - Consider images only when they occur inside the chosen article body.
   - Resolve relative `src`, lazy-load attributes, and candidate `srcset` URLs against the final
     source URL; retain one canonical HTTPS `src`.
   - Reject unsafe/private hosts, data URLs, SVGs, known tracking/ad patterns, very small declared
     dimensions, empty sources, and duplicates.
   - Preserve useful `alt`, `title`, `width`, and `height` only after validation; force
     `loading="lazy"`.
   - Preserve an existing surrounding `figure`/`figcaption`; otherwise retain a standalone image.
   - Stop after the approved per-entity image cap.

5. **Length and truncation**
   - Apply limits at complete semantic-block boundaries; never slice through a tag or URL.
   - Stop before the visible-text/block/HTML cap, close the DOM normally, then append attribution.
   - Keep `description` plain text and bounded to the existing 500 characters.
   - Require the existing minimum useful visible text. Images alone never make a page eligible.

6. **Post refresh and deduplication**
   - A new canonical URL still creates at most one Post.
   - For a duplicate canonical URL, inspect only ingestion-origin `SYSTEM` Posts.
   - Update `content` and `description` only when the new sanitized body passes all quality gates
     and is materially richer; otherwise retain the current row and count it as a duplicate.
   - A successful refresh increments `updatedPostCount`, updates the normal `updatedAt`, and counts
     as committed work when finalizing `COMPLETED` / `PARTIAL` / `FAILED`.
   - Do not change `authorId`, `placeId`, `source`, `status`, provenance, or
     `externalPublishedAt` during content-only refresh unless an existing approved matching rule
     independently fills a missing relation.

7. **Place content**
   - Associate HTML sections with their heading and nearby figures so a Place receives only its
     relevant section(s), not the full source article.
   - Preserve existing prompt-019 matching, Province/Category requirements, source attribution,
     and conservative update rules.
   - Never replace stronger manually curated Place content merely because the scraped HTML is
     longer.

### 3.5 Side effects / Async jobs / Cache invalidation

- The existing PostgreSQL-backed runner remains unchanged in architecture.
- Raw and Markdown formats increase response payload size; hard request/import caps and the
  conditional render fallback remain mandatory.
- Effective content/image limits should be recorded in `requestParameters` for run auditing.
- No cache invalidation is required because the application currently has no configured cache.
- No image download jobs or additional durable work tables are introduced.

### 3.6 Tests and verification

- Oxylabs client unit tests:
  - raw + Markdown results in either order;
  - final URL handling;
  - missing one format;
  - non-rendered success;
  - one rendered fallback for insufficient content;
  - no additional fallback after a useful article is found.
- Extractor/sanitizer unit tests:
  - selects the article body and removes page chrome;
  - preserves headings, lists, links, quotes, figures, captions, and source order;
  - resolves relative and lazy-loaded images;
  - rejects unsafe/private/SVG/tracker/ad image URLs;
  - strips scripts, styles, iframes, event handlers, classes, and inline CSS;
  - truncates only at complete block boundaries;
  - enforces visible-text, block, HTML, and image caps;
  - falls back safely to Markdown;
  - extracts a bounded rich Place section.
- Ingestion service unit tests:
  - creates a published SYSTEM Post with rich sanitized HTML;
  - refreshes a materially shorter ingestion-origin Post and increments `updatedPostCount`;
  - does not refresh USER/manual or already-richer content;
  - run finalization treats a Post refresh as committed work;
  - existing duplicate, partial-failure, and Place-protection behavior remains intact.
- E2e/Swagger tests:
  - polling/history exposes `updatedPostCount`;
  - public Post/Place detail responses return sanitized semantic HTML with allowed image markup.
- Verification:
  - dependency install integrity, Prisma format/validate/generate, migration review, lint, build,
    unit tests, e2e tests, and `git diff --check`;
  - one bounded live Oxylabs canary after approval, inspecting only result types/counts and
    sanitized structural metrics;
  - when PostgreSQL is reachable, run one controlled ingestion and verify the stored Post body is
    longer, structured, safely attributed, and contains only approved image URLs.

## 4. Impact on the Existing System

- Dependent modules: `TravelContentIngestionsModule`, `PostsModule`, `PlacesModule`,
  `PrismaModule`, shared article sanitizer, Swagger, and the PostgreSQL runner.
- Existing table changed: `travel_content_ingestion_runs` gains one non-null counter with a
  default.
- Existing tables written: `posts` and `places` may receive richer sanitized HTML; no content
  column type change is required.
- Package dependencies gain a server-side DOM parser.
- Public content responses keep the same shape, but `content` can be considerably larger and can
  contain safe remote images. Frontends should render the existing HTML field with their normal
  sanitized-content component and responsive image CSS.
- Oxylabs payload size and possibly account usage may increase with multi-format output; the
  existing run caps prevent unbounded usage.
- Breaking API changes: none.

## 5. Open Questions / Needs User Decision

- [ ] Confirm the proposed defaults: Post 20,000 visible characters / 40 blocks / 8 images; Place
      10,000 visible characters / 20 blocks / 3 images.
- [ ] Confirm remote image policy: keep validated public HTTPS article-image URLs without
      downloading/copying the files. This depends on the source continuing to serve and permit
      hotlinking.
- [ ] Confirm conservative refresh of existing short ingestion-origin SYSTEM Posts when their URL
      is rediscovered.

Reply `APPROVE` to approve these defaults and the plan, `REQUEST_CHANGES` with adjustments, or
`REJECT`.

## 6. Acceptance Criteria Checklist

- [x] Universal page scraping returns usable raw HTML plus Markdown without relying on result
      order.
- [x] Imported Post content is materially longer and retains safe semantic article structure.
- [x] Allowed article images are absolute public HTTPS URLs, lazy-loaded, bounded, deduplicated,
      and preserved in sanitized HTML.
- [x] Navigation, ads, trackers, executable HTML, unsafe URLs, classes, and source CSS are absent
      from stored content.
- [x] Content and images respect all approved limits without cutting malformed HTML.
- [x] Every imported/refreshed body contains visible source attribution and a canonical link.
- [x] Relevant Place content is richer without duplicating the whole article or overwriting
      stronger curated content.
- [x] Eligible existing short SYSTEM Posts can be enriched safely and increment
      `updatedPostCount`; user/manual/already-richer Posts are unchanged.
- [x] Public endpoint paths and existing response fields remain backward compatible.
- [x] Input/runtime validation, Swagger, tests, and implementation comply with
      `docs/02-code-standards.md`.
- [x] Prisma validation, migration review, lint, build, unit/e2e tests, and `git diff --check`
      pass.
- [ ] A controlled live verification passes when Oxylabs credentials and PostgreSQL are
      reachable. The bounded Oxylabs canary passed, but the configured PostgreSQL service at
      `localhost:5433` is currently unreachable, so no live migration or persistence write was
      attempted.

## 7. Status Log

| Date       | Status | Notes                                                                                         |
| ---------- | ------ | --------------------------------------------------------------------------------------------- |
| 2026-07-29 | DRAFT  | Inspected the current Oxylabs Markdown path, extractor limits, sanitizer, schema, and prompt 019; drafted longer semantic HTML, safe image, and conservative Post-refresh behavior |
| 2026-07-29 | APPROVED | User approved the proposed defaults and implementation scope |
| 2026-07-29 | IMPLEMENTED | Added raw HTML + Markdown scraping, bounded semantic HTML/image extraction, conservative Post refresh, `updatedPostCount`, migration/docs/tests, and completed all automated verification. A live Oxylabs canary passed; live PostgreSQL persistence remains unavailable at `localhost:5433`. |

## 8. Implementation Result

- Added `cheerio` for server-side untrusted DOM traversal and kept `sanitize-html` as the final
  persistence boundary.
- Universal page requests now retrieve raw HTML and Markdown together, match explicit result
  types without relying on order, and conditionally retry with JavaScript rendering.
- Added article-body selection, source-order semantic block retention, absolute link/image
  normalization, DNS/public-host image validation, lazy loading, deduplication, and approved
  content/image limits.
- Added rich destination-section extraction without copying the complete Post into
  `Place.content`.
- Added conservative refresh of short ingestion-origin SYSTEM Posts and the additive
  `updatedPostCount` database/API counter.
- Added migration `20260729040000_long_form_scraped_html` and updated the Prisma schema, Swagger
  DTO, database documentation, and ingestion request audit parameters.
- Files created/modified:
  - `docs/04-database-schema.md`
  - `package.json`
  - `package-lock.json`
  - `prisma/schema.prisma`
  - `prisma/migrations/20260729040000_long_form_scraped_html/migration.sql`
  - `src/common/utils/article-html-sanitizer.ts`
  - `src/common/utils/article-html-sanitizer.spec.ts`
  - `src/modules/travel-content-ingestions/dto/travel-content-ingestion-response.dto.ts`
  - `src/modules/travel-content-ingestions/interfaces/travel-content.interface.ts`
  - `src/modules/travel-content-ingestions/oxylabs.client.ts`
  - `src/modules/travel-content-ingestions/oxylabs.client.spec.ts`
  - `src/modules/travel-content-ingestions/travel-content-ingestions.constants.ts`
  - `src/modules/travel-content-ingestions/travel-content-ingestions.service.ts`
  - `src/modules/travel-content-ingestions/travel-content-ingestions.service.spec.ts`
  - `src/modules/travel-content-ingestions/travel-content.extractor.ts`
  - `src/modules/travel-content-ingestions/travel-content.extractor.spec.ts`
  - `test/auth.e2e-spec.ts`
- Verification passed:
  - Prisma format, validate, and generate.
  - ESLint and Nest build.
  - 157 unit tests across 27 suites.
  - 45 e2e tests across 4 suites.
  - Production dependency audit: 0 known vulnerabilities.
  - `git diff --check`.
  - One bounded live Oxylabs canary: 88,018 raw HTML characters and 15,573 Markdown characters
    produced 9,676 characters of sanitized HTML containing 35 semantic blocks and 5 safe images.
