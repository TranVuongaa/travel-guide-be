# Database Schema (v1) — Vietnam Travel Guide

The syntax below is close to a Prisma schema so the agent can use it almost directly. Adjust to
TypeORM entities if `01-architecture.md`'s ORM decision changes.

## 1. Identity

```prisma
enum Role {
  USER
  EDITOR
  ADMIN
}

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  displayName   String
  avatarUrl     String?
  role          Role      @default(USER)
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  posts         Post[]
  reviews       Review[]
  comments      Comment[]
  reactions     Reaction[]
  reports       Report[]
  refreshTokens RefreshToken[]

  @@map("users")
}

model RefreshToken {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime @default(now())

  @@map("refresh_tokens")
}
```

## 2. Place

```prisma
model Province {
  id    String  @id @default(uuid())
  name  String  @unique
  slug  String  @unique
  places Place[]
  images EntityImage[]

  @@map("provinces")
}

model Category {
  id    String @id @default(uuid())
  name  String @unique   // Beach, Mountain, Historical site, Food...
  slug  String @unique
  places PlaceCategory[]
  images EntityImage[]

  @@map("categories")
}

model Place {
  id           String    @id @default(uuid())
  name         String
  slug         String    @unique
  description  String    // Plain-text summary
  content      String    // Sanitized HTML destination body
  address      String?
  latitude     Float?
  longitude    Float?
  provinceId   String
  province     Province  @relation(fields: [provinceId], references: [id])
  avgRating    Float     @default(0)
  reviewCount  Int       @default(0)
  status       ContentStatus @default(PUBLISHED)
  createdById  String
  ingestionRunId     String?
  ingestionRun       TravelContentIngestionRun? @relation(fields: [ingestionRunId], references: [id], onDelete: SetNull)
  externalSourceUrl  String?
  externalSourceName String?
  externalUpdatedAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  categories   PlaceCategory[]
  posts        Post[]
  reviews      Review[]
  images       EntityImage[]

  @@index([provinceId])
  @@index([ingestionRunId])
  @@index([externalSourceUrl])
  @@map("places")
}

model PlaceCategory {
  placeId    String
  categoryId String
  place      Place    @relation(fields: [placeId], references: [id], onDelete: Cascade)
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([placeId, categoryId])
  @@map("place_categories")
}
```

### 2.1 Province, Category, and Place images

```prisma
model EntityImage {
  id            String    @id @default(uuid())
  url           String
  sourcePageUrl String
  altText       String
  author        String?
  licenseName   String
  licenseUrl    String?
  width         Int?
  height        Int?
  sortOrder     Int       @default(0)
  provinceId    String?
  province      Province? @relation(fields: [provinceId], references: [id], onDelete: Cascade)
  categoryId    String?
  category      Category? @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  placeId       String?
  place         Place?    @relation(fields: [placeId], references: [id], onDelete: Cascade)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([provinceId, sortOrder])
  @@unique([categoryId, sortOrder])
  @@unique([placeId, sortOrder])
  @@map("entity_images")
}
```

The migration adds a database `CHECK` requiring exactly one owner foreign key per image, positive
dimensions when present, and a non-negative `sortOrder`. These constraints are expressed in SQL
because Prisma schema syntax cannot represent the cross-column ownership rule. This model stores
remote, system-curated image metadata; user-uploaded Post/Review media remains the separate
`Media` domain described in section 7.

## 3. Content (Post)

```prisma
enum ContentStatus {
  DRAFT
  PENDING
  PUBLISHED
  REJECTED
  HIDDEN
}

enum PostSource {
  SYSTEM
  USER
}

model Post {
  id          String        @id @default(uuid())
  authorId    String
  author      User          @relation(fields: [authorId], references: [id])
  placeId     String?
  place       Place?        @relation(fields: [placeId], references: [id])
  title       String
  description String        // Plain-text summary, max 500 characters at DTO level
  content     String        // Sanitized HTML article body
  source      PostSource    @default(USER)
  status      ContentStatus @default(PENDING)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  media       Media[]
  comments    Comment[]
  reactions   Reaction[]

  @@index([placeId])
  @@index([status])
  @@map("posts")
}
```

## 4. Review

```prisma
model Review {
  id        String        @id @default(uuid())
  placeId   String
  place     Place         @relation(fields: [placeId], references: [id])
  authorId  String
  author    User          @relation(fields: [authorId], references: [id])
  rating    Int           // 1..5, validated at the DTO level
  content   String?
  status    ContentStatus @default(PUBLISHED)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  media     Media[]
  comments  Comment[]
  reactions Reaction[]

  @@unique([placeId, authorId])   // 1 review per user per place (can be revisited)
  @@map("reviews")
}
```

## 5. Comment (nested, polymorphic target)

