# Workflow — Prompt-Driven Development with the AI Agent

## 1. Core Principle
> **The agent must never implement code straight from a raw idea.**
> The agent must turn the idea (main idea) into a **plan file** in `/prompts`, wait for **user
> approval**, and only then write code.

Rationale: avoids the agent misunderstanding requirements, guarantees a review checkpoint before
spending effort generating code, and turns every file in `/prompts` into a historical record
(audit trail) for that feature.

## 2. Lifecycle of a Feature/Task

```
1. User writes a "main idea" (a rough idea, can be a few sentences)
        │
        ▼
2. Agent analyzes it + reads the relevant docs (00–05) + existing repo conventions
        │
        ▼
3. Agent creates a file: /prompts/<NNN>-<slug>.md   (status: DRAFT)
        │
        ▼
4. User reads it and responds: APPROVE / REQUEST_CHANGES / REJECT
        │
   ├── REQUEST_CHANGES → agent updates the file (status stays DRAFT), back to step 4
   ├── REJECT          → agent marks status: REJECTED, stops
   └── APPROVE         → status: APPROVED
        │
        ▼
5. Agent implements the code exactly per the approved file
        │
        ▼
6. Agent updates the file: status: IMPLEMENTED, lists files created/modified, summarizes results
        │
        ▼
7. User reviews the code → if changes are needed, create a new follow-up prompt (don't rewrite
   the history of the old file)
```

## 3. Naming Convention for `/prompts` Files
```
/prompts/{3-digit sequence number}-{kebab-case-slug}.md
```
Examples: `001-auth-jwt-refresh.md`, `002-place-crud.md`, `003-review-rating-aggregate.md`.
The sequence number always increases and is never reused, even for a REJECTED file.

## 4. Mandatory Structure of a Prompt File
See the full template at `prompts/TEMPLATE.md`. Summary of required sections:

1. **Metadata** — id, title, created date, status, related module.
2. **Original Idea** — the user's exact words, copied verbatim, not reworded.
3. **Analysis & Scope** — the agent's interpretation: what's in scope, what's explicitly out of
   scope.
4. **Proposed Technical Details** — endpoints, DTOs, entity/schema changes, guards/permissions
   applied, side effects (async jobs, cache invalidation...).
5. **Impact on the Existing System** — DB tables affected, breaking API changes, dependent
   modules.
6. **Open Questions / Needs User Decision** — if anything is unclear, list it here instead of
   guessing.
7. **Acceptance Criteria Checklist** — the conditions for considering the task done.
8. **Status Log** — timeline of status changes with notes.

## 5. Rules for the Agent When Creating a Prompt File
- NEVER write code in this file (except short illustrative interface/type snippets if needed for
  clarity).
- If the user's idea is vague, the agent must explicitly list the **assumptions** it's using for
  the DRAFT — the user only needs to correct the assumptions instead of rewriting everything from
  scratch.
- If the idea touches an existing DB table, the agent must read `04-database-schema.md` first and
  clearly state which columns/tables are added or modified.
- The agent always references `02-code-standards.md` when proposing the file/module structure in
  section 4.

## 6. Rules for the Agent When Implementing (after APPROVAL)
- Only implement exactly what was approved. If the agent discovers a need to go beyond scope,
  stop, update the prompt file (add a "Scope creep" section), and request approval for the
  additional scope before continuing.
- Code must comply with all of `02-code-standards.md`.
- Once done, the agent lists every file created/modified in the "Status Log" section of the
  corresponding prompt file.

## 7. Valid Statuses
`DRAFT → APPROVED → IMPLEMENTED` or `DRAFT → REJECTED`.
No status may skip the `APPROVED` step to reach `IMPLEMENTED`.

## 8. Quick Example
The user types: *"I want users to be able to report a post for a violation"*
→ The agent creates `/prompts/010-report-post-violation.md` (DRAFT), noting: a new `Report`
entity (polymorphic targetType/targetId like Reaction), a `ReportReason` enum, endpoint
`POST /api/v1/reports`, restricted to logged-in `user`s, a limit of 1 report per user per target
(unique constraint), and an open question: "Should reports be handled immediately by an admin, or
queued for review?"
→ The user answers the open question and APPROVEs → the agent codes exactly per the agreed scope.
