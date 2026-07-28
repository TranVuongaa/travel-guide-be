---
id: 005
title: Posts, Reviews, Comments, and Reactions
status: IMPLEMENTED
module: posts, reviews, comments, reactions
created_at: 2026-07-28
updated_at: 2026-07-28
---

## 1. Original Idea

> implement Posts, Reviews, Comments, Reactions.

## 2. Analysis & Scope

The project currently has Identity, Province, Category, and Place functionality, but no
user-generated content or engagement tables/modules. This task introduces the four connected
MVP domains described in `docs/00-project-overview.md`: Posts attached optionally to Places,
one Review per user per Place, nested polymorphic Comments, and polymorphic Reactions.

**In scope:**

- Add the Prisma enums, models, relations, indexes, uniqueness constraints, soft-delete columns,
  and migration required for Posts, Reviews, Comments, and Reactions.
- Implement complete NestJS module structures for all four domains, following
  `docs/02-code-standards.md` and `docs/05-nestjs-modules.md`.
- Add public, paginated reads for published/non-deleted content and authenticated write APIs.
- Support Post creation, listing, detail, author updates, publication transitions, and soft
  deletion.
- Support one Review per user per Place, rating validation from 1 through 5, author updates, and
  soft deletion.
- Recalculate denormalized `Place.avgRating` and `Place.reviewCount` asynchronously through a
  BullMQ job whenever a Review becomes eligible/ineligible for the public aggregate or its rating
  changes.
- Support nested Comments on Posts or Reviews with direct-reply pagination and service-layer
  polymorphic target validation.
- Support one Reaction per user per Post, Review, or Comment; creating the same reaction is
  idempotent, while submitting another type replaces the existing type.
- Apply ownership, role, publication, moderation, validation, throttling, stable error handling,
  Swagger documentation, response DTOs, service unit tests, and e2e coverage.
- Wire all modules and the rating queue into the current application/configuration and extend
  Docker Compose with Redis for local queue execution.

**Out of scope:**

- Media upload or Post/Review media attachment. `MediaModule` remains a separate feature even
  though the product schema anticipates it.
- Notification creation, delivery, realtime updates, activity feeds, follows, bookmarks, reports,
  moderation queues/dashboards, and admin status-management endpoints.
- Rich text/Markdown rendering, HTML sanitization, hashtags, mentions, link previews, scheduled
  publishing, editing history, or content versioning.
- Reaction-user lists, analytics, trending/ranking algorithms, search infrastructure, Redis read
  caching, and denormalized reaction/comment counters.
- Admin editing another user's text. An admin may soft-delete inappropriate content, while later
  moderation tooling will own reject/hide/restore workflows.
- Restoring soft-deleted content or permanently purging it.

**Assumptions** — approval of this draft confirms these choices:

- `REQUIRE_MODERATION` defaults to `true`. Content submitted for publication by a `USER` becomes
  `PENDING`; content submitted by an `EDITOR` or `ADMIN` becomes `PUBLISHED`. Setting the
  environment value to `false` publishes user submissions immediately.
- A Post author chooses either `DRAFT` or "submit for publication." Clients cannot directly set
  `PENDING`, `PUBLISHED`, `REJECTED`, or `HIDDEN`; the service derives the stored status from the
  requested action, author role, and moderation configuration.
- Reviews and Comments do not have a draft workflow. Their status is derived on create/update
  using the same role/moderation rule.
- Editing published user content sends it back to `PENDING` when moderation is enabled. Editing a
  published Review removes it temporarily from Place rating aggregates until it is published
  again.
- Public APIs expose only `PUBLISHED` and non-deleted records. Authors can use dedicated
  authenticated "mine" endpoints to see their own drafts/pending items; no endpoint leaks another
  user's non-public content.
- Authors may update or remove their own Posts, Reviews, and Comments. An `ADMIN` may remove any
  of them. `EDITOR` has no blanket permission over another user's content.
- Posts, Reviews, and Comments use nullable `deletedAt` soft deletion rather than hard deletion
  or changing moderation status to `HIDDEN`. Deleted Posts/Reviews are excluded from all reads.
  Deleted Comments may be returned only as redacted tombstones when needed to preserve a reply
  thread; their stored text is never returned publicly.