```prisma
enum CommentTargetType {
  POST
  REVIEW
}

model Comment {
  id            String            @id @default(uuid())
  authorId      String
  author        User              @relation(fields: [authorId], references: [id])
  targetType    CommentTargetType
  targetId      String
  parentId      String?
  parent        Comment?          @relation("CommentReplies", fields: [parentId], references: [id])
  replies       Comment[]         @relation("CommentReplies")
  content       String
  status        ContentStatus     @default(PUBLISHED)
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  reactions     Reaction[]
  postRef       Post?             @relation(fields: [targetId], references: [id], map: "comment_post_fk")
  reviewRef     Review?           @relation(fields: [targetId], references: [id], map: "comment_review_fk")

  @@index([targetType, targetId])
  @@map("comments")
}
```

> Note: Prisma doesn't support true polymorphic FKs — the `postRef`/`reviewRef` relation fields
> above are only illustrative of intent; actual implementation should NOT hard-FK `targetId` but
> instead enforce integrity at the Service layer (check the target exists before creating a
> record). Call this out explicitly in the corresponding prompt file when implementing.

## 6. Reaction (polymorphic)

```prisma
enum ReactionTargetType {
  POST
  REVIEW
  COMMENT
}

enum ReactionType {
  LIKE
  LOVE
  WOW
  SAD
  ANGRY
}

model Reaction {
  id         String             @id @default(uuid())
  userId     String
  user       User               @relation(fields: [userId], references: [id])
  targetType ReactionTargetType
  targetId   String
  type       ReactionType
  createdAt  DateTime           @default(now())

  postRef    Post?    @relation(fields: [targetId], references: [id])
  reviewRef  Review?  @relation(fields: [targetId], references: [id])
  commentRef Comment? @relation(fields: [targetId], references: [id])

  @@unique([userId, targetType, targetId])   // one reaction type per user per target
  @@index([targetType, targetId])
  @@map("reactions")
}
```

## 7. Media

```prisma
enum MediaOwnerType {
  POST
  REVIEW
}

model Media {
  id         String         @id @default(uuid())
  url        String
  mimeType   String
  sizeBytes  Int
  ownerType  MediaOwnerType
  postId     String?
  post       Post?          @relation(fields: [postId], references: [id])
  reviewId   String?
  review     Review?        @relation(fields: [reviewId], references: [id])
  createdAt  DateTime       @default(now())

  @@map("media")
}
```

## 8. Report / Moderation

```prisma
enum ReportTargetType {
  POST
  REVIEW
  COMMENT
}

enum ReportReason {
  SPAM
  OFFENSIVE
  MISINFORMATION
  OTHER
}

enum ReportStatus {
  PENDING
  RESOLVED
  DISMISSED
}

model Report {
  id         String           @id @default(uuid())
  reporterId String
  reporter   User             @relation(fields: [reporterId], references: [id])
  targetType ReportTargetType
  targetId   String
  reason     ReportReason
  note       String?
  status     ReportStatus     @default(PENDING)
  createdAt  DateTime         @default(now())
  resolvedAt DateTime?

  @@unique([reporterId, targetType, targetId])
  @@map("reports")
}
```

## 9. General Design Notes

- All `id` fields use UUID (v4), never auto-increment ints, to avoid leaking creation-order
  information.
- `avgRating`/`reviewCount` on `Place` are denormalized columns. Review mutations call a reusable
  database service that recomputes the published, non-deleted aggregate immediately.
- Every table has `createdAt`; tables that support editing also have `updatedAt`.
- Soft delete: consider adding `deletedAt` to `Post`, `Review`, `Comment` instead of hard-deleting
  — decide this explicitly in each module's prompt file at implementation time.

### 9.1 Normalized substring search

The existing `search` query parameters for Users, Provinces, Categories, Places, and Posts use an
internal stored generated column named `search_text`:

| Table        | Source columns included in `search_text`                           |
| ------------ | ------------------------------------------------------------------ |
| `users`      | `email`, `displayName`                                             |
| `provinces`  | `name`, `slug`                                                     |
| `categories` | `name`, `slug`                                                     |
| `places`     | `name`, `description`, `address`, visible text from HTML `content` |
| `posts`      | `title`, `description`, visible text from HTML `content`           |

- Migration `20260728030000_vietnamese_accent_insensitive_search` enables PostgreSQL `unaccent`
  and `pg_trgm`, and defines the schema-qualified immutable `normalize_search_text(text)` helper.
  Migration `20260728040000_post_description_html_content` extends the Post source expression
  with `description` and strips HTML tags from `content` before normalization. Migration
  `20260729020000_place_html_content` applies the same visible-HTML-text behavior to Place
  `content`.
- Normalization lowercases text, removes Vietnamese accents, maps `đ`/`Đ` to `d`/`D`, converts
  punctuation/separators to single spaces, and trims the result.
- Each `search_text` column is `GENERATED ALWAYS ... STORED`, so existing rows are backfilled by
  the migration and later Prisma, OAuth, registration, and seed writes stay synchronized without
  application-side write hooks.
