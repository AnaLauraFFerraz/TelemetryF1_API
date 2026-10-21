# TelemetryF1_API

Backend that ingests the F1 24 game's UDP telemetry, persists it to SQLite, streams it live over WebSocket, serves sessions/laps over REST, runs a deterministic lap-analysis engine and an AI coach on top of it. The frontend lives in a separate repo: [Telemetry-F1](https://github.com/AnaLauraFFerraz/Telemetry-F1).

## Stack

- Node.js: major 22 pinned in `.nvmrc`, minimum 22.17 declared in `engines`. TypeScript (CommonJS, `strict`), run with `ts-node-dev` in development; `npm run build` compiles to `dist/` with its own `tsconfig.build.json` and `npm start` runs the compiled server
- `dgram` (UDP), `ws` (WebSocket), Express 5 (REST), `better-sqlite3` (SQLite, WAL)
- `@anthropic-ai/sdk` for the coach
- Tests: Node's built-in runner (`node:test` + `node:assert/strict`) via `ts-node/register`

Node is installed through **fnm** on the dev machine; make sure it is on `PATH` before running npm. The version comes from `.nvmrc`.

## Commands

```bash
npm run dev                                   # UDP, WebSocket and REST on the ports from .env (example: 20777 / 8080 / 3001)
npm test                                      # all src/**/*.test.ts, found by Node itself; a pretest guard fails if none
npm run record                                # writes recordings/session-<timestamp>.jsonl
npm run replay -- recordings/<file>.jsonl [--speed=1x|2x|max] [--loop]  # re-sends a recording to 127.0.0.1:UDP_PORT; default 1x, no loop
npm run analyze -- <sessionId> <lapA> <lapB>  # prints the LapInsights JSON for two laps, no AI call
npm run export-coach-seed                     # PAID, the maintainer's only: writes demo/coach-seed.json; needs DB_PATH=:memory: (or a temp path) and her key; the agent never runs it
npm run typecheck                             # type-check, covers src/ and tools/ (same as npx tsc --noEmit)
npm run build                                 # compiles src/ and tools/ to dist/ (tsconfig.build.json, tests excluded), then downloads and verifies the demo recording (tools/fetchDemoRecording.ts)
npm start                                     # runs the compiled server, dist/src/server.js
```

There is no `lint` script and no ESLint config yet. The CI runs `typecheck` and `test`, not `build`: `tsconfig.build.json` is not checked by it.

Configuration comes from `.env` (copy `.env.example`): `WS_PORT`, `UDP_PORT`, `HTTP_PORT` are required and validated at startup by the server, `record` and `replay`; `analyze` and the tests do not need them, only the database path (below); `ANTHROPIC_API_KEY` is optional. Demo mode (`DEMO_MODE=true`, spec 003, partial on its branch) does not read the three ports: it validates `PORT`, `DEMO_ALLOWED_ORIGIN` and its optional settings (`src/config/demoEnv.ts`, table in README "Demo mode") and refuses to start with `ANTHROPIC_API_KEY` or `DB_PATH` set; any `DEMO_MODE` value other than `true` or empty stops the server. The database path is fixed in production: `data/telemetry.db`, resolved from the project root (the folder holding `package.json`, `src/config/projectRoot.ts`), so the compiled server under `dist/` uses the same file. An optional `DB_PATH` environment variable overrides it — tests and manual verification use this to point at a temporary database, never at the real one (see Rules). In demo mode the database is always `:memory:` (`src/config/dbPath.ts`).

## Architecture

Flow: `network/udpListener` → `telemetry/dispatcher` (parse) → `persistence/persistTelemetry` + `network/wsBroadcaster`. REST reads from the repositories; the coach reads insights from `analysis/` and calls Anthropic.