- Comment nesting is multi-level but capped at five levels to prevent abusive/unbounded trees.
  A reply must have the same `targetType` and `targetId` as its parent, and `parentId` is immutable.
- Polymorphic Comment/Reaction `targetId` columns intentionally have no database foreign keys
  because Prisma does not support true polymorphic relations. Services validate target existence,
  publication, and deletion status before writes, exactly as noted in
  `docs/04-database-schema.md`.
- A user can have at most one Reaction per target. Repeating the same type returns the existing
  Reaction; sending a different type updates it. Removing a Reaction is a hard delete because it
  is a reversible user preference, not authored content.
- Reactions and Comments can be created only on published, non-deleted targets. Replies also
  require a non-deleted parent Comment.
- Post titles are trimmed and limited to 200 characters; Post bodies are 1–20,000 characters.
  Review text is optional and limited to 5,000 characters. Comment text is 1–2,000 characters.
- Public list endpoints default to newest first with deterministic `id desc` tie-breaking and use
  the shared pagination defaults (`page=1`, `limit=20`, maximum `100`).
- Place rating updates are eventually consistent. The API commits the Review transaction, queues
  a job keyed by Place ID, and does not calculate the aggregate in the request path.

## 3. Proposed Technical Details

Implementation will follow `docs/02-code-standards.md`: controllers only orchestrate, services
own business rules and Prisma transactions, request properties have matching validation and
Swagger decorators, response shapes use explicit DTOs, domain failures use centralized error
codes/exceptions, and every public service method receives unit coverage.

### 3.1 Entity / Schema changes

Add these enums, based on `docs/04-database-schema.md`:

- `PostSource`: `SYSTEM`, `USER`.
- `CommentTargetType`: `POST`, `REVIEW`.
- `ReactionTargetType`: `POST`, `REVIEW`, `COMMENT`.
- `ReactionType`: `LIKE`, `LOVE`, `WOW`, `SAD`, `ANGRY`.

Add these tables/models:

- `Post`
  - UUID `id`; required `authorId`; optional `placeId`; `title`; `content`; derived `source`;
    `ContentStatus status`; nullable `deletedAt`; `createdAt`; `updatedAt`.
  - Relations to `User` and optional `Place`.
  - Indexes supporting public feeds, author feeds, Place feeds, moderation status, and stable
    creation-time pagination.
- `Review`
  - UUID `id`; required `placeId`; required `authorId`; integer `rating`; optional `content`;
    `ContentStatus status`; nullable `deletedAt`; `createdAt`; `updatedAt`.
  - Relations to `User` and `Place`.
  - Unique constraint on `(placeId, authorId)` so a soft-deleted Review cannot be recreated as a
    second row; creating again returns `REVIEW_DUPLICATE` rather than silently restoring it.
  - Indexes supporting Place/status/date and author/date queries.
- `Comment`
  - UUID `id`; required `authorId`; `targetType`; polymorphic UUID `targetId`; optional
    self-referencing `parentId`; `content`; `ContentStatus status`; nullable `deletedAt`;
    `createdAt`; `updatedAt`.
  - Relation to `User` and a self-relation for parent/replies; no Post/Review foreign-key
    relation is declared for `targetId`.
  - Indexes on target/status/parent/date and author/date.
- `Reaction`
  - UUID `id`; required `userId`; `targetType`; polymorphic UUID `targetId`; `type`; `createdAt`;
    `updatedAt`.
  - Relation to `User`; no Post/Review/Comment foreign-key relation is declared for `targetId`.
  - Unique constraint on `(userId, targetType, targetId)` and index on
    `(targetType, targetId, type)`.

Extend existing models:

- `User`: add `posts`, `reviews`, `comments`, and `reactions` relation collections.
- `Place`: add `posts` and `reviews` relation collections.
- Preserve the existing `ContentStatus` enum and `Place.avgRating`/`Place.reviewCount` columns.
- Create a reviewed SQL migration with explicit table/column mappings in the repository's current
  snake_case convention and appropriate `ON DELETE` behavior for real foreign keys.

