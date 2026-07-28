---
id: 003
title: Auth and Users with JWT refresh-token rotation
status: IMPLEMENTED
module: auth, users
created_at: 2026-07-28
updated_at: 2026-07-28
---

## 1. Original Idea

> implement auth + users
>
> thêm Google + AppleOAuth vào prompt 003

## 2. Analysis & Scope

This task implements the Identity domain described in `docs/00-project-overview.md`: local
email/password accounts, Google and Apple social login, access and refresh JWTs, refresh-token
rotation/revocation, authenticated profiles, and basic admin user management. It also replaces the
temporary fail-closed `AuthenticationGuard` with real Passport JWT authentication, which makes the
existing protected Places write endpoints usable by `EDITOR` and `ADMIN` accounts.

**In scope:**

- Add the documented `Role`, `User`, and `RefreshToken` Prisma definitions and a migration.
- Connect `Place.createdById` to `User.id` while preserving any existing Place creator references.
- Add validated environment configuration for access/refresh JWT secrets, issuer, audience, token
  lifetimes, password hashing, Google/Apple OAuth credentials, and CORS/auth rate-limit settings
  needed by this feature.
- Implement public registration and login with normalized email addresses and Argon2id password
  hashing.
- Implement Google login using Authorization Code Flow with PKCE and Apple login using Apple's
  single-use authorization code plus client-secret JWT; both use server-side code exchange and
  verification of the returned OpenID Connect identity token.
- Support explicit linking/unlinking of Google and Apple identities to an authenticated user
  without automatically merging accounts solely because their email strings match.
- Issue a short-lived access token and a long-lived refresh token with separate secrets and token
  types.
- Store only a hash of each refresh token, rotate it on every successful refresh, and support
  per-session logout plus logout from all sessions.
- Implement a global Passport access-token guard that respects `@Public()`, a route-level refresh
  guard, access/refresh strategies, typed `AuthUser`, and role-based authorization.
- Implement authenticated profile read/update and password change.
- Implement paginated admin user listing/detail, role changes, and activation/deactivation.
- Add an idempotent, explicit admin bootstrap command that reads credentials from environment
  variables and never ships default credentials.
- Update the existing Places authorization decorators/types so create/update/remove use the real
  authenticated user and Prisma `Role` enum.
- Add complete Swagger documentation, domain error codes/exceptions, service unit tests, and HTTP
  e2e coverage for the main auth and authorization flows.

**Out of scope:**

- Email verification for local password accounts, passwordless login, MFA, enterprise SSO,
  CAPTCHA, and device fingerprinting.
- Facebook, Zalo, X, GitHub, Microsoft, or any OAuth/social provider other than Google and Apple.
- Forgot-password/reset-password and email-change workflows because they require an email delivery
  provider and verification tokens.
- User deletion, public user profiles, following, bookmarks, notification preferences, or avatar
  file upload. A profile may only store an already-hosted optional `avatarUrl`.
- Cookie-based sessions. This task uses bearer access tokens and a refresh token in the validated
  request body so web and mobile clients can use the same API contract.
- Requesting or storing Google/Apple permissions beyond basic identity (`openid`, email, and
  profile/name). Provider access/refresh tokens are not persisted or used to call unrelated
  provider APIs.
- Redis-backed token deny lists or distributed session storage. Access-token invalidation is
  enforced by loading the current user on every authenticated request.
- Province/Category CRUD or any content module beyond enabling existing Places write routes.
- Automatically pushing or deploying the migration to EC2.

**Assumptions** — approval of this draft confirms these choices:

- Registration is open to the public and always creates an active `USER`; clients cannot choose
  `role` or `isActive`.
- Emails are trimmed and lowercased before storage and comparison. Email addresses cannot be
  changed in this task.
- Passwords must be 8–128 characters and are hashed with Argon2id. Passwords and all tokens are
  excluded from responses and logs.
- A user created through Google/Apple may have no local password. `passwordHash` is nullable, and
  password login for that account is unavailable until a separate password-setup capability is
  added in a future prompt.
- Access tokens default to 15 minutes and refresh tokens default to 30 days; both durations are
  environment-configurable.
- Auth responses return `{ user, accessToken, refreshToken, accessTokenExpiresIn }` inside the
  existing standard response envelope.
- Refresh and per-session logout accept `{ refreshToken }` in the JSON body. The refresh JWT has a
  token-type claim and is accepted only by the refresh strategy; an access token cannot be used in
  its place.
