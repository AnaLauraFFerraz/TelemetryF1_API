# Implementation Plan: Real-time replay of telemetry recordings

**Branch**: `001-realtime-replay` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-realtime-replay/spec.md`

## Summary

Make `tools/replayer.ts` honour each recorded packet's original offset (with a `1x`/`2x`/`max` speed choice and an optional loop), instead of flooding the UDP socket as fast as possible. This fixes the sample loss the fast replay causes today (FR-001/SC-001) and makes a live dashboard watchable during a replay (FR-012/SC-004). Looping for the public demo requires two correctness fixes on the ingestion side that the spec's clarifications settled: samples are deduplicated by `(session, overallFrameIdentifier)` so a repeated or looped pass never grows the database (FR-010), and the in-memory per-session state (lap detector, decimation) resets when a loop restart is detected via a large backward jump in `overallFrameIdentifier` — the one header field documented to survive a flashback unscathed (FR-011). The pacing math moves into a new `src/replay/` module so it is unit-testable without the game, and one small integration test exercises it against the real ingestion path with a disposable database and an OS-assigned port (FR-013).

Rebased onto `origin/main` at `52b3b21` ("docs: link the published sample recording and describe how to replay it"), which published the example recording as a GitHub Release and removed the specific loss numbers ("21–33%"/"64,412 packets") this plan's documentation edits would otherwise have quoted — those numbers belonged to an untraceable, different recording. **Before any implementation task touches `src/`**, this plan now requires measuring the real baseline loss on the actual published file (`demo-interlagos-tt-20hz-laps6-8.jsonl`), with `data/telemetry.db` backed up and restored around the measurement, and repeating the same measurement after the fix — see research.md point 6. Only those two measured numbers go into the README.md/CLAUDE.md edits from research.md point 5.

## Technical Context

**Language/Version**: Node.js ≥ 22.6, TypeScript 5.6 (`strict`, CommonJS) — unchanged from the rest of the project.

**Primary Dependencies**: none new. `dgram` (built-in, already used for UDP), `better-sqlite3` (already used for persistence), `node:timers/promises` (built-in, used for the one new abortable wait). No addition needed to `package.json`'s `dependencies`.

**Storage**: SQLite via `better-sqlite3`, same file (`data/telemetry.db` by default). One additive, nullable-column, `UNIQUE`-indexed schema change on two existing tables (`car_telemetry_samples`, `motion_samples`); see [data-model.md](data-model.md).

**Testing**: Node's built-in runner (`node:test`, `node:assert/strict`) via `ts-node/register`, same as today. `package.json`'s `test` script gains `src/replay/*.test.ts`.

**Target Platform**: same developer machine this project already targets (Windows via fnm-managed Node for `npm run dev`/`npm test`; the recorder/replayer pair exists specifically so the game itself is not required).

**Project Type**: single backend project — no new frontend/mobile surface. This feature touches a CLI tool (`tools/replayer.ts`), one new `src/` module, and the persistence layer's session-state handling.

**Performance Goals**: pacing error within 2% of the recording's own duration divided by speed, with no accumulation over a 222,839 ms / 13,960-packet recording (FR-004/SC-003); the new integration test completes in a few seconds (SC-007).

**Constraints**: recording file format unchanged (FR-014); no change to the REST/WS contract (verified in research.md point 1); the database path stays fixed by default in production, overridable only for the integration test (research.md point 4, a narrow, explicit exception to the "fixed path" fact CLAUDE.md states today — CLAUDE.md is updated to say so). The pass-restart reset (point 2) only fires for a recording whose own `overallFrameIdentifier` span exceeds the 100-frame threshold — accepted as a new known limitation for any shorter recording, and the integration test's synthetic fixture is built wide enough (span 160, self-asserted) to actually exercise it.

**Scale/Scope**: one player's telemetry per session, as today; a looped demo run for ~30+ consecutive passes (~2 hours of the example recording) without unbounded growth (SC-005).

**Baseline measurement (new, research.md point 6)**: before touching `src/`, measure today's unpaced replay's real sample delivery against the published recording (in-process ground truth via the real dispatcher/`persistTelemetry` vs. the actual UDP-delivered count, with `data/telemetry.db` backed up and restored around it); repeat identically after the fix, `--speed=1x`. These two numbers — not the spec's illustrative figures, not the old README's — are what the documentation task in point 5 writes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

| Principle | Status | Notes |
|---|---|---|
| I. Validated binary parsing | ✅ Pass | No packet layout, field order or size changes. `overallFrameIdentifier` is read from the header exactly as already parsed; nothing in `src/telemetry/` changes. |
| II. Ingestion never crashes; config fails fast | ✅ Pass | The pass-restart detection is a bounded comparison on an existing field, inside the same per-packet try/catch `server.ts` already has; it cannot throw. `DB_PATH`, when set, is validated the same way other env values are (empty string treated as absent, not silently misused). |
| III. Deterministic analysis; AI only explains | ✅ Pass / N/A | `src/analysis/` and `src/coaching/` are untouched. |
| IV. Record what is known; never invent | ✅ Pass | Existing sample rows get `NULL` for the new column, never backfilled or guessed (data-model.md). A duplicate insert is dropped, not altered. |
| V. Simple, embedded infrastructure | ✅ Pass | No new dependency. One new `src/` folder, consistent with the existing one-concern-per-folder layout. The `DB_PATH` override is the one deliberate, narrow exception to "the path is fixed," scoped to tests only and documented as such — not a general new capability. |
| VI. This repo owns the API contract | ✅ Pass | Confirmed by reading both repositories: `listCarTelemetrySamplesForLap`/`listMotionSamplesForLap` use explicit column lists, not `SELECT *`. The new column is write-only from outside; nothing in `src/ws/messageFormat.ts`, the routers, or any repository's returned row type changes. No frontend flag needed. |
| Tech/Quality constraints | ✅ Pass | Still Node ≥22.6/TS strict/CommonJS; still `node:test` with synthetic fixtures (the integration test's "recording" is a few synthetic in-memory packets, not a real capture); new pure logic (`computeDelayMs`) gets unit tests per the existing rule. |
| Workflow | ✅ Pass | Spec → plan → tasks, this plan included, committed before implementation. |

No violations; **Complexity Tracking is not needed.**

## Project Structure

### Documentation (this feature)

```text
specs/001-realtime-replay/
├── spec.md
├── plan.md              # this file
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── replay-cli.md
└── tasks.md              # /speckit-tasks output — not created by this command
```

### Source Code (repository root)

```text
src/
├── config/
│   └── env.ts                       # + optional DB_PATH override (test-only escape hatch)
├── persistence/
│   ├── db.ts                        # + ALTER TABLE migration for the new column, + CREATE UNIQUE INDEX, + startup log of resolved db path
│   ├── schema.ts                    # + overall_frame_identifier column on both sample tables (fresh installs)
│   ├── sessionContext.ts            # + maxOverallFrameId tracking + pass-restart reset + PASS_RESTART_THRESHOLD_FRAMES
│   ├── sessionContext.test.ts       # new: small regression doesn't reset; large drop resets; flashback doesn't reset
│   ├── carTelemetrySampleRepository.ts  # insert gains overallFrameIdentifier param, INSERT OR IGNORE; list query unchanged
│   └── motionSampleRepository.ts        # same as above
├── replay/                          # new module
│   ├── types.ts                     # ReplaySpeed, ReplayOptions, RecordedPacket
│   ├── scheduler.ts                 # computeDelayMs — pure
│   ├── scheduler.test.ts            # new
│   ├── runner.ts                    # runReplay — injectable clock/wait/send
│   └── replayIntegration.test.ts    # new: synthetic recording (overallFrameIdentifier span 160, self-asserted > threshold) through real ingestion, disposable DB, ephemeral port
└── ...                              # telemetry/, analysis/, coaching/, http/, network/, ws/ untouched

tools/
└── replayer.ts                      # rewritten as a thin CLI over src/replay/: args, file read, UDP socket, SIGINT/SIGTERM, start/end reports

package.json                         # test script: + src/replay/*.test.ts
README.md, CLAUDE.md                 # known-limitations updates per research.md point 5, written with the
                                      # measured numbers from point 6's post-fix run (tasks, not this plan)
```

**Structure Decision**: single project, no new top-level directory beyond `src/replay/`. The CLI stays a thin wrapper in `tools/` (outside `rootDir`, as today) over logic that now lives in `src/` precisely so it can be type-checked and unit-tested — the one structural change this feature makes, and it's required by the existing `tsc`/`npm test` scope rather than a new choice.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