Add queue/runtime support:

- Add `@nestjs/bullmq`, `bullmq`, and `ioredis` dependencies.
- Add validated Redis and content-moderation/throttling settings to configuration.
- Register a Place-rating queue plus a Review processor that aggregates only published,
  non-deleted Reviews and atomically updates `Place.avgRating` and `Place.reviewCount`.

### 3.2 API Endpoints

All paths use the existing global `/api/v1` prefix and standard success/error envelope.

#### Posts

| Method   | Path          | Auth/Role                 | Description                                             |
| -------- | ------------- | ------------------------- | ------------------------------------------------------- |
| `GET`    | `/posts`      | Public                    | List published Posts with filters/search/pagination     |
| `GET`    | `/posts/:id`  | Public                    | Get one published Post                                  |
| `GET`    | `/posts/mine` | Authenticated             | List the current user's Posts in any non-deleted status |
| `POST`   | `/posts`      | `USER`, `EDITOR`, `ADMIN` | Create a draft or submit a Post                         |
| `PATCH`  | `/posts/:id`  | Author                    | Update text/Place or change draft/submission intent     |
| `DELETE` | `/posts/:id`  | Author or `ADMIN`         | Soft-delete a Post                                      |

`GET /posts` supports `page`, `limit`, `sortOrder`, optional `placeId`, `authorId`, `source`, and
trimmed `search` across title/content. `GET /posts/mine` additionally supports optional
`status`.

#### Reviews

| Method   | Path                       | Auth/Role                 | Description                                               |
| -------- | -------------------------- | ------------------------- | --------------------------------------------------------- |
| `GET`    | `/places/:placeId/reviews` | Public                    | List published Reviews for a Place                        |
| `GET`    | `/reviews/:id`             | Public                    | Get one published Review                                  |
| `GET`    | `/reviews/mine`            | Authenticated             | List the current user's Reviews in any non-deleted status |
| `POST`   | `/places/:placeId/reviews` | `USER`, `EDITOR`, `ADMIN` | Create the user's single Review for a Place               |
| `PATCH`  | `/reviews/:id`             | Author                    | Update rating and/or text                                 |
| `DELETE` | `/reviews/:id`             | Author or `ADMIN`         | Soft-delete a Review                                      |

Review lists support shared pagination/sort order. `GET /reviews/mine` supports optional `placeId`
and `status`.

#### Comments

| Method   | Path            | Auth/Role                 | Description                                                 |
| -------- | --------------- | ------------------------- | ----------------------------------------------------------- |
| `GET`    | `/comments`     | Public                    | List root Comments or direct replies for a published target |
| `GET`    | `/comments/:id` | Public                    | Get a published Comment or a redacted thread tombstone      |
| `POST`   | `/comments`     | `USER`, `EDITOR`, `ADMIN` | Create a root Comment or reply                              |
| `PATCH`  | `/comments/:id` | Author                    | Update Comment text                                         |
| `DELETE` | `/comments/:id` | Author or `ADMIN`         | Soft-delete a Comment                                       |

`GET /comments` requires `targetType` and `targetId`; optional `parentId` requests that parent's
direct replies. Results are paginated and include `replyCount` plus reaction counts, without
recursively loading an unbounded tree.

#### Reactions

| Method   | Path                 | Auth/Role                 | Description                                         |
| -------- | -------------------- | ------------------------- | --------------------------------------------------- |
| `GET`    | `/reactions/summary` | Public                    | Get counts by Reaction type for a published target  |
| `POST`   | `/reactions`         | `USER`, `EDITOR`, `ADMIN` | Idempotently create or change the caller's Reaction |
| `DELETE` | `/reactions`         | `USER`, `EDITOR`, `ADMIN` | Remove the caller's Reaction from a target          |

Reaction summary and mutation DTOs contain `targetType` and `targetId`; create also contains
`type`. The create response indicates whether the record was created, unchanged, or updated.

Route declaration order will place literal paths such as `/posts/mine`, `/reviews/mine`, and
`/reactions/summary` before parameter routes so Nest does not interpret them as IDs.

### 3.3 Key DTOs

