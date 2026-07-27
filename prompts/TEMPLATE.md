---
id: NNN
title: <Short task title>
status: DRAFT   # DRAFT | APPROVED | REJECTED | IMPLEMENTED
module: <e.g. places, posts, reviews, comments, reactions, auth...>
created_at: <YYYY-MM-DD>
updated_at: <YYYY-MM-DD>
---

## 1. Original Idea
> Paste the user's exact words here, verbatim, without rewording.

<user-provided content>

## 2. Analysis & Scope

**In scope:**
-

**Out of scope:**
-

**Assumptions** — filled in by the agent when the idea is unclear; the user can edit this section
directly:
-

## 3. Proposed Technical Details

### 3.1 Entity / Schema changes
- New tables / columns / enums (reference `docs/04-database-schema.md`):

### 3.2 API Endpoints
| Method | Path | Auth/Role | Description |
|---|---|---|---|
| | | | |

### 3.3 Key DTOs
-

### 3.4 Important business rules
-

### 3.5 Side effects / Async jobs / Cache invalidation
-

## 4. Impact on the Existing System
- Dependent modules:
- Breaking changes (if any):

## 5. Open Questions / Needs User Decision
- [ ]

## 6. Acceptance Criteria Checklist
- [ ] Endpoints work as specified in section 3.2
- [ ] Input fully validated per `docs/02-code-standards.md`
- [ ] Unit tests for the service, e2e tests for the main flow
- [ ] Swagger fully updated
- [ ] No breaking changes to existing APIs/features

## 7. Status Log
| Date | Status | Notes |
|---|---|---|
| <YYYY-MM-DD> | DRAFT | Agent created the first draft |
