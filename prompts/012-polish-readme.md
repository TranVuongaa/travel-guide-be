---
id: 012
title: Polish the project README
status: IMPLEMENTED
module: documentation
created_at: 2026-07-29
updated_at: 2026-07-29
---

## 1. Original Idea

> sửa readme chút cho đẹp

## 2. Analysis & Scope

The current `README.md` is a very short NestJS-style landing section with the project tagline and
plain-text frontend/backend demo URLs. It also already contains an uncommitted user change, so the
existing demo information must be preserved while improving presentation.

**In scope:**

- Refresh the top section of `README.md` with a clear project title and the existing Vietnam
  travel-guide description.
- Keep the NestJS logo and use a compact centered hero layout.
- Add a small set of relevant technology badges without implying unconfigured CI or deployment
  status.
- Present the frontend demo and Swagger API documentation as readable clickable links.
- Keep the README concise and ensure the Markdown/HTML renders cleanly on GitHub.

**Out of scope:**

- Changing application code, configuration, deployment, API behavior, or dependencies.
- Changing either existing demo URL.
- Adding unverified claims, screenshots, CI badges, environment/setup instructions, or a full
  architecture guide.
- Replacing the detailed documentation already maintained under `docs/`.

**Assumptions** — the user can change these before approval:

- “Chút cho đẹp” means polishing only the README hero and demo-link presentation, not writing a
  comprehensive README.
- The copy remains in English to match the current README and project documentation.
- The current frontend URL `http://52.62.25.92` and backend Swagger URL
  `http://52.62.25.92/api/docs` are intentional and must remain unchanged.
- The existing uncommitted README content belongs to the user and will be edited in place, not
  discarded.

## 3. Proposed Technical Details

### 3.1 Entity / Schema changes

- None. No database table, column, enum, Prisma schema, or migration changes.

### 3.2 API Endpoints

No endpoint behavior changes.

| Method | Path | Auth/Role | Description |
|---|---|---|---|
| N/A | N/A | N/A | Documentation-only task |

### 3.3 Key DTOs

- None.

### 3.4 Important business rules

- Preserve both demo destinations exactly.
- Remove the unused CircleCI reference definitions because this repository does not display a
  CircleCI badge in the README.
- Use only truthful, project-relevant badges such as NestJS, TypeScript, PostgreSQL, and Prisma.
- Keep the resulting source readable and avoid excessive decorative markup.
- Follow the repository documentation conventions and avoid duplicating content from `docs/`.

### 3.5 Side effects / Async jobs / Cache invalidation

- None.

## 4. Impact on the Existing System

- **File affected:** `README.md` only, plus this prompt file for the required audit trail.
- **Dependent modules:** none.
- **Breaking changes:** none.
- **Code standards:** no source structure or behavior changes; Markdown will be checked for clean,
  valid rendering in line with `docs/02-code-standards.md`.

## 5. Open Questions / Needs User Decision

- [x] Confirm the concise English hero, technology badges, and demo-link layout described above.

Approving this prompt accepts the assumptions above. Use `REQUEST_CHANGES` if you want Vietnamese
copy, a fuller setup guide, screenshots, or different demo labels.

## 6. Acceptance Criteria Checklist

- [x] The README has a clear project title, concise tagline, and balanced top-level layout.
- [x] Relevant technology badges render without suggesting unconfigured CI status.
- [x] Frontend and Swagger demo links are easy to identify and remain unchanged.
- [x] The unused CircleCI link definitions are removed.
- [x] Existing user-authored README changes are preserved.
- [x] No application source, configuration, dependencies, or API behavior changes.
- [x] The final Markdown contains no broken local references or malformed markup.

## 7. Status Log

| Date | Status | Notes |
|---|---|---|
| 2026-07-29 | DRAFT | Agent created the draft after reviewing the required project documents and current README |
| 2026-07-29 | APPROVED | User approved the draft for implementation |
| 2026-07-29 | IMPLEMENTED | Polished the README hero, technology badges, and demo links |

**Files created:**

- `prompts/012-polish-readme.md`

**Files modified:**

- `README.md`

**Verification:**

- `git diff --check` passed.
- The README contains the original frontend and Swagger URLs.
- Only `README.md` and this prompt audit file changed.