- Posts:
  - `CreatePostDto`: `title`, `content`, optional `placeId`, and `publicationIntent`
    (`DRAFT`/`SUBMIT`).
  - `UpdatePostDto`: optional editable fields plus optional publication intent, with at least one
    field required.
  - `QueryPostDto` and `QueryMyPostDto`: shared pagination plus the filters in section 3.2.
  - `PostResponseDto`: core fields plus safe author and optional Place summaries and reaction/
    comment counts.
- Reviews:
  - `CreateReviewDto`: integer `rating` from 1 through 5 and optional `content`.
  - `UpdateReviewDto`: at least one of `rating` or `content`.
  - `QueryReviewDto` and `QueryMyReviewDto`.
  - `ReviewResponseDto`: core fields plus safe author summary, reaction/comment counts, and no
    sensitive identity fields.
- Comments:
  - `CreateCommentDto`: `targetType`, `targetId`, optional `parentId`, and `content`.
  - `UpdateCommentDto`: required replacement `content`.
  - `QueryCommentDto`: target fields, optional `parentId`, and pagination.
  - `CommentResponseDto`: safe author summary, reply/reaction counts, and redacted content/author
    fields for a deleted tombstone.
- Reactions:
  - `UpsertReactionDto`, `DeleteReactionDto`, and `QueryReactionSummaryDto`.
  - `ReactionResponseDto` and `ReactionSummaryResponseDto`.
- Add reusable safe embedded author DTOs and Swagger success/pagination wrapper DTOs where that
  prevents duplicated or inaccurate API schemas.

### 3.4 Important business rules

- Services derive Post `source` from the authenticated role: `USER` creates `USER` Posts;
  `EDITOR`/`ADMIN` creates `SYSTEM` Posts. Clients cannot spoof authors, sources, statuses, or
  timestamps.
- All optional Place references are validated against a published, non-hidden Place before a
  write. Review creation requires such a Place.
- Ownership checks occur in services using the authenticated user's ID and role, not in
  controllers. Unauthorized ownership access returns `403` without exposing private content.
- Updates and deletes first find a non-deleted record. Repeated delete behaves as not found.
- The Review uniqueness constraint is checked before create and database `P2002` races map to
  `REVIEW_DUPLICATE`.
- Rating aggregation includes only `PUBLISHED` Reviews where `deletedAt` is null. Jobs are
  deduplicated/coalesced by Place ID, retry transient failures with bounded exponential backoff,
  and log IDs/error summaries without content or PII.
- The rating job is queued after successful create/update/delete transactions. Queue failure is
  surfaced as a stable service failure so the API does not report a fully completed operation
  while knowingly leaving the aggregate stale; retry/reconciliation tooling remains future work.
- Comment parent traversal verifies target equality and enforces the five-level maximum. Parent
  cycles cannot be introduced because `parentId` is accepted only on create and always points to
  an existing older Comment.
- Comment and Reaction target checks dispatch by enum to the correct Prisma model and require a
  public, non-deleted target. Unknown enums fail DTO validation; absent/private/deleted targets
  return the corresponding stable not-found error.
- Reaction upsert uses the compound unique key. Concurrent requests cannot create duplicates, and
  a missing delete returns `REACTION_NOT_FOUND`.
- Public Post/Review/Comment responses use safe User projections (`id`, `displayName`,
  `avatarUrl`) and never include email, password hashes, OAuth identities, or tokens.
- Content write routes use a named, configurable throttling policy stricter than the global read
  limit. Review creation and Reaction mutation are covered by the same content policy.
- Add domain error codes/exceptions for missing records, invalid/private targets, ownership,
  duplicate Reviews, maximum Comment depth, parent-target mismatch, and missing Reactions.

### 3.5 Side effects / Async jobs / Cache invalidation

- Review create/update/delete/status eligibility changes enqueue a Place-rating recalculation.
  The worker writes `avgRating=0` and `reviewCount=0` when no eligible Reviews remain.
- Post/Review/Comment writes immediately affect public or author-scoped reads according to their
  derived status and `deletedAt`.
- Reactions immediately affect summary counts.
- No notification job is emitted in this task.
- No read cache exists, so no cache invalidation is required.