- Each column has a GIN `gin_trgm_ops` index for indexed `%term%`/substring matching.
- Prisma maps generated columns with `@default(dbgenerated())` so create inputs omit them. The
  custom SQL migration remains authoritative for the generated expression because Prisma Schema
  Language does not model PostgreSQL generated-column expressions directly.
- `PrismaService` globally omits these internal fields from result payloads; API response schemas
  remain unchanged.

## 10. Travel content ingestion

Oxylabs-backed travel content ingestion reuses the existing domain models: a destination is a
`Place`, and a reviewable article is a `Post`. It does not introduce duplicate Destination or
Article tables.

```prisma
enum TravelContentIngestionStatus {
  QUEUED
  RUNNING
  COMPLETED
  PARTIAL
  FAILED
}

enum TravelTrendType {
  TOP
  RISING
}

model TravelContentIngestionRun {
  id                   String                       @id @default(uuid())
  requestedById        String
  requestedBy          User                         @relation(fields: [requestedById], references: [id])
  status               TravelContentIngestionStatus @default(QUEUED)
  requestParameters    Json
  trendKeywordCount    Int                          @default(0)
  discoveredUrlCount   Int                          @default(0)
  discoveredPlaceCount Int                          @default(0)
  importedPlaceCount   Int                          @default(0)
  updatedPlaceCount    Int                          @default(0)
  updatedPostCount     Int                          @default(0)
  importedPostCount    Int                          @default(0)
  publishedPostCount   Int                          @default(0)
  duplicateCount       Int                          @default(0)
  skippedCount         Int                          @default(0)
  failedCount          Int                          @default(0)
  attemptCount         Int                          @default(0)
  errorSummary         String?
  leaseExpiresAt       DateTime?
  leaseToken           String?
  startedAt            DateTime?
  completedAt          DateTime?
  createdAt            DateTime                     @default(now())
  places               Place[]
  posts                Post[]
  trendKeywords        TravelTrendKeyword[]

  @@index([status, createdAt])
  @@index([status, leaseExpiresAt, createdAt])
  @@index([requestedById, createdAt])
  @@map("travel_content_ingestion_runs")
}

model TravelTrendKeyword {
  id             String                    @id @default(uuid())
  runId          String
  run            TravelContentIngestionRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  seedKeyword    String
  keyword        String
  trendType      TravelTrendType
  value          Int?
  formattedValue String?
  sourceJobId    String?
  sourceLink     String?
  createdAt      DateTime                  @default(now())

  @@unique([runId, seedKeyword, trendType, keyword])
  @@index([keyword, trendType])
  @@map("travel_trend_keywords")
}
```

`Post` has nullable `ingestionRunId`, unique `externalSourceUrl`, `externalSourceName`, and
`externalPublishedAt` fields for imported-source provenance. An accepted admin-triggered import
is `SYSTEM`/`PUBLISHED`; it links to a unique, confident existing or newly extracted Place match.
The complete third-party page is not mirrored. The importer keeps bounded semantic article HTML,
including safe headings, paragraphs, lists, links, figures, captions, and a limited number of
validated public HTTPS image URLs. It strips page chrome, executable markup, source styles, ads,
trackers, and unsafe URLs, then appends visible attribution and a canonical source link.

When a canonical URL is rediscovered, a materially richer body may refresh an ingestion-origin
`SYSTEM` Post. User-authored, manually created, deleted, and already-richer Posts are not
overwritten. Successful refreshes increment `updatedPostCount`.

`Place` has nullable `ingestionRunId`, `externalSourceUrl`, `externalSourceName`, and
`externalUpdatedAt` provenance fields. A destination is created only after its Province and at
least one Category resolve to existing reference rows. Existing Places are matched by normalized
name within the Province and are enriched conservatively; stronger manually curated fields are
not overwritten. Accepted Places are `PUBLISHED` and become visible through the existing public
Place endpoints without a manual publication step.

The ingestion pipeline combines Google Trends with fixed Vietnamese fallback queries, Google
News results, and evergreen Google Web results scoped to Provinces with the least current Place
coverage. Effective request/import caps are server-configured and stored in
`requestParameters`. All Place/Post writes for one accepted source page use an interactive
transaction.

`travel_content_ingestion_runs` is also the durable work queue. `attemptCount` caps retries;
`leaseExpiresAt` makes interrupted work reclaimable; and `leaseToken` prevents an expired worker
from heartbeating or finalizing a run after another worker has claimed it. The runner polls
PostgreSQL and atomically claims only `QUEUED` rows or expired `RUNNING` rows.

The migration contains a partial unique index allowing only one run with `QUEUED` or `RUNNING`
status. Prisma schema syntax cannot represent that partial expression, so the reviewed SQL
migration is authoritative for the active-run constraint.