| Path | Responsibility |
|---|---|
| `src/server.ts` | Entry point: wires UDP, WS and HTTP; per-packet try/catch so a malformed packet never kills the process |
| `src/config/` | `env.ts` loads and validates the ports with fail-fast (local mode only); `dbPath.ts` resolves the database path (including `DB_PATH`, and `:memory:` in demo mode) and is the only config file the persistence layer imports, so persistence does not depend on the ports; `mode.ts` reads `DEMO_MODE`; `demoEnv.ts` validates the demo settings; `projectRoot.ts` finds the folder holding `package.json` |
| `src/network/` | Transport only: UDP socket, WebSocket server with ping/pong heartbeat |
| `src/telemetry/` | Binary parsing of the F1 24 protocol, one folder per packet type (`header`, `motion`, `lapData`, `carTelemetry`, `session`), shared `BufferCursor`, sizes and `assertBytesRead` in `shared/` |
| `src/ws/` | WebSocket message envelope |
| `src/persistence/` | SQLite schema, per-session in-memory context, decimation, lap completion detection, repositories (one per table); sample tables deduplicate on `(session_id, overall_frame_identifier)` — that field never resets or regresses within a session, including across a flashback, unlike session time or lap distance |
| `src/analysis/` | Pure functions, no I/O: corner detection, braking/throttle, delta, line deviation, tyre windows → `buildInsights` |
| `src/coaching/` | Static system prompt, user-message builder, Anthropic call with typed errors |
| `src/http/` | Express app and routers (`sessionsRouter`, `analysisRouter`) |
| `src/replay/` | Pure replay pacing (`computeDelayMs`) and orchestration (`runReplay`): speed, loop, absolute-deadline scheduling |
| `src/tooling/` | Tests of the project's own tooling: the test of the empty-discovery guard |
| `tools/` | CLI scripts: recorder, analyze, a thin replayer CLI over `src/replay/`, `fetchDemoRecording.ts` (the last step of `npm run build`: downloads and verifies the demo recording), `exportCoachSeed.ts` (the maintainer's paid, one-off export of `demo/coach-seed.json`; the agent never runs it), and `assertTestFiles.ts`, the guard that runs as the `pretest` of `npm test` |

The REST and WebSocket payloads are a contract consumed by the frontend, which mirrors the types by hand. This repo owns that contract: any change to `src/ws/messageFormat.ts`, the routers or the repository row types must be flagged so the frontend's `src/types/` can be updated.

## Conventions

- Identifiers, file names and commit messages in **English**. Log messages, test names and comments in **Portuguese**. HTTP error bodies are mixed today (`sessionsRouter` uses English, `analysisRouter` mostly Portuguese); the frontend matches the literal `"session not found"`, so treat existing error strings as part of the contract.
- **Comments: minimal.** Only where the *why* is not obvious from the code (e.g. why `session_uid` is TEXT). Do not narrate what the code does. Do not rewrite existing comments as a side effect of other work.
- Every full-packet parser checks the consumed byte count with `assertBytesRead`. The session parser is intentionally partial and documents why.
- `analysis/` stays pure and deterministic. The AI coach only ever receives the derived `LapInsights` JSON, never raw samples.
- Repositories use prepared statements created at module load and map snake_case rows to camelCase objects.
- Unknown values are stored as `NULL`, never invented (see `lapCompletionDetector`).
- Tests: flat `test()` calls, synthetic data from a `testFixtures.ts` per folder (`src/analysis/`, `src/replay/`), mostly pure functions. The handful of tests that need a real SQLite connection (sample repositories, the replay integration test) use `src/persistence/testDb.ts` to open an isolated, disposable database via `DB_PATH` — never `data/telemetry.db`. A new test file under `src/` is picked up by the `test` script with no edit.
- Commits: small, Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`), English subject, **no `Co-Authored-By` trailer**.
- **Check names are a contract:** renaming a CI job (`typecheck`, `test`) requires updating the required checks of the ruleset on `main` in the same piece of work, and renaming `ci.yml` requires updating the README badge in the same piece of work.
- **Actions:** first-party `actions/*` by major tag; any third-party action by full commit SHA with a trailing version comment.

## Rules

- Never commit secrets: `.env`, API keys, tokens. `.env`, `data/` and `recordings/` are gitignored.
- Run `npm test` and `npm run typecheck` (the same scripts the CI calls) before every commit; report any failure instead of committing around it.
- Do not change packet layouts, field order or sizes in `src/telemetry/` without checking the official spec, *Data Output from F1 24* (v27.2x).
- Documentation must describe only what exists in the code. Partial features are described as partial; no invented metrics or results.
- Never rewrite published git history. Exception made once, on 2026-10-18: `main` was rewritten with `git filter-repo` to remove a `Co-Authored-By` trailer from one already-published commit (AI usage on this project is disclosed elsewhere; this repo's own commits don't carry the trailer by choice). The rule otherwise still stands — this is not a precedent for routine history rewrites.
- New features follow Spec Driven Development: spec, plan and tasks are committed before the implementation.
- Manual tests and smoke tests point `DB_PATH` at a temporary database or a copy, never at `data/telemetry.db` directly — this applies to ad-hoc CLI verification just as much as to automated tests. Before any operation on the real database (a migration check, a one-off query, anything that writes), back it up first and keep that backup until the feature merges.

## Spec Driven Development

Spec Kit 1.2.0 (Claude Code integration, PowerShell scripts). The constitution is `.specify/memory/constitution.md`; read it before planning.

- Flow: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → (`/speckit-analyze`) → `/speckit-implement` → `/speckit-converge`.
- Each feature lives in `specs/NNN-short-name/` (`spec.md`, `plan.md`, `tasks.md`, ...). Commit those artifacts (`docs:`) before any implementation commit.
- This repo owns the API contract. A feature that changes it is specified here; the frontend's spec references this one.
- The project existed before SDD was adopted; only features from `specs/001` onward were built this way.

## Known pitfalls

These are also listed under "Known limitations" in the README. When a limitation is fixed, remove it from both this file and the README in the same PR.

- `npm run record` and `npm run dev` both bind the UDP port; stop the server before recording.
- The `lap_analyses` cache is keyed only by `(session_id, lap_a, lap_b)`; it ignores the model, the prompt version and later benchmark changes.
- A lap with more than one pass over the same distance gets wrong per-distance analysis: a flashback (event `FLBK`, `sessionTime` going back, `frameIdentifier` diverging from `overallFrameIdentifier`), or the Time Trial out-lap, which shares its `lap_number` with the first flying lap. Lap times and sectors are still correct (they come from `lastLapTimeInMS`).
- The `max` replay speed overflows the UDP receive buffer by design: laps, times and sectors arrive intact, but a large share of the per-distance samples is lost. `1x` and `2x` do not lose samples.
- `--speed=max` combined with `--loop` delivers practically no samples (measured: effectively zero) — the flood never lets up between passes. Use `1x` or `2x` for a continuous demo.
- A looped replay of a recording whose own `overallFrameIdentifier` span is at or below `PASS_RESTART_THRESHOLD_FRAMES` (100, in `sessionContext.ts`) does not reset the in-memory lap/decimation state at the loop boundary — the next pass carries over stale state instead of starting fresh. Not expected to matter for any realistic recording (the published Interlagos example spans about 4,500 frames).
- Switching the Node major without running `npm ci` again makes `better-sqlite3` fail to load with `ERR_DLOPEN_FAILED` (its native binary is built for one major's ABI).
- `sessionType` 18 is Time Trial in F1 24 (the numbering differs from F1 23).
- `.env` is read only at startup; `ts-node-dev` does not restart on `.env` changes.
- Replaying an old recording writes into the session it came from, if that session is already in the database (same `sessionUID`), and moves its `last_seen_at` to now, so the history shows its duration stretched from the original capture to the replay.
- Without `ANTHROPIC_API_KEY`, `POST /sessions/:id/analysis` returns 503 (cached analyses are still served).
- The demo's coach seed covers the six ordered pairs of laps 6, 7 and 8, but today's frontend fixes the primary lap to the latest one, so only (8, 6) and (8, 7) are requested.
- The coach's system prompt (1,378 tokens for `claude-opus-4-8`, measured with the token-counting endpoint) is below the model's minimum cacheable length, so `cache_control` has no effect. Each call logs its token `usage` (`[coachService] usage ...`). Re-measure if the prompt changes.

## How to work in this repo

- Audit the relevant code and present a plan before changing files; wait for approval.
- One phase at a time; at the end, summarize what changed and what needs review.
- When a decision has a trade-off, present the options instead of deciding alone.
- If a request conflicts with what the code actually does, say so before proceeding.
- Only commit as part of an approved plan or when asked; never push without explicit approval.
- Edit text files only with the Edit and Write tools, never with shell scripts: a PowerShell alias (`rd`) already deleted a file during spec 002.