## 4. Impact on the Existing System

- **Dependent modules/files:** `AppModule`, application configuration/validation, Prisma schema
  and generated client, Docker Compose, package manifests, shared error codes/exceptions, safe
  auth-user/role handling, Swagger document, and e2e setup.
- **New modules:** `PostsModule`, `ReviewsModule`, `CommentsModule`, and `ReactionsModule`, with
  Review queue processor support.
- **Database tables affected:** new `posts`, `reviews`, `comments`, and `reactions`; existing
  `users` and `places` gain Prisma relations but no new physical relation columns.
- **Existing Place writes:** the rating worker updates existing `places.avg_rating` and
  `places.review_count` columns after Review changes.
- **Runtime infrastructure:** Redis becomes required for the BullMQ rating worker. Local Compose
  receives a Redis service and API dependency/connection settings.
- **API compatibility:** existing Identity, Province, Category, and Place routes and response
  shapes remain unchanged. Place rating values become actively maintained rather than remaining
  at defaults.
- **Breaking changes:** no existing HTTP contract changes. Deployment must apply the migration
  and provide Redis configuration before starting the updated application.

## 5. Open Questions / Needs User Decision

- [x] No blocking questions. Approving this draft confirms the moderation default, role and
      ownership rules, endpoint shapes, soft-delete/tombstone behavior, five-level Comment limit,
      idempotent Reaction upsert, one-Review lifetime constraint, async Redis/BullMQ rating
      aggregation, and explicit out-of-scope items above.

## 6. Acceptance Criteria Checklist

- [x] Prisma validation/client generation and the new SQL migration succeed, with no invalid
      polymorphic foreign keys.
- [x] All endpoints in section 3.2 work with the documented validation, pagination, response,
      visibility, and authorization contracts.
- [x] Public reads return only published/non-deleted content; author feeds return only the
      caller's non-deleted content in requested statuses.
- [x] Post source/status are derived server-side and draft/submission transitions follow role and
      `REQUIRE_MODERATION` configuration.
- [x] Review rating is restricted to integers 1–5 and the database prevents more than one Review
      row per user/Place, including after soft deletion.
- [x] Review changes enqueue a deduplicated rating job; the worker correctly maintains Place
      average/count using only published, non-deleted Reviews and handles the zero-Review case.
- [x] Comments support root/direct-reply pagination, same-target parent validation, five nested
      levels, safe tombstones, and immutable parent/target identity.
- [x] Reaction create is idempotent for the same type, changes the existing type without
      duplication, summaries group counts correctly, and delete removes only the caller's row.
- [x] Author/administrator delete rules and author-only update rules are enforced without leaking
      private content.
- [x] Every request property is validated and documented; controllers contain no business logic
      or direct Prisma/queue access, per `docs/02-code-standards.md`.
- [x] Stable domain errors cover missing targets, duplicate Review, forbidden ownership, invalid
      Comment parent/depth, and missing Reaction without leaking Prisma/Redis internals.
- [x] Unit tests cover every public method in all four services plus the rating processor,
      including transaction, uniqueness-race, polymorphic-target, moderation, ownership,
      soft-delete, queue, and aggregate edge cases.
- [x] E2e tests cover Post CRUD/status visibility, Review uniqueness/rating aggregation,
      nested Comments, Reaction create/change/delete/summary, DTO rejection, and `401`/`403`
      authorization paths using isolated deterministic infrastructure.
- [x] Swagger fully documents every endpoint, DTO, success shape, bearer requirement, and
      important error response.
- [x] Content mutation throttling, Redis configuration validation, Docker Compose wiring, and
      queue retry/backoff behavior are covered and documented.
- [x] Existing lint/build/unit/e2e suites, non-mutating formatting checks, and `git diff --check`
      pass without regressions.
- [x] The implemented prompt status/file log is updated only after all verification succeeds.

## 7. Status Log

