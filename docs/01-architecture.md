# Architecture — Vietnam Travel Guide Backend

## 1. Architecture Style
**Modular Monolith** organized by NestJS modules, with clear layering and domains split per the
bounded contexts in `00-project-overview.md`. We are not going microservices at this stage — it's
easier to maintain and easier for an AI agent to generate consistent code. `Notification` and
`Media Processing` are the best candidates to split out later (queue/async-heavy) if scaling is
needed.

## 2. Layering Within Each Module
```
request → Middleware → Guard → Interceptor(pre) → Pipe (validate DTO) → Controller
        → Service (business logic) → Repository/ORM → Database
        ← Interceptor(post, transform response) ← Controller ← Exception Filter (on error)
```

Mandatory rules:
- **Controller**: only receives requests and calls the service, NO business logic.
- **Service**: all business logic, transactions, calls to repository/ORM.
- **DTO**: validates input (class-validator) + defines the response shape (if needed, via
  `class-transformer` with `@Exclude`/`@Expose`).
- **Repository** (if used as a separate pattern): extract complex queries out of the service when
  they need to be reused or tested independently. With a simple Prisma setup, calling
  `PrismaService` directly from the service is fine.

## 3. Root Folder Structure
```
src/
├── main.ts
├── app.module.ts
├── config/                     # env-based config, validated with Joi/zod
│   ├── configuration.ts
│   └── validation.schema.ts
├── common/                     # shared across the whole app
│   ├── decorators/              # @CurrentUser(), @Roles(), @Public()
│   ├── filters/                 # HttpExceptionFilter, AllExceptionsFilter
│   ├── guards/                  # JwtAuthGuard, RolesGuard, ThrottlerGuard
│   ├── interceptors/             # TransformResponseInterceptor, LoggingInterceptor
│   ├── middlewares/               # RequestIdMiddleware, LoggerMiddleware
│   ├── pipes/                    # ParseObjectIdPipe (if needed)
│   └── dto/                      # PaginationDto, base response DTO
├── database/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── modules/
│   ├── auth/
│   ├── users/
│   ├── places/
│   ├── categories/
│   ├── posts/
│   ├── reviews/
│   ├── comments/
│   ├── reactions/
│   ├── media/
│   ├── notifications/
│   └── moderation/
└── database/                    # Prisma and PostgreSQL-backed durable work
```

Each submodule follows the conventions in `05-nestjs-modules.md`.

## 4. Technical Decisions (condensed ADRs)

### 4.1 ORM: Prisma
- Type-safe queries, easily reviewable migrations (auto-generated `.sql` files), well suited for
  an AI agent to generate accurate schemas. TypeORM is an acceptable alternative if the team
  prefers a traditional Active Record/Data Mapper style — call this out explicitly in the prompt
  if you want to switch.

### 4.2 Auth
- JWT access token (short TTL, ~15 min) + refresh token (longer TTL, ~7–30 days, hash stored in
  DB, supports rotation & revocation).
- Passport strategies: `JwtStrategy` (access), `JwtRefreshStrategy`.
- Guard: `JwtAuthGuard` (registered app-wide via `APP_GUARD`), with a `@Public()` decorator to
  open up endpoints that don't require auth.
- Authorization: `RolesGuard` + `@Roles(Role.ADMIN, Role.EDITOR)` decorator.

### 4.3 Standardized Response Format
Every response passes through a `TransformResponseInterceptor` to produce a unified shape:
```json
{
  "success": true,
  "data": { },
  "meta": { "timestamp": "...", "requestId": "..." }
}
```
Errors go through an `AllExceptionsFilter`:
```json
{
  "success": false,
  "error": { "code": "PLACE_NOT_FOUND", "message": "...", "details": [] },
  "meta": { "timestamp": "...", "requestId": "..." }
}
```

### 4.4 Polymorphic Reaction & Comment
`Reaction` and `Comment` can attach to multiple entity types (Post, Review, parent Comment).
Use two columns, `targetType` (enum: POST, REVIEW, COMMENT) and `targetId`, instead of separate
join tables per type — simpler code, with a composite index on `(targetType, targetId)`.

### 4.5 Moderation for User-Generated Content
A `user`'s Post/Review defaults to `PENDING` status if `REQUIRE_MODERATION=true` is enabled,
otherwise it's `PUBLISHED` immediately (depending on launch phase). Content from `editor`/`admin`
is always `PUBLISHED` immediately.

### 4.6 Async Jobs
The implemented travel-content ingestion runner uses `travel_content_ingestion_runs` as a
durable PostgreSQL work table. Workers claim rows atomically, heartbeat a lease, retry expired
leases, and cap attempts. Review mutations recalculate the affected Place aggregate directly
through a reusable database service. Future notification/media workers must use an explicitly
approved durable backend; Redis is not a current runtime dependency.

### 4.7 Caching
No application cache is currently configured. PostgreSQL remains authoritative for Place lists
and rating aggregates.

### 4.8 Rate Limiting
`@nestjs/throttler` applied globally, with stricter overrides for sensitive endpoints (login,
creating a review, reporting) to prevent spam.

### 4.9 File Upload
The client requests a **presigned URL** from `MediaModule` → uploads directly to S3/R2 → calls a
confirmation API to persist metadata. The backend never proxies large file uploads.

## 5. Environment & Config
- Use `@nestjs/config` globally, validate with a schema (Joi or zod) at bootstrap time — fail
  fast if any environment variable is missing.
- No hardcoded secrets; all config is read via `ConfigService`.

## 6. API Versioning
- Prefix `/api/v1`. Use NestJS URI Versioning
  (`app.enableVersioning({ type: VersioningType.URI })`) to make it easy to introduce a `v2` later
  without breaking existing clients.

## 7. Observability
- Logging: `nestjs-pino` or Winston, structured JSON logs, with a `requestId` propagated
  end-to-end (middleware generates the `requestId`, interceptors/logs reuse it).
- Health check: `@nestjs/terminus` for PostgreSQL and disk.