- Google clients obtain a one-time authorization code using Authorization Code Flow with PKCE; the
  backend receives the code, redirect URI, and verifier. Apple clients provide Apple's one-time
  authorization code and, for web flows, the exact redirect URI used in the request; native flows
  omit the redirect URI when none was sent to Apple. The backend authenticates itself with a
  short-lived client-secret JWT because Apple's official token-validation endpoint does not accept
  a PKCE verifier. Both flows verify issuer, audience, signature, expiry, subject, and verified
  email before issuing this API's own JWT pair.
- Only an email marked verified by Google/Apple is accepted. Apple private-relay email addresses
  are valid account emails; the implementation does not attempt to discover the user's real email.
- A new provider subject creates a new active `USER` only when no local user already owns the
  provider's normalized verified email. If that email already exists without the same provider
  link, social login returns `ACCOUNT_LINK_REQUIRED`; the user must authenticate to the existing
  account and explicitly link the provider.
- An authenticated user may link at most one identity per provider, and one provider identity may
  belong to only one user. Unlinking is rejected when it would leave the account with neither a
  password nor another linked provider.
- Google/Apple authorization codes, ID tokens, access tokens, refresh tokens, and Apple client
  secrets are never logged or stored. Only provider name, immutable provider subject, provider
  email, and timestamps are persisted.
- Apple may provide the person's name only during the first authorization. The backend uses that
  name when supplied by the verified initial flow; otherwise it derives a safe display name from
  the verified email and lets the user edit it later.
- A user may have multiple active sessions. Refresh rotates only the presented session, logout
  revokes only that session, and logout-all revokes all active refresh tokens for the current user.
- Reusing an expired, revoked, malformed, or already-rotated refresh token returns
  `INVALID_REFRESH_TOKEN`; it does not revoke unrelated sessions.
- The JWT strategies load the user from PostgreSQL for every request. Deactivation and role
  changes therefore take effect immediately even if a previously issued access token has not
  expired.
- `PATCH /users/me` allows only `displayName` and `avatarUrl`. Password changes use a separate
  endpoint, require the current password, and revoke every existing refresh session after success.
- Admins cannot deactivate themselves or remove their own `ADMIN` role. Hard deletion is not
  supported.
- Because the configured deployed PostgreSQL database was unreachable during planning, the
  migration must safely handle existing `places.createdById` values. For each creator UUID without
  a matching user, it will create an inactive legacy `EDITOR` placeholder with no password and a
  deterministic internal email before adding the foreign key. These records can later be reviewed
  by an admin.
- The admin bootstrap command is manual and idempotent. It requires `ADMIN_EMAIL`,
  `ADMIN_PASSWORD`, and `ADMIN_DISPLAY_NAME`; it creates or promotes that account to active
  `ADMIN` without printing the password.

## 3. Proposed Technical Details

The implementation will follow `docs/02-code-standards.md` and `docs/05-nestjs-modules.md`:
controllers only orchestrate, services own business logic and transactions, request/response DTOs
are separate from Prisma records, domain exceptions use centralized error codes, and every
endpoint is fully documented in Swagger.

### 3.1 Entity / Schema changes

- Add the `Role` enum from `docs/04-database-schema.md`:
  - `USER`
  - `EDITOR`
  - `ADMIN`
- Add `OAuthProvider`:
  - `GOOGLE`
  - `APPLE`
- Add `User`:
  - UUID `id`, unique normalized `email`, nullable `passwordHash`, `displayName`, optional
    `avatarUrl`.
  - `role` defaults to `USER`; `isActive` defaults to `true`.
  - `createdAt` and `updatedAt`.
  - Relations to refresh tokens, OAuth accounts, and Places created by the user. Relations for
    Posts, Reviews, Comments, Reactions, and Reports remain for their future module migrations
    rather than adding nonexistent models now.
- Add `OAuthAccount`:
  - UUID `id`, `userId`, `provider`, immutable `providerAccountId` from the provider's OIDC `sub`
    claim, `providerEmail`, `createdAt`, and `updatedAt`.
  - Cascading user relation.
  - Unique `(provider, providerAccountId)` to prevent one social identity from belonging to
    multiple users.
  - Unique `(userId, provider)` to allow at most one linked identity per provider for a user.
- Add `RefreshToken`:
  - UUID `id`, used as the refresh JWT ID (`jti`).
  - `userId` with cascading deletion, `tokenHash`, `expiresAt`, optional `revokedAt`, and
    `createdAt`.
  - Indexes supporting active-session lookup and expiry cleanup.
