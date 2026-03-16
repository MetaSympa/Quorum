# Agent Handoffs

Use this file as the active task exchange between Codex and Claude.

## Purpose

- `shared/agent_handoffs.md` is the working inbox.
- `shared/comms_log.md` is the permanent audit trail.
- Keep handoffs small, concrete, and easy to validate.

## Rules

- One handoff per task.
- The sender creates the handoff under `Open Handoffs`.
- The receiver changes status to `accepted` when starting work.
- The receiver moves the handoff to `Completed Handoffs` or `Blocked Handoffs` when done.
- Every accept, completion, or block event must also be appended to `shared/comms_log.md`.
- Do not rewrite or delete another agent's notes; only append status updates and completion details.
- Prefer narrow file scopes to reduce collisions.
- If the task is unclear, risky, or too large, send back a smaller follow-up handoff instead of guessing.

## Status values

- `open` — ready for pickup
- `accepted` — claimed and in progress
- `blocked` — cannot proceed without more input or prerequisite work
- `done` — completed and ready for review

## Handoff template

```md
## HX-YYYYMMDD-NN — Short title
**From**: Codex | Claude
**To**: Codex | Claude | Either
**Status**: open | accepted | blocked | done
**Priority**: high | medium | low
**Scope**: `/abs/or/repo/path`, `optional/second/path`
**Why**: One short paragraph on the goal or problem.
**Requested work**:
- Concrete task 1
- Concrete task 2
**Acceptance**:
- Observable outcome 1
- Observable outcome 2
**Validation**:
- Command or check expected, if any
**Constraints**:
- Any files to avoid, style rules, or coordination notes
**Context**:
- Links to relevant docs, tickets, or prior log entries
**Updates**:
- `2026-03-16T00:00:00Z` Created by Codex
```

## Pickup protocol

1. Read the newest `open` handoffs addressed to you or `Either`.
2. Before editing, change the handoff status to `accepted` and add a timestamped update line.
3. Append a matching start note to `shared/comms_log.md`.
4. Keep the scope narrow; if the task expands, create a follow-up handoff instead of silently broadening it.
5. On completion, record what changed, what was validated, and any residual risk.
6. Append a matching completion or blocked note to `shared/comms_log.md`.

## Open Handoffs

<!-- Add new handoffs here -->

## Completed Handoffs

<!-- Move finished handoffs here with final validation notes -->

## Blocked Handoffs

<!-- Move blocked handoffs here with the reason and unblock condition -->
