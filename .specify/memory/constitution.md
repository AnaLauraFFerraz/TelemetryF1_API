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

- Node.js ≥ 22.6, TypeScript in `strict` mode, CommonJS.
- Express 5 for REST, `ws` for WebSocket, `dgram` for UDP, `better-sqlite3` for persistence, `@anthropic-ai/sdk` for the coach.
- Tests use Node's built-in runner (`node:test`, `node:assert/strict`) with synthetic fixtures. Pure logic — analysis, decimation, lap completion detection, message building — is covered by unit tests, and new pure logic follows the same rule.
- Identifiers, file names and commit messages are in English. Logs, test names and comments are in Portuguese. Comments are minimal and explain only a non-obvious *why*.
- Secrets (`.env`, API keys) are never committed.

## Development Workflow

- New features follow Spec Driven Development: the spec, plan and tasks are committed before the implementation, in separate commits.
- `npm test` and `npx tsc --noEmit` pass before every commit. A failure is reported, never committed around.
- Commits are small Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) with no `Co-Authored-By` trailer.
- Known limitations are listed in both `CLAUDE.md` and `README.md`. The change that fixes a limitation removes it from both.
- Decisions with trade-offs are presented as options before being made.
- Published git history is never rewritten.

## Governance

This constitution takes precedence over other practices in this repository. `CLAUDE.md` holds the day-to-day operational guidance and must not contradict it.

Amendments are made through a pull request that updates this file and states the reason. Versions follow semantic versioning: MAJOR for removing or redefining a principle, MINOR for adding a principle or section, PATCH for clarifications. Every plan produced with `/speckit-plan` includes a constitution check, and reviews verify compliance.

**Version**: 1.0.0 | **Ratified**: 2026-10-16 | **Last Amended**: 2026-10-16
