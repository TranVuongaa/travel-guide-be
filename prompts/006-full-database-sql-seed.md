---
id: 006
title: Full database SQL seed with administrator account
status: DRAFT
module: database, identity, places, content
created_at: 2026-07-28
updated_at: 2026-07-28
---

## 1. Original Idea

> cho mình sql tạo data cho toàn bộ table, kể cả 1 user admin, không cần approve

## 2. Analysis & Scope

The current Prisma schema contains eleven application tables. The requested deliverable is one
reviewable PostgreSQL script that creates coherent development data for every one of those tables,
including an active administrator who can log in through the existing password-authentication
flow.

Repository workflow in `docs/03-workflow.md` does not allow the approval checkpoint to be skipped.
This draft therefore remains `DRAFT` until the user explicitly approves it.

**In scope:**

- Add a standalone PostgreSQL seed script at `prisma/seed-all.sql`.
- Seed all current application tables:
  - `users`
  - `refresh_tokens`
  - `oauth_accounts`
  - `provinces`
  - `categories`
  - `places`
  - `place_categories`
  - `posts`
  - `reviews`
  - `comments`
  - `reactions`
- Include one active `ADMIN` account with a known development-only password hashed using Argon2id,
  matching the existing authentication implementation.
- Include supporting editor/user accounts and realistic linked Vietnam travel data so foreign
  keys, unique constraints, polymorphic targets, nested comments, and all enum variants used by
  the sample dataset are valid.
- Keep Place `avgRating` and `reviewCount` consistent with the seeded published, non-deleted
  Reviews.
- Make the script deterministic, transactional, and safe to run repeatedly against a migrated
  development database without creating duplicate seed records.
- Document the development credentials and the exact `psql` execution command in SQL comments.
- Validate the script statically against the current Prisma schema/migrations and, when a local
  PostgreSQL service is available, execute it twice to verify referential integrity and
  idempotency.

**Out of scope:**

- Creating or altering tables, columns, enums, indexes, constraints, or Prisma migrations.
- Replacing the existing `prisma/seed.ts`, its Province/Category reference data, or
  `src/scripts/bootstrap-admin.ts`.
- Automatically running the full SQL seed during application startup, Docker startup, migration
  deployment, or `npm run db:seed`.
- Seeding future tables described only in `docs/04-database-schema.md` but absent from the current
  `prisma/schema.prisma`, such as media, reports, or notifications.
- Production credentials or production-safe account provisioning.
- Deleting, truncating, or resetting existing database data.

**Assumptions** — approval of this draft confirms these choices:

- "Toàn bộ table" means every application table currently declared in `prisma/schema.prisma`; the
  Prisma-owned `_prisma_migrations` table is not application seed data.
- The SQL targets PostgreSQL after all checked-in Prisma migrations have been applied.
- The dataset is intended only for local development/demo/testing. The administrator credential
  is deliberately known and must never be used in production.
- Seed records use fixed UUID strings and reserved `@example.com` / invalid OAuth identifiers so
  repeated runs can target the same rows without affecting unrelated user-created data.
- The administrator login will be `admin@example.com` with password `Admin@123456`. Its checked-in
  `passwordHash` will be a valid Argon2id hash produced with the repository's current default
  Argon2 parameters.
- At least one editor and two normal users will be included so authorship, Reviews, Comments,
  Reactions, and role-derived content examples are meaningful.
- `refresh_tokens` receives an already-revoked and expired synthetic token hash. It covers the
  table without creating an active reusable session credential.
- `oauth_accounts` receives a clearly synthetic provider identity linked to a non-admin sample
  user. It is relational fixture data, not a working third-party login.
- The existing canonical Province/Category seed set remains the source for reference data. The SQL
  may seed the complete current reference arrays and then use a representative subset in Places.
- Polymorphic `comments.targetId` and `reactions.targetId` values will point to real seeded
  Post/Review/Comment IDs even though those columns intentionally have no database foreign keys.
- Idempotency will use deterministic keys plus `INSERT ... ON CONFLICT ...`. Mutable fixture
  fields may be restored to their canonical seeded values on rerun, while unrelated records are
  preserved.
- The entire seed runs inside one transaction with `ON_ERROR_STOP`; a constraint or SQL error
  leaves no partial seed.

## 3. Proposed Technical Details

Implementation will follow the database naming and security rules in
`docs/02-code-standards.md`. The current Prisma schema and checked-in SQL migrations are the source
of truth where they differ from the conceptual schema in `docs/04-database-schema.md`.

### 3.1 Entity / Schema changes

- No entity, Prisma schema, or migration changes.
- Add `prisma/seed-all.sql` containing:
  - an explicit transaction;
  - deterministic fixture IDs;
  - dependency-ordered inserts/upserts;
  - quoted camelCase column names exactly as generated by Prisma;
  - explicit PostgreSQL enum casts where useful;
  - a final aggregate update for seeded Places;
  - optional read-only verification queries/counts;
  - `COMMIT` only after every insert/update succeeds.