| Date       | Status      | Notes                                                                                                                                                           |
| ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-28 | DRAFT       | Agent created the first draft after reviewing docs `00`–`05`, prompt conventions, the current Prisma schema, existing modules/configuration, and test structure |
| 2026-07-28 | APPROVED    | User explicitly approved implementation                                                                                                                         |
| 2026-07-28 | IMPLEMENTED | Posts, Reviews, Comments, Reactions, rating aggregation, Redis/BullMQ wiring, Swagger, unit tests, and e2e tests completed                                      |

### Implementation file log

Created:

- `prisma/migrations/20260728010000_posts_reviews_comments_reactions/migration.sql`
- `src/common/content-targets.module.ts`
- `src/common/dto/content-response.dto.ts`
- `src/common/exceptions/content.exceptions.ts`
- `src/common/services/content-engagement.service.ts`
- `src/common/services/content-engagement.service.spec.ts`
- `src/common/services/content-targets.service.ts`
- `src/common/services/content-targets.service.spec.ts`
- `src/modules/posts/posts.module.ts`
- `src/modules/posts/posts.controller.ts`
- `src/modules/posts/posts.service.ts`
- `src/modules/posts/posts.service.spec.ts`
- `src/modules/posts/dto/create-post.dto.ts`
- `src/modules/posts/dto/update-post.dto.ts`
- `src/modules/posts/dto/query-post.dto.ts`
- `src/modules/posts/dto/post-response.dto.ts`
- `src/modules/posts/interfaces/post-with-relations.interface.ts`
- `src/modules/reviews/reviews.constants.ts`
- `src/modules/reviews/reviews.module.ts`
- `src/modules/reviews/place-reviews.controller.ts`
- `src/modules/reviews/reviews.controller.ts`
- `src/modules/reviews/reviews.service.ts`
- `src/modules/reviews/reviews.service.spec.ts`
- `src/modules/reviews/dto/create-review.dto.ts`
- `src/modules/reviews/dto/update-review.dto.ts`
- `src/modules/reviews/dto/query-review.dto.ts`
- `src/modules/reviews/dto/review-response.dto.ts`
- `src/modules/reviews/interfaces/review-with-relations.interface.ts`
- `src/modules/reviews/processors/place-rating.processor.ts`
- `src/modules/reviews/processors/place-rating.processor.spec.ts`
- `src/modules/comments/comments.module.ts`
- `src/modules/comments/comments.controller.ts`
- `src/modules/comments/comments.service.ts`
- `src/modules/comments/comments.service.spec.ts`
- `src/modules/comments/dto/create-comment.dto.ts`
- `src/modules/comments/dto/update-comment.dto.ts`
- `src/modules/comments/dto/query-comment.dto.ts`
- `src/modules/comments/dto/comment-response.dto.ts`
- `src/modules/comments/interfaces/comment-with-author.interface.ts`
- `src/modules/reactions/reactions.module.ts`
- `src/modules/reactions/reactions.controller.ts`
- `src/modules/reactions/reactions.service.ts`
- `src/modules/reactions/reactions.service.spec.ts`
- `src/modules/reactions/dto/reaction-target.dto.ts`
- `src/modules/reactions/dto/upsert-reaction.dto.ts`
- `src/modules/reactions/dto/reaction-response.dto.ts`
- `test/content.e2e-spec.ts`
- `prompts/005-posts-reviews-comments-reactions.md`

Modified:

- `.env.example`
- `docker-compose.yml`
- `package.json`
- `package-lock.json`
- `prisma/schema.prisma`
- `src/app.module.ts`
- `src/common/constants/error-code.enum.ts`
- `src/config/configuration.ts`
- `src/config/validation.schema.ts`
- `test/setup-env.ts`

Deleted:

- None.

Verification:

- Prisma schema formatting, validation, and client generation pass.
- Strict non-mutating ESLint and Nest production build pass.
- Unit tests: 96 passed across 14 suites.
- E2e tests: 29 passed across 4 suites.
- Prettier formatting and `git diff --check` pass.
- Production dependency audit reports zero vulnerabilities.
- Docker is not installed in the execution environment, so `docker compose config` could not be
  invoked; Prettier successfully parsed the Compose YAML and application config/build tests cover
  the Redis settings.
- The unrelated user-owned `prompts/006-full-database-sql-seed.md` was preserved unchanged and is
  not part of this implementation.
