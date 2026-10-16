# TelemetryF1_API

Backend that ingests the F1 24 game's UDP telemetry, persists it to SQLite, streams it live over WebSocket, serves sessions/laps over REST, runs a deterministic lap-analysis engine and an AI coach on top of it. The frontend lives in a separate repo: [Telemetry-F1](https://github.com/AnaLauraFFerraz/Telemetry-F1).

## Stack

- Node.js ≥ 22.6 + TypeScript (CommonJS, `strict`), run with `ts-node-dev` (no build step yet)
- `dgram` (UDP), `ws` (WebSocket), Express 5 (REST), `better-sqlite3` (SQLite, WAL)
- `@anthropic-ai/sdk` for the coach
- Tests: Node's built-in runner (`node:test` + `node:assert/strict`) via `ts-node/register`

Node is installed through **fnm** on the dev machine; make sure it is on `PATH` before running npm.

## Commands

```bash
npm run dev                                   # UDP, WebSocket and REST on the ports from .env (example: 20777 / 8080 / 3001)
npm test                                      # all *.test.ts under src/persistence, src/analysis, src/coaching
npm run record                                # writes recordings/session-<timestamp>.jsonl
npm run replay -- recordings/<file>.jsonl     # re-sends a recording to 127.0.0.1:UDP_PORT
npm run analyze -- <sessionId> <lapA> <lapB>  # prints the LapInsights JSON for two laps, no AI call
npx tsc --noEmit                              # type-check (does NOT cover tools/, it is outside rootDir)
```

There are no `build`, `start` or `lint` scripts and no ESLint config yet.

Configuration comes from `.env` (copy `.env.example`): `WS_PORT`, `UDP_PORT`, `HTTP_PORT` are required and validated at startup; `ANTHROPIC_API_KEY` is optional. The database path is fixed: `data/telemetry.db`.

## Architecture

Flow: `network/udpListener` → `telemetry/dispatcher` (parse) → `persistence/persistTelemetry` + `network/wsBroadcaster`. REST reads from the repositories; the coach reads insights from `analysis/` and calls Anthropic.

| Path | Responsibility |
|---|---|
| `src/server.ts` | Entry point: wires UDP, WS and HTTP; per-packet try/catch so a malformed packet never kills the process |
| `src/config/` | Fail-fast env loading |
| `src/network/` | Transport only: UDP socket, WebSocket server with ping/pong heartbeat |
| `src/telemetry/` | Binary parsing of the F1 24 protocol, one folder per packet type (`header`, `motion`, `lapData`, `carTelemetry`, `session`), shared `BufferCursor`, sizes and `assertBytesRead` in `shared/` |
| `src/ws/` | WebSocket message envelope |
| `src/persistence/` | SQLite schema, per-session in-memory context, decimation, lap completion detection, repositories (one per table) |
| `src/analysis/` | Pure functions, no I/O: corner detection, braking/throttle, delta, line deviation, tyre windows → `buildInsights` |
| `src/coaching/` | Static system prompt, user-message builder, Anthropic call with typed errors |
| `src/http/` | Express app and routers (`sessionsRouter`, `analysisRouter`) |
| `tools/` | CLI scripts: recorder, replayer, analyze |

The REST and WebSocket payloads are a contract consumed by the frontend, which mirrors the types by hand. This repo owns that contract: any change to `src/ws/messageFormat.ts`, the routers or the repository row types must be flagged so the frontend's `src/types/` can be updated.

## Conventions

- Identifiers, file names and commit messages in **English**. Log messages, test names and comments in **Portuguese**. HTTP error bodies are mixed today (`sessionsRouter` uses English, `analysisRouter` mostly Portuguese); the frontend matches the literal `"session not found"`, so treat existing error strings as part of the contract.
- **Comments: minimal.** Only where the *why* is not obvious from the code (e.g. why `session_uid` is TEXT). Do not narrate what the code does. Do not rewrite existing comments as a side effect of other work.
- Every full-packet parser checks the consumed byte count with `assertBytesRead`. The session parser is intentionally partial and documents why.
- `analysis/` stays pure and deterministic. The AI coach only ever receives the derived `LapInsights` JSON, never raw samples.
- Repositories use prepared statements created at module load and map snake_case rows to camelCase objects.
- Unknown values are stored as `NULL`, never invented (see `lapCompletionDetector`).
- Tests: flat `test()` calls, synthetic data from `src/analysis/testFixtures.ts`, pure functions only. A new test file must live in one of the folders covered by the `test` script, or the script must be updated.
- Commits: small, Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), English subject, **no `Co-Authored-By` trailer**.

## Rules

- Never commit secrets: `.env`, API keys, tokens. `.env`, `data/` and `recordings/` are gitignored.
- Run `npm test` and `npx tsc --noEmit` before every commit; report any failure instead of committing around it.
- Do not change packet layouts, field order or sizes in `src/telemetry/` without checking the official spec, *Data Output from F1 24* (v27.2x).
- Documentation must describe only what exists in the code. Partial features are described as partial; no invented metrics or results.
- Never rewrite published git history.
- New features follow Spec Driven Development: spec, plan and tasks are committed before the implementation.

## Known pitfalls

These are also listed under "Known limitations" in the README. When a limitation is fixed, remove it from both this file and the README in the same PR.

- `npm run record` and `npm run dev` both bind the UDP port; stop the server before recording.
- Replaying the same recording twice appends duplicate samples (no unique constraint on sample tables).
- The `lap_analyses` cache is keyed only by `(session_id, lap_a, lap_b)`; it ignores the model, the prompt version and later benchmark changes.
- A flashback or lap restart in the game merges several passes under one `lap_number`; analysis on such laps is wrong. Lap times and sectors are still correct (they come from `lastLapTimeInMS`).
- `.env` is read only at startup; `ts-node-dev` does not restart on `.env` changes.
- Without `ANTHROPIC_API_KEY`, `POST /sessions/:id/analysis` returns 503 (cached analyses are still served).
- The coach's system prompt is expected to be below the model's minimum cacheable length, in which case `cache_control` has no effect; not measured yet. Each call logs its token `usage` (`[coachService] usage ...`) to confirm it.

## How to work in this repo

- Audit the relevant code and present a plan before changing files; wait for approval.
- One phase at a time; at the end, summarize what changed and what needs review.
- When a decision has a trade-off, present the options instead of deciding alone.
- If a request conflicts with what the code actually does, say so before proceeding.
- Only commit as part of an approved plan or when asked; never push without explicit approval.
