---
id: 007
title: Public discovery reads and role-protected mutations
status: IMPLEMENTED
module: auth, provinces, categories, places, posts, reviews, comments, reactions
created_at: 2026-07-28
updated_at: 2026-07-28
---

## 1. Original Idea
> đối với những api get như provinces, categoies, places,.. thì không cần token. Ý tưởng là user k cần login cũng xem được những thông tin này, đối với update, new, delete thì cần token và role

## 2. Analysis & Scope

**In scope:**
- Standardize the authorization policy for public discovery APIs:
  - Guests can call public list/detail `GET` endpoints without an access token.
  - Public Place and user-generated-content reads expose only records that are safe for public
    viewing, primarily `PUBLISHED` and non-deleted records.
- Keep create, update, and delete endpoints protected by the global JWT guard and the roles already
  assigned to each domain.
- Audit the relevant controllers, services, Swagger metadata, and e2e tests; change only gaps found
  against the approved authorization matrix.
- Verify the HTTP behavior: public reads work without `Authorization`, protected writes return
  `401` without a valid token, and authenticated callers with a disallowed role receive `403`.

**Out of scope:**
- Making every endpoint using HTTP `GET` public. User-specific and administrative reads such as
  `/users/me`, `/users`, `/posts/mine`, and `/reviews/mine` remain protected.
- Exposing `DRAFT`, `PENDING`, `REJECTED`, `HIDDEN`, soft-deleted, or private user data to guests.
- Changing role definitions, token format/lifetime, ownership rules, moderation workflow, or
  response payloads.
- Adding new CRUD endpoints or changing database records.

**Assumptions** — filled in by the agent when the idea is unclear; the user can edit this section
directly:
- The phrase “như provinces, categories, places, ...” means all existing discovery-oriented reads
  intended for the public, not all `GET` routes in the application.
- Province and Category writes remain `ADMIN`-only.
- Place creation and update remain available to `EDITOR` and `ADMIN`; Place deletion remains
  `ADMIN`-only.
- Posts, Reviews, Comments, and Reactions keep their current authenticated-role and ownership
  rules; only their already-public read views are accessible to guests.
- A missing token produces `401 Unauthorized`; a valid token with an insufficient role produces
  `403 Forbidden`.
- The current implementation already satisfies most of this requirement. Implementation after
  approval will be an authorization audit and targeted correction, not an unnecessary rewrite.

## 3. Proposed Technical Details

### 3.1 Entity / Schema changes
- No table, column, enum, relation, seed, or Prisma migration changes are required.
- Public visibility continues to use the existing `ContentStatus` rules documented in
  `docs/04-database-schema.md`.

### 3.2 API Endpoints
All paths below are under `/api/v1`.

| Method | Path | Auth/Role | Description |
|---|---|---|---|
| `GET` | `/provinces` | Public | List Provinces |
| `GET` | `/provinces/:id` | Public | Get one Province |
| `POST` | `/provinces` | `ADMIN` | Create a Province |
| `PATCH` | `/provinces/:id` | `ADMIN` | Update a Province |
| `DELETE` | `/provinces/:id` | `ADMIN` | Delete an unused Province |
| `GET` | `/categories` | Public | List Categories |
| `GET` | `/categories/:id` | Public | Get one Category |
| `POST` | `/categories` | `ADMIN` | Create a Category |
| `PATCH` | `/categories/:id` | `ADMIN` | Update a Category |
| `DELETE` | `/categories/:id` | `ADMIN` | Delete a Category |
| `GET` | `/places` | Public | List only published Places |
| `GET` | `/places/:id` | Public | Get one published Place |
| `POST` | `/places` | `EDITOR`, `ADMIN` | Create a Place |
| `PATCH` | `/places/:id` | `EDITOR`, `ADMIN` | Update a Place |
| `DELETE` | `/places/:id` | `ADMIN` | Soft-delete a Place |
| `GET` | `/posts` | Public | List published Posts |
| `GET` | `/posts/:id` | Public | Get one published Post |
| `GET` | `/places/:placeId/reviews` | Public | List published Reviews |
| `GET` | `/reviews/:id` | Public | Get one published Review |
| `GET` | `/comments` | Public | List published Comments for a public target |
| `GET` | `/comments/:id` | Public | Get one published Comment or safe tombstone |
| `GET` | `/reactions/summary` | Public | Get aggregate reactions for a public target |
| Mutations | Posts, Reviews, Comments, Reactions | Authenticated roles plus existing ownership rules | Preserve current create/update/delete authorization |