- Add `Place.createdBy` relation and a foreign key from the existing non-null `createdById` column
  to `users.id`, using restrictive deletion so audit ownership is not silently lost.
- Before the foreign key is added, migrate orphan creator IDs to inactive legacy editor records as
  described in the assumptions. No existing Place row is deleted or reassigned.
- Add a separate checked-in migration; do not rewrite the already-applied Places migration.

### 3.2 API Endpoints

All routes use the existing global `/api/v1` prefix and standard response/error envelopes.

| Method   | Path                        | Auth/Role                      | Description                                                               |
| -------- | --------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `POST`   | `/auth/register`            | Public, throttled              | Register a `USER` and return an access/refresh token pair                 |
| `POST`   | `/auth/login`               | Public, throttled              | Authenticate an active user and create a refresh session                  |
| `POST`   | `/auth/oauth/google`        | Public, throttled              | Exchange a Google authorization code and authenticate the linked identity |
| `POST`   | `/auth/oauth/apple`         | Public, throttled              | Exchange an Apple authorization code and authenticate the linked identity |
| `POST`   | `/auth/refresh`             | Valid refresh token, throttled | Atomically rotate the refresh token and issue a new token pair            |
| `POST`   | `/auth/logout`              | Valid refresh token            | Revoke the presented refresh session                                      |
| `POST`   | `/auth/logout-all`          | Access token                   | Revoke all active refresh sessions for the current user                   |
| `GET`    | `/users/me`                 | Access token                   | Return the current user's safe profile                                    |
| `PATCH`  | `/users/me`                 | Access token                   | Update `displayName` and/or `avatarUrl`                                   |
| `PATCH`  | `/users/me/password`        | Access token, throttled        | Verify current password, set a new password, revoke all sessions          |
| `POST`   | `/users/me/oauth/google`    | Access token, throttled        | Verify and link a Google identity to the current user                     |
| `POST`   | `/users/me/oauth/apple`     | Access token, throttled        | Verify and link an Apple identity to the current user                     |
| `DELETE` | `/users/me/oauth/:provider` | Access token                   | Unlink Google/Apple when another login method remains                     |
| `GET`    | `/users`                    | `ADMIN`                        | List users with pagination, search, role/status filters, and sorting      |
| `GET`    | `/users/:id`                | `ADMIN`                        | Return one safe user profile by UUID                                      |
| `PATCH`  | `/users/:id/role`           | `ADMIN`                        | Change a user's role with self-demotion protection                        |
| `PATCH`  | `/users/:id/status`         | `ADMIN`                        | Activate/deactivate a user with self-deactivation protection              |

Existing Places write authorization becomes effective:

| Method   | Path          | Auth/Role         | Description                                                  |
| -------- | ------------- | ----------------- | ------------------------------------------------------------ |
| `POST`   | `/places`     | `EDITOR`, `ADMIN` | Create a Place using the authenticated user as `createdById` |
| `PATCH`  | `/places/:id` | `EDITOR`, `ADMIN` | Update a Place                                               |
| `DELETE` | `/places/:id` | `ADMIN`           | Soft-remove a Place                                          |

### 3.3 Key DTOs

- Auth request DTOs:
  - `RegisterDto`: email, password, display name.
  - `LoginDto`: email and password.
  - `RefreshTokenDto`: refresh token.
  - Provider-specific OAuth DTOs: Google contains authorization code, redirect URI, and PKCE
    verifier; Apple contains authorization code, optional web redirect URI, and optional
    first-authorization name fields.
- Auth response DTOs:
  - Safe user data plus access/refresh tokens and access-token lifetime.
  - No password hash, refresh-token hash, or internal secret fields.
- User DTOs:
  - `UpdateProfileDto`, `ChangePasswordDto`, `QueryUserDto`, `UpdateUserRoleDto`, and
    `UpdateUserStatusDto`.
  - `UserResponseDto`, safe linked-provider summaries, and paginated Swagger response DTOs.
- OAuth provider interfaces:
  - A common verified identity shape containing provider, immutable subject, normalized verified
    email, and optional display name/avatar metadata.
  - Provider adapters isolate Google/Apple token exchange and identity validation from
    `AuthService` business logic.
- JWT payload/interfaces:
  - Access payload identifies subject, token type, issuer/audience, and role claim.
  - Refresh payload additionally identifies the refresh-token record through `jti`.
