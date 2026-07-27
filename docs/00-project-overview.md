# Vietnam Travel Guide — Project Overview

## 1. Product Goal
A discovery app for travel destinations in Vietnam, including:
- Content on places officially published by the **system (admin/editor)**.
- Content contributed by **users**: posts, reviews, comments, reactions.
- Light social interactions: follow a place, save/bookmark, react by type (like, love, wow...).

## 2. User Roles
| Role | Description |
|---|---|
| `guest` | Views public content, no interaction |
| `user` | Creates posts, reviews, comments, reactions, bookmarks |
| `editor` | Manages official system-published place content |
| `admin` | Full access: user management, moderation, system config |

## 3. Core Domains (bounded contexts)
1. **Identity** — auth, user profile, roles/permissions.
2. **Place** — travel destinations (province/city, category, coordinates, opening hours...).
3. **Content** — posts (system + user), attached media.
4. **Engagement** — reviews (rating + text), comments (nested/multi-level), reactions.
5. **Moderation** — abuse reports, content approval status.
6. **Notification** — notify users on interactions (comment, reaction on their content...).
7. **Media/Upload** — image/video management (S3-compatible storage).

## 4. Phase 1 Scope (Backend MVP)
- Auth (JWT access/refresh, refresh token rotation).
- CRUD Place (system-managed) + Category + Location (Province/District).
- CRUD Post (user + system), status: draft/published/pending-review.
- Review (linked to Place, rating 1–5).
- Comment (nested, linked to Post or Review).
- Reaction (polymorphic: can target Post, Review, or Comment).
- Media upload via presigned URL.
- Basic Notification (in-app, DB-stored; no realtime required for MVP).
- Basic Report/Moderation for user-generated content.

## 5. Out of MVP Scope (backlog)
- Realtime (WebSocket/SSE) for notifications/chat.
- Advanced full-text search (Elasticsearch).
- Recommendation engine.
- Multi-language content (i18n for Place).

## 6. Proposed Tech Stack
- **Backend**: NestJS (latest), TypeScript strict mode.
- **ORM**: Prisma (recommended) or TypeORM — final decision documented in `01-architecture.md`.
- **DB**: PostgreSQL (strong relational needs, transactions, rating aggregates).
- **Cache/Queue**: Redis (caching, rate-limiting, BullMQ for async jobs — notifications, image
  processing).
- **Auth**: JWT (access + refresh), Passport strategies.
- **Validation**: class-validator + class-transformer.
- **Docs**: Swagger/OpenAPI auto-generated from decorators.
- **Storage**: S3-compatible (AWS S3 / Cloudflare R2) via presigned URL.
- **Containers**: Docker + docker-compose for local dev.
- **Testing**: Jest (unit) + Supertest (e2e).

## 7. Related Documents
- `01-architecture.md` — module architecture, layering, detailed tech decisions.
- `02-code-standards.md` — coding conventions, naming, error handling, response format.
- `03-workflow.md` — workflow between the user and the AI agent (prompt-driven development).
- `04-database-schema.md` — schema of core tables + relationships.
- `05-nestjs-modules.md` — detailed NestJS module structure, canonical code samples.
