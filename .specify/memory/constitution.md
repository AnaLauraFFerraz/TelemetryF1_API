<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0 (MINOR)
- Bump rationale: no principle is removed or redefined (not MAJOR). The CI merge gate is a new
  binding rule, the Node.js minimum is a narrowed constraint and `ci:` extends a closed list, so
  this is more than a clarification (not PATCH). The versioning rule names MINOR only for a new
  principle or section; a new rule inside an existing section is read as MINOR, the closest case.
  Citing `npm run typecheck` and recording the 2026-10-18 history exception are clarifications.
- Modified principles: none (I–VI unchanged)
- Modified sections:
  - Technology and Quality Constraints: Node.js ≥ 22.6 → ≥ 22.17 (stable `fs.globSync` in the
    test-discovery guard); the major in use is the one pinned in `.nvmrc`.
  - Development Workflow: the local check cites `npm run typecheck` instead of `npx tsc --noEmit`;
    new rule: the CI (`typecheck`, `test`) is the merge gate of `main`, protected by the ruleset in
    `README.md`, with the README's last-resort procedure as the only exception; `ci:` added to the
    commit types; the history rule records the single exception of 2026-10-18.
- Added sections: none
- Removed sections: none
- Dependent files:
  - ✅ CLAUDE.md: updated in the same commit (temporary ≥ 22.6 divergence note removed, `ci:` added)
  - ✅ README.md: no change needed (already Node ≥ 22.17, ruleset and last-resort procedure)
  - ✅ package.json, .nvmrc, .github/workflows/ci.yml: already consistent
  - ✅ .specify/templates/plan-template.md: no change needed (generic Constitution Check gate)
  - ✅ .specify/templates/spec-template.md, tasks-template.md, checklist-template.md: no change needed
  - ✅ .claude/skills/speckit-*: no change needed (they read this file at runtime)
  - ⚠ specs/001-realtime-replay, specs/002-github-actions-ci: cite v1.0.0; left as historical records
- Follow-up TODOs: none
-->

# TelemetryF1_API Constitution

This constitution was written after the fact, from the code that already existed when Spec Driven Development was adopted. It records rules the codebase already follows plus the development process adopted from that point on; it does not describe aspirations.

## Core Principles

### I. Validated binary parsing

Every full-packet parser in `src/telemetry/` reads through `BufferCursor` and MUST assert the exact number of bytes consumed with `assertBytesRead` against the size published in the official *Data Output from F1 24* specification. A parser that intentionally reads only part of a packet MUST say so and why. Packet layouts, field order and sizes MUST NOT change without checking that specification.

Rationale: a wrong offset does not throw; it silently corrupts every following field.

### II. The ingestion loop never crashes; configuration fails fast

A malformed, truncated or foreign UDP packet MUST be logged and dropped without stopping the process (per-packet error isolation in `src/server.ts`). Conversely, required configuration MUST be validated at startup and stop the process with a clear message when missing or invalid. Optional capabilities (the AI coach) MUST degrade to an explicit error response, not a crash.

### III. Deterministic analysis; the AI only explains

Lap analysis lives in `src/analysis/` as pure, deterministic functions with no I/O. The AI coach MUST receive only the derived `LapInsights` JSON, never raw telemetry samples. Any number shown to the user comes from deterministic code, not from the model. Paid model calls MUST be cached so the same input is never sent twice.

### IV. Record what is known; never invent

Unknown or inconsistent values are stored as `NULL` rather than estimated. Authoritative values from the game (for example `lastLapTimeInMS`) take precedence over values reconstructed from samples. Documentation MUST describe only behaviour that exists in the code; partial features are described as partial, with no invented metrics.

### V. Simple, embedded infrastructure

Persistence uses embedded SQLite through repositories, one per table, with prepared statements and explicit snake_case to camelCase mapping. Dependencies are kept minimal; adding one requires a stated reason in the spec or plan.

### VI. This repository owns the API contract

The REST and WebSocket payloads are a contract consumed by the Telemetry-F1 frontend, which mirrors the types by hand. Any change to `src/ws/messageFormat.ts`, the routers or the repository row types — including the literal error strings the frontend matches — MUST be called out in the spec and plan so the frontend can be updated in the same piece of work.

## Technology and Quality Constraints

- Node.js ≥ 22.17, declared in `engines.node`: the test-discovery guard uses `fs.globSync`, stable only from 22.17. The major in use, locally and in the CI, is the one pinned in `.nvmrc`. TypeScript in `strict` mode, CommonJS.
- Express 5 for REST, `ws` for WebSocket, `dgram` for UDP, `better-sqlite3` for persistence, `@anthropic-ai/sdk` for the coach.
- Tests use Node's built-in runner (`node:test`, `node:assert/strict`) with synthetic fixtures. Pure logic — analysis, decimation, lap completion detection, message building — is covered by unit tests, and new pure logic follows the same rule.
- Identifiers, file names and commit messages are in English. Logs, test names and comments are in Portuguese. Comments are minimal and explain only a non-obvious *why*.
- Secrets (`.env`, API keys) are never committed.

## Development Workflow

- New features follow Spec Driven Development: the spec, plan and tasks are committed before the implementation, in separate commits.
- `npm test` and `npm run typecheck`, the same scripts the CI runs, pass locally before every commit. A failure is reported, never committed around.
- The CI is the merge gate of `main`: a pull request merges only with the `typecheck` and `test` checks green. `main` is protected by the GitHub ruleset described in `README.md`: changes arrive only through a pull request, the branch must be up to date with `main`, history stays linear, the bypass list is empty (administrators included), and "Rebase and merge" is the only merge method allowed. The only exception is the last-resort procedure in `README.md` for a GitHub Actions outage (disable the ruleset, merge, re-enable it at once), always recorded in the pull request.
- Commits are small Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, and `ci:` for changes to the GitHub Actions workflow) with no `Co-Authored-By` trailer.
- Known limitations are listed in both `CLAUDE.md` and `README.md`. The change that fixes a limitation removes it from both.
- Decisions with trade-offs are presented as options before being made.
- Published git history is never rewritten. One exception was made, on 2026-10-18: `main` was rewritten with `git filter-repo` to remove a `Co-Authored-By` trailer from one already-published commit. The rule otherwise still stands; that exception is not a precedent for rewriting history.

## Governance

This constitution takes precedence over other practices in this repository. `CLAUDE.md` holds the day-to-day operational guidance and must not contradict it.

Amendments are made through a pull request that updates this file and states the reason. Versions follow semantic versioning: MAJOR for removing or redefining a principle, MINOR for adding a principle or section, PATCH for clarifications. Every plan produced with `/speckit-plan` includes a constitution check, and reviews verify compliance.

**Version**: 1.1.0 | **Ratified**: 2026-10-16 | **Last Amended**: 2026-10-20