- Existing `AuthUser` becomes strongly typed with Prisma `Role` and the safe identity fields
  required by controllers.

### 3.4 Important business rules

- Registration checks normalized email uniqueness and maps the database unique constraint to
  `EMAIL_ALREADY_REGISTERED`, including concurrent requests.
- Login uses one generic `INVALID_CREDENTIALS` response for unknown email and incorrect password
  to avoid account enumeration. A social-only user with no password receives the same generic
  response. Inactive accounts return `ACCOUNT_INACTIVE` only after credentials are successfully
  verified.
- Password comparison and refresh-token comparison use Argon2 verification; raw values are never
  persisted.
- Google uses one-time authorization-code exchange with PKCE. Apple uses its documented one-time
  authorization-code validation with a short-lived ES256 client-secret JWT. Both adapters then
  verify the returned OIDC identity token against provider discovery/JWKS data and configured
  allowed client IDs. The backend rejects unverified email, invalid issuer/audience/signature,
  expired tokens, mismatched subjects, and provider/token-type confusion.
- Social login looks up the immutable `(provider, providerAccountId)` first. It never identifies an
  existing link by mutable email alone.
- If a verified provider email matches an existing user but no matching link exists, the backend
  returns `ACCOUNT_LINK_REQUIRED` without revealing additional account details. Linking requires
  that user to authenticate with an existing method first.
- Linking runs transactionally and maps unique-constraint races to a stable
  `OAUTH_ACCOUNT_CONFLICT` error. Linking never changes the user's role or active status.
- Unlinking verifies that a local password or a different OAuth provider remains, preventing an
  account from losing every login method.
- Provider access and refresh tokens are discarded immediately after identity validation. Provider
  logout/revocation and access to Google/Apple APIs are not part of this feature.
- Token signing uses distinct access and refresh secrets, explicit token-type claims, issuer,
  audience, expiration, and refresh `jti`.
- Refresh rotation runs in a Prisma transaction. It verifies ownership/hash/expiry/revocation,
  conditionally revokes the old row, creates the replacement row, and returns tokens only if the
  old row was consumed exactly once.
- JWT validation rejects a missing user and an inactive user. Current role is read from the
  database rather than trusted solely from a stale token claim.
- Role failures produce a standardized domain-specific `FORBIDDEN` response rather than a silent
  boolean guard failure.
- User list search matches normalized email and display name case-insensitively and uses the shared
  pagination contract.
- Profile and admin responses are explicitly mapped and never serialize Prisma `passwordHash` or
  refresh-token relations. They may expose only safe provider names, never provider subjects or
  provider tokens.
- Password changes require a different new password and revoke all refresh tokens atomically with
  the password update. The current access token remains valid only until its short expiry, while
  every subsequent guarded request still checks that the account is active.
- Deactivating a user also revokes all their active refresh tokens in the same transaction.
- The admin bootstrap command hashes its supplied password, is safe to rerun, and never creates
  predictable credentials.

Planned centralized error codes include:

- `EMAIL_ALREADY_REGISTERED`
- `INVALID_CREDENTIALS`
- `INVALID_ACCESS_TOKEN`
- `INVALID_REFRESH_TOKEN`
- `ACCOUNT_INACTIVE`
- `USER_NOT_FOUND`
- `CURRENT_PASSWORD_INCORRECT`
- `PASSWORD_UNCHANGED`
- `SELF_ROLE_CHANGE_FORBIDDEN`
- `SELF_DEACTIVATION_FORBIDDEN`
- `FORBIDDEN`
- `OAUTH_PROVIDER_ERROR`
- `OAUTH_EMAIL_REQUIRED`
- `OAUTH_ACCOUNT_CONFLICT`
- `ACCOUNT_LINK_REQUIRED`
- `LAST_LOGIN_METHOD_REQUIRED`

### 3.5 Side effects / Async jobs / Cache invalidation

- Registration, login, and refresh create refresh-token rows.
- Successful first-time Google/Apple login creates a user plus OAuth-account link; later social
  logins reuse that immutable link. Explicit linking/unlinking creates or removes only the
  OAuth-account link.
- Refresh and logout revoke refresh-token rows; logout-all, password change, and deactivation revoke
  multiple active rows.
- Expired refresh-token cleanup is not scheduled in this task; indexed expired rows may be removed
  later by a maintenance job without changing API behavior.
- No Redis cache or BullMQ job is introduced.
- Auth and OAuth exchange/link endpoints receive stricter throttling through
  `@nestjs/throttler`.