Protected read routes such as `/posts/mine`, `/reviews/mine`, `/users/me`, and administrator user
queries are explicitly excluded from the public endpoint list.

### 3.3 Key DTOs
- No request or response DTO shape changes are expected.
- Existing query DTO validation, pagination DTOs, response DTOs, and safe user projections remain
  in use according to `docs/02-code-standards.md`.

### 3.4 Important business rules
- The application-wide `JwtAuthGuard` remains the default. Only explicitly public discovery
  handlers use the existing `@Public()` decorator.
- Protected mutations use `@Roles(...)` and `@ApiBearerAuth()`; no controller-local replacement
  guard will be introduced.
- Role rules are checked only after authentication. Ownership restrictions in services remain an
  additional authorization layer for user-generated content.
- Public Place/Post/Review/Comment/Reaction reads must not leak unpublished targets or sensitive
  User fields.
- Swagger must distinguish public routes from bearer-protected routes and document `401`/`403`
  responses where applicable.
- Controller and test changes must follow the existing module layout and all rules in
  `docs/02-code-standards.md`.

### 3.5 Side effects / Async jobs / Cache invalidation
- No new async jobs or cache invalidation behavior is required.
- Existing write-side cache/job behavior, if invoked by an authorized mutation, remains unchanged.

## 4. Impact on the Existing System
- Dependent modules: global Auth guards/decorators, Provinces, Categories, Places, Posts, Reviews,
  Comments, Reactions, Swagger generation, and e2e authorization coverage.
- Database tables affected: none.
- Breaking changes: none expected. The approved behavior preserves existing private GET routes and
  only enforces the intended public/protected boundary.
- Current baseline: the reviewed controllers already mark the listed discovery reads with
  `@Public()` and protect mutations with JWT/roles. Existing e2e tests cover representative
  `200`/`401`/`403` cases; implementation will add or adjust coverage only where the full approved
  matrix has a gap.

## 5. Open Questions / Needs User Decision
- [x] No blocking question. This draft assumes “...” refers to existing public discovery/content
  reads, while account-specific and administrator GET endpoints remain protected.

## 6. Acceptance Criteria Checklist
- [x] All public discovery endpoints in section 3.2 work without an access token.
- [x] Public content endpoints return only public-safe, published/non-deleted data.
- [x] Private/account-specific GET endpoints still return `401` without a valid access token.
- [x] Every create/update/delete endpoint in scope returns `401` without a valid access token.
- [x] A valid token with a disallowed role returns `403`; each allowed role can reach its intended
  controller action.
- [x] Existing ownership rules for Posts, Reviews, and Comments remain enforced.
- [x] Swagger accurately marks bearer-protected routes and documents relevant `401`/`403`
  responses.
- [x] Authorization-focused e2e tests cover public GET, unauthenticated mutation, disallowed role,
  and allowed role behavior for the affected domain groups.
- [x] Unit tests remain passing; no database schema change is introduced.
- [x] `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`, and `git diff --check` pass.
- [x] No breaking changes to existing APIs/features.

## 7. Status Log
| Date | Status | Notes |
|---|---|---|
| 2026-07-28 | DRAFT | Agent created the authorization-policy draft after reviewing docs `00`–`05`, existing prompts, controllers, services, Swagger decorators, and e2e coverage |
| 2026-07-28 | APPROVED | User approved the authorization-policy plan |
| 2026-07-28 | IMPLEMENTED | Authorization audit completed; existing public/protected behavior retained, Places Swagger corrected, and comprehensive authorization e2e coverage added |

Files created/modified:
- `prompts/007-public-read-write-authorization-policy.md`
- `src/modules/places/places.controller.ts`
- `test/auth.e2e-spec.ts`
- `test/content.e2e-spec.ts`
- `test/places.e2e-spec.ts`
- `test/reference-data.e2e-spec.ts`