- Insert order:
  1. `users`
  2. `refresh_tokens`, `oauth_accounts`
  3. `provinces`, `categories`
  4. `places`
  5. `place_categories`
  6. `posts`, `reviews`
  7. root and reply `comments`
  8. `reactions`
  9. recompute `places.avgRating` and `places.reviewCount` for seeded Places
- Conflict handling will respect:
  - unique User email;
  - unique Province/Category name and slug;
  - unique Place slug;
  - composite `place_categories` primary key;
  - one Review per `(placeId, authorId)`;
  - one Reaction per `(userId, targetType, targetId)`;
  - OAuth provider/account and user/provider uniqueness.

### 3.2 API Endpoints

No API endpoint is added or changed. Seeded records must be consumable through the existing Auth,
Users, Provinces, Categories, Places, Posts, Reviews, Comments, and Reactions APIs.

### 3.3 Key DTOs

No DTO changes.

### 3.4 Important business rules

- The administrator is active, has role `ADMIN`, and has a non-null valid Argon2id password hash.
- No plaintext password is stored in a database column.
- The synthetic refresh token is expired and revoked; its raw token is not stored.
- Posts authored by the admin/editor use `SYSTEM`; normal-user Posts use `USER`.
- Public demo content is `PUBLISHED` and not soft-deleted so it appears through public APIs.
- Review ratings are integers from 1 through 5 and remain unique per author/Place.
- Root/reply Comments share the same target type and target ID, and replies reference an existing
  parent.
- Polymorphic target IDs always reference an existing fixture of the declared target type.
- Place aggregate values include only `PUBLISHED` Reviews whose `deletedAt` is null.
- The SQL never logs or embeds real user data, real OAuth credentials, JWT signing keys, raw
  refresh tokens, or production secrets.

### 3.5 Side effects / Async jobs / Cache invalidation

- Direct SQL bypasses NestJS services and BullMQ. The script therefore recomputes rating
  aggregates itself instead of enqueueing rating jobs.
- No notifications or cache invalidation are emitted.
- Existing non-fixture rows are not deleted. Fixture rows sharing the deterministic seed keys may
  be updated to the canonical development values on rerun.

## 4. Impact on the Existing System

- **New file:** `prisma/seed-all.sql`.
- **Database tables affected when explicitly executed:** all eleven application tables listed in
  section 2.
- **Dependent modules:** existing authentication expects a compatible Argon2id hash; content APIs
  expect valid relations and visibility statuses; Place reads expect correct rating aggregates.
- **Breaking changes:** none. The script is opt-in and does not alter runtime behavior or the
  existing Prisma seed command.
- **Dirty worktree awareness:** prompt `005` and its implementation are currently in progress. The
  seed will follow the resulting checked-in schema without modifying those in-progress files.

## 5. Open Questions / Needs User Decision

- [x] No technical question is blocking. Approval confirms the development credentials, inclusion
      of safe synthetic rows for token/OAuth tables, additive idempotent behavior, and the exact
      current-schema scope described above.
- [ ] Workflow approval is still required. Reply `APPROVE` to change this file to `APPROVED` and
      authorize implementation.

## 6. Acceptance Criteria Checklist

- [ ] `prisma/seed-all.sql` supplies coherent fixture data for every current application table.
- [ ] The seeded `admin@example.com` account is active, has role `ADMIN`, and its Argon2id hash
      verifies against `Admin@123456` through the same Argon2 library/configuration used by the
      application.
- [ ] All real foreign keys, unique constraints, enum values, self-relations, and intended
      polymorphic relationships are valid.
- [ ] Seeded Place rating aggregates match published, non-deleted seeded Reviews.
- [ ] The script is non-destructive, transaction-protected, and repeatable without duplicate
      fixture rows.
- [ ] The SQL contains clear development-only credential and execution warnings.
- [ ] The SQL syntax is checked against the latest Prisma schema and migrations.
- [ ] When PostgreSQL is locally available, two consecutive executions succeed and verification
      queries confirm stable row counts; otherwise the unavailable runtime check is clearly
      reported.
- [ ] Existing lint/build/unit/e2e behavior is unaffected because no application contract changes.
- [ ] `git diff --check` passes for the new file and this prompt.
- [ ] After verification, this prompt's status becomes `IMPLEMENTED` and its Status Log lists all
      created/modified files.

## 7. Status Log

| Date       | Status | Notes |
| ---------- | ------ | ----- |
| 2026-07-28 | DRAFT  | Agent created the draft after reviewing docs `00`–`05`, the current Prisma schema, all checked-in migrations, existing reference seed, administrator bootstrap script, prompt sequence, and dirty worktree |