## 4. Impact on the Existing System

- **Dependent modules:** root `AppModule`, global guards, shared decorators/interfaces/error codes,
  application configuration, Prisma schema/client, Places controller/schema relation, Swagger,
  and test setup.
- **Database tables affected:** new `users`, `oauth_accounts`, and `refresh_tokens`; existing
  `places` gains a foreign key relation through its existing `createdById`.
- **Dependencies to add:** Nest config/JWT/Passport/throttler packages, Passport JWT, Argon2, and a
  configuration validation library plus a maintained OIDC/JWK verification client with matching
  TypeScript types where required.
- **Environment contract:** add documented access/refresh secrets, token lifetimes,
  issuer/audience, Google client IDs/secret, Apple client/service identifiers, Apple team/key
  identifiers and private key, allowed OAuth redirect URIs, auth throttle settings, allowed CORS
  origins, and optional admin bootstrap variables to `.env.example`; never commit real values.
- **Behavioral change:** all non-`@Public()` routes become protected by real bearer JWT validation.
  Existing Places write routes change from unconditional `401` to working role-protected routes.
- **Migration risk:** the current deployed database could not be inspected from this environment.
  The migration therefore includes legacy creator preservation and must be reviewed before
  production deployment. Implementation does not authorize pushing or deploying it.
- **API compatibility:** public Places reads and their response shapes remain unchanged.

## 5. Open Questions / Needs User Decision

- [x] No blocking questions. Approving this draft confirms all assumptions in section 2,
      particularly body-based refresh tokens, multiple sessions, the Users admin endpoint scope, the
      manual admin bootstrap command, inactive legacy creator placeholders before the Place ownership
      foreign key is added, provider-supported Authorization Code flows (PKCE for Google and
      client-secret JWT for Apple), explicit account linking on email conflicts, and the rule that
      provider tokens are not retained.

## 6. Acceptance Criteria Checklist

- [ ] Prisma schema validates/generates and the new migration applies cleanly to an empty test
      database without modifying the original Places migration.
- [x] Existing orphan Place creator IDs are preserved as inactive legacy users before the new
      foreign key is enforced.
- [x] Registration, login, refresh rotation, per-session logout, and logout-all work as specified.
- [x] Google authorization codes are exchanged server-side with PKCE and Apple codes with the
      documented client-secret JWT flow; returned identities are fully validated before local JWTs are
      issued.
- [x] First-time social login creates a `USER`, repeated login uses the immutable provider subject,
      and a matching existing email requires explicit authenticated linking.
- [x] Google/Apple linking enforces one identity per provider and unlinking cannot remove the last
      available login method.
- [x] OAuth provider credentials/tokens are never persisted or logged, and provider failures map to
      stable non-sensitive domain errors.
- [x] Passwords and refresh tokens are hashed; secrets, hashes, and raw passwords never appear in
      API responses or logs.
- [x] Expired, malformed, wrong-type, revoked, and reused refresh tokens are rejected.
- [x] Inactive/missing users cannot authenticate; role and activation changes take effect on the
      next guarded request.
- [x] Profile read/update and password change work with the approved fields and security rules.
- [x] Admin list/detail/role/status APIs enforce `ADMIN` authorization and self-protection rules.
- [x] Existing Places public APIs remain unchanged and Places writes work for the approved roles.
- [x] All request input is validated and all response DTOs are documented per
      `docs/02-code-standards.md`.
- [x] Auth endpoints have stricter rate limits and configuration fails fast when required JWT
      settings are missing or unsafe.
- [x] Unit tests cover every public method of `AuthService` and `UsersService`, including important
      security/error paths.
- [x] E2e tests cover register → authenticated profile, login failure, refresh rotation/reuse,
      logout, Google/Apple social login, account-link conflicts, link/unlink protection, role denial,
      admin management, and an authorized Places write boundary. Provider calls/keys are deterministic
      test doubles; tests do not depend on live Google/Apple services.
- [x] Swagger fully documents all new endpoints, auth schemes, DTOs, and expected errors.
- [x] Admin bootstrap is explicit, idempotent, environment-driven, and does not expose credentials.
- [x] `npm run build`, non-mutating lint, unit tests, e2e tests, Prisma validation, and Prisma client
      generation all pass.
- [x] No breaking change is introduced to existing public APIs.

## 7. Status Log

| Date       | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-28 | DRAFT       | Agent created the Auth/Users plan after reviewing docs `00`–`05`, existing Places authorization, Prisma schema, shared guards, and current tests                                                                                                                                                                                                                                                                                                                   |
| 2026-07-28 | DRAFT       | Updated at user request to include Google and Apple OAuth, explicit provider linking, OIDC/PKCE validation, schema changes, and provider-isolated tests                                                                                                                                                                                                                                                                                                            |
| 2026-07-28 | APPROVED    | User explicitly approved implementation of the complete Auth, Users, Google OAuth, and Apple OAuth scope                                                                                                                                                                                                                                                                                                                                                           |
| 2026-07-28 | APPROVED    | Technical correction during implementation: retained PKCE for Google; aligned Apple with its official single-use code validation contract, which uses a client-secret JWT and has no `code_verifier` parameter                                                                                                                                                                                                                                                     |
| 2026-07-28 | IMPLEMENTED | Completed Auth, Users, Google OAuth, Apple OAuth, account linking, Places authorization integration, admin bootstrap, configuration hardening, Swagger, migration, and tests. Build, formatting, lint, Prisma validation/client generation, 32 unit tests, 13 e2e tests, production dependency audit, and `git diff --check` passed. Live PostgreSQL migration application remains unchecked because Docker/PostgreSQL was unavailable in the current environment. |

### Implemented file inventory

Created:

- `.env.example`
- `prisma/migrations/20260728000000_auth_users_oauth/migration.sql`
- `prompts/003-auth-users-jwt-refresh.md`
- `src/common/decorators/current-refresh-user.decorator.ts`
- `src/common/exceptions/identity.exceptions.ts`
- `src/common/guards/jwt-auth.guard.ts`
- `src/config/configuration.ts`
- `src/config/validation.schema.ts`
- `src/modules/auth/auth.controller.ts`
- `src/modules/auth/auth.module.ts`
- `src/modules/auth/auth.service.spec.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/dto/auth-response.dto.ts`
- `src/modules/auth/dto/login.dto.ts`
- `src/modules/auth/dto/oauth-code.dto.ts`
- `src/modules/auth/dto/refresh-token.dto.ts`
- `src/modules/auth/dto/register.dto.ts`
- `src/modules/auth/guards/jwt-refresh-auth.guard.ts`
- `src/modules/auth/interfaces/jwt-payload.interface.ts`
- `src/modules/auth/interfaces/oauth-identity.interface.ts`
- `src/modules/auth/oauth-links.controller.ts`
- `src/modules/auth/providers/apple-oauth.provider.ts`
- `src/modules/auth/providers/google-oauth.provider.ts`
- `src/modules/auth/providers/oauth-providers.service.ts`
- `src/modules/auth/providers/oauth-providers.spec.ts`
- `src/modules/auth/providers/oauth-redirect-validator.service.ts`
- `src/modules/auth/providers/oidc-crypto.service.ts`
- `src/modules/auth/strategies/jwt-access.strategy.ts`
- `src/modules/auth/strategies/jwt-refresh.strategy.ts`
- `src/modules/users/dto/change-password.dto.ts`
- `src/modules/users/dto/query-user.dto.ts`
- `src/modules/users/dto/update-profile.dto.ts`
- `src/modules/users/dto/update-user-role.dto.ts`
- `src/modules/users/dto/update-user-status.dto.ts`
- `src/modules/users/dto/user-response.dto.ts`
- `src/modules/users/interfaces/user-with-providers.interface.ts`
- `src/modules/users/password-hasher.service.ts`
- `src/modules/users/users.controller.ts`
- `src/modules/users/users.module.ts`
- `src/modules/users/users.service.spec.ts`
- `src/modules/users/users.service.ts`
- `src/scripts/bootstrap-admin.ts`
- `test/auth.e2e-spec.ts`
- `test/setup-env.ts`

Modified:

- `package-lock.json`
- `package.json`
- `prisma/schema.prisma`
- `src/app.module.ts`
- `src/common/constants/error-code.enum.ts`
- `src/common/decorators/roles.decorator.ts`
- `src/common/guards/roles.guard.ts`
- `src/common/interfaces/auth-user.interface.ts`
- `src/configure-app.ts`
- `src/main.ts`
- `src/modules/places/places.controller.ts`
- `src/modules/places/places.service.spec.ts`
- `src/modules/places/places.service.ts`
- `test/jest-e2e.json`
- `test/places.e2e-spec.ts`

Deleted:

- `src/common/guards/authentication.guard.ts`
