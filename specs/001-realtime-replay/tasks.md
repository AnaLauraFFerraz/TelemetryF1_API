---

description: "Task list template for feature implementation"
---

# Tasks: Real-time replay of telemetry recordings

**Input**: Design documents from `/specs/001-realtime-replay/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/replay-cli.md, quickstart.md (all present)

**Tests**: Included. The constitution requires unit tests for new pure logic, and FR-013 explicitly requires both unit and integration coverage.

**Organization**: Tasks are grouped by user story (US1/US2/US3, priorities P1/P2/P3 from spec.md) so each can be implemented and tested independently. FR-010 (sample dedup) is cross-cutting infrastructure — shared by a plain re-run and by looping — and lives in Foundational rather than any single story; FR-011 (pass-restart reset) only matters once looping exists, so it lives in US3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3, per spec.md's priorities — Setup/Foundational/Polish tasks carry no story label
- Every task names its exact file path

## Revision note

T005 (the shared test-database helper) and the renumbering from T006 onward were added after T001–T004 were already implemented and committed. The original task list had T006/T007 (repository insert changes) and their tests, plus T019 (the integration test), each independently assuming they wouldn't touch the real `data/telemetry.db` — without saying how. Attempting the work surfaced that gap: none of them actually redirected the database, so the first real repository test would have been the first thing in the whole test suite to open (and write into) the developer's actual file. T005 fixes this once, centrally, instead of three separate copies of the same `require()`-after-`DB_PATH` dance.

Also fixed in an earlier pass (before this one): T015 (then T014) no longer carries a forward dependency on `PASS_RESTART_THRESHOLD_FRAMES` — that guard moved to T026 (then T025), the US3 task that actually exports it.

## Phase 1: Setup

**Purpose**: a baseline measurement that must be taken against today's *unmodified* code, before any task below touches `src/`.

- [X] T001 Baseline measurement (research.md point 6 / quickstart.md step 0): back up `data/telemetry.db` and its `-wal`/`-shm` sidecars if present (note if absent — "restore" then means "delete what this measurement created"); run the current `npm run dev` + today's unmodified `npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl` (unpaced, the only mode that exists yet); count `car_telemetry_samples` rows for the resulting session; separately compute the ground-truth count by feeding the same file through the real `src/telemetry/dispatcher` + `src/persistence/persistTelemetry` in-process (no UDP socket, via a throwaway script, not committed) against a temporary SQLite file; record baseline% = actual ÷ ground-truth; restore `data/telemetry.db` from the backup (or delete it if none existed). **Blocks every other task** — must run before any implementation change lands. Recorded in `specs/001-realtime-replay/baseline-measurement.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the schema/dedup change, the test-isolation helper, and the pacing module every user story needs. No user story task may start before this phase is done.

- [X] T002 [P] Add an optional `DB_PATH` override in `src/config/env.ts`: `dbPath` reads `process.env.DB_PATH`, trims it, and falls back to the existing fixed `path.resolve(__dirname, "..", "..", "data", "telemetry.db")` when the variable is unset **or empty** (an empty string must not reach `better-sqlite3`, which would otherwise open a silent private temporary database). Production behaviour (no `DB_PATH` set) is unchanged.
- [X] T003 [P] Add `overall_frame_identifier INTEGER` (nullable) to both `car_telemetry_samples` and `motion_samples` in `SCHEMA_SQL`, `src/persistence/schema.ts` — this is the column a fresh database gets natively; per data-model.md, existing rows under the later migration (T004) get `NULL` here and are never backfilled.
- [X] T004 In `src/persistence/db.ts`: log the resolved `env.dbPath` once at module load (Portuguese, one line); add the defensive migration for existing databases — `ALTER TABLE car_telemetry_samples ADD COLUMN overall_frame_identifier INTEGER` and the same for `motion_samples`, each wrapped in the existing try/catch "duplicate column name" pattern used for `track_id` — then `CREATE UNIQUE INDEX IF NOT EXISTS ux_car_telemetry_samples_session_frame ON car_telemetry_samples(session_id, overall_frame_identifier)` and `ux_motion_samples_session_frame` likewise on `motion_samples`, run **after** the ALTERs so the column is guaranteed to exist on both a migrated-old and a fresh-new database. Per data-model.md: "Multiple `NULL`s coexist without conflict... A non-null duplicate is rejected by `INSERT OR IGNORE`." (depends on T002, T003)
- [X] T005 New shared helper `src/persistence/testDb.ts`, used by every test in this feature that touches the database (T009, T010, T019) instead of three separate copies of the same dance: `setupIsolatedTestDb()` creates a uniquely-named temp directory (`fs.mkdtempSync`), sets `process.env.DB_PATH` to a file inside it, `require()`s `./db` (a function-call `require`, not a static `import` — imports are hoisted above any env-setting code in the same file, so only a `require()` issued *after* setting `DB_PATH` sees it; see research.md point 4), and asserts the opened connection's `.name` equals that exact temp path (confirmed in this session that `better-sqlite3`'s `Database.name` is exactly the path it was opened with) before returning a handle — a mismatch throws immediately, before the caller does anything else, so a misconfigured test fails loudly instead of silently writing into the real database. `teardownIsolatedTestDb(handle)` closes the connection and removes the temp directory; every caller registers it in `after()` so cleanup runs even on failure. A caller still does its own `require()` of the module actually under test, after calling `setupIsolatedTestDb()`. Confirmed empirically in this session (throwaway files, not committed) that `node --test fileA fileB` runs each file in its own process — the module cache does not leak across files — which is what makes per-file `DB_PATH` overrides safe at all; documented as a reason for the future full-DI improvement in research.md.
- [X] T006 [P] In `src/persistence/carTelemetrySampleRepository.ts`: add an `overallFrameIdentifier: number` parameter to `insertCarTelemetrySample`, include the new column, and change `INSERT INTO` to `INSERT OR IGNORE INTO`. Leave `listCarTelemetrySamplesForLap`'s explicit `SELECT` column list and its returned `CarTelemetrySampleRow` shape untouched (confirmed zero REST/WS contract impact in research.md point 1).
- [X] T007 [P] Same change in `src/persistence/motionSampleRepository.ts` for `insertMotionSample` / `MotionSampleRow`.
- [X] T008 In `src/persistence/sessionContext.ts`: pass `header.overallFrameIdentifier` through to both insert calls in `handleCarTelemetryPacket` and `handleMotionPacket`. (depends on T006, T007)
- [X] T009 [P] New test `src/persistence/carTelemetrySampleRepository.test.ts`, using T005's helper: inserting the same `(sessionId, overallFrameIdentifier)` twice adds one row, not two; two rows with `overallFrameIdentifier` omitted (`NULL`) coexist without error (verified against real `better-sqlite3` behaviour, matching research.md point 1's check). (depends on T005, T006)
- [X] T010 [P] Same two cases in a new `src/persistence/motionSampleRepository.test.ts`, using T005's helper. (depends on T005, T007)
- [X] T011 [P] New `src/replay/types.ts`: `ReplaySpeed = "1x" | "2x" | "max"`, `ReplayOptions { speed: ReplaySpeed; loop: boolean }`, `RecordedPacket { timestampMs: number; data: Buffer }` (per data-model.md).
- [X] T012 New `src/replay/scheduler.ts`: pure `computeDelayMs(targetOffsetMs: number, elapsedMsSincePassStart: number, speed: ReplaySpeed): number` — `"1x"`/`"2x"` divide the remaining offset by the speed multiplier; `"max"` always returns `0`. No I/O, no timers. (depends on T011)
- [X] T013 [P] New `src/replay/scheduler.test.ts`: unit tests for `computeDelayMs` across `"1x"`, `"2x"`, `"max"`, zero offset, and an offset already in the past (must not return negative). (depends on T012)
- [X] T014 New `src/replay/runner.ts`: `runReplay(packets: RecordedPacket[], options: ReplayOptions, io): Promise<{ packetsSent: number; passes: number }>` for a **single pass only** (loop comes in US3) — `io: { send(buf: Buffer): void; now?(): number; wait?(ms: number, signal?: AbortSignal): Promise<void> }`, defaults `now = Date.now`, `wait` = `node:timers/promises`'s `setTimeout` (abortable). Each packet's send time is an absolute deadline (`passStartTime + offsetMs/speedMultiplier`), not a chained relative wait, so error does not accumulate (FR-004). (depends on T011, T012)
- [X] T015 [P] New `src/replay/testFixtures.ts`: a small synthetic `RecordedPacket[]` builder, mirroring `src/analysis/testFixtures.ts`'s convention — plain packets with explicit `overallFrameIdentifier`/`timestampMs` values, no dependency on anything outside `src/replay/`. Used by US1's single-pass integration test (T019) as-is. **Not** the loop-specific, threshold-guarded fixture — that one depends on `PASS_RESTART_THRESHOLD_FRAMES`, which doesn't exist until T022 (US3), and is built in T026 instead.
- [X] T016 [P] Add `src/replay/*.test.ts` to the `test` script glob in `package.json`, alongside the existing three folders.

**Checkpoint**: schema migrated and deduplicating, test isolation in place, pacing math ready — user story work can begin.

---

## Phase 3: User Story 1 - Replay a recording at its original speed (Priority: P1) 🎯 MVP

**Goal**: `npm run replay -- <file>` re-sends every packet at the pace it was recorded, with none dropped for lack of receive capacity, and the stored laps/samples match the recording.

**Independent Test**: replay the Interlagos example recording against a fresh database; compare stored laps and sample counts against the recording's own content (spec.md's own Independent Test for this story).

- [X] T017 [P] [US1] New `src/replay/runner.test.ts`: unit tests for `runReplay`'s single-pass behaviour with an injected fake `now`/`wait` — packets sent in file order (FR-005) even for packets sharing an offset, absolute-deadline scheduling stays within the 2% bound over a simulated multi-minute span (FR-004) without drifting. (depends on T014)
- [X] T018 [US1] Rewrite `tools/replayer.ts` as a thin CLI: read the whole file into `RecordedPacket[]` upfront; skip and log (not abort on) an unparsable line (FR-008); validate before sending anything — missing path, unreadable file, zero parseable lines all exit non-zero with a message naming the problem (FR-007, file-related cases only; speed validation comes in US2); call `runReplay(packets, { speed: "1x", loop: false }, io)` with a real `dgram` socket as `send`; print the start report (file, speed, loop=false, packet count, recording duration) and the end report (packets sent, passes=1) per `contracts/replay-cli.md`; wire `SIGINT`/`SIGTERM` to an `AbortController` passed as `io.wait`'s signal so an interruption mid-wait exits cleanly and still prints the end report (FR-009). (depends on T014, T017)
- [X] T019 [US1] New `src/replay/replayIntegration.test.ts`, using T005's helper (`setupIsolatedTestDb()`/`teardownIsolatedTestDb()`), then its own `require()` of the dispatcher/`persistTelemetry`/repositories: starts `startUdpListener(0, ...)` + the real dispatcher/`persistTelemetry` (no HTTP/WS); replays the T015 fixture once via `runReplay`; asserts the resulting lap count and per-distance sample count match what the fixture itself should produce; `after()` calls `teardownIsolatedTestDb()` regardless of pass/fail. (depends on T005, T008, T014, T015)

**Checkpoint**: US1 complete and independently testable — this alone is the MVP.

---

## Phase 4: User Story 2 - Choose the replay speed (Priority: P2)

**Goal**: `--speed=1x|2x|max` picks the pace; an unsupported value is rejected before anything is sent.

**Independent Test**: replay the same recording three times, once per speed, and compare each run's elapsed time against the recording's own duration (spec.md's own Independent Test).

- [X] T020 [US2] Extend `tools/replayer.ts`: parse `--speed` (accepted values `1x`, `2x`, `max`; default `1x` when absent); reject any other value before sending any packet, with a message listing the three accepted values (FR-007's speed-validation case); pass the parsed speed through to `runReplay`; log a one-line warning when `max` is selected, naming it as lossy by design. (depends on T018)
- [X] T021 [P] [US2] Extend `src/replay/runner.test.ts` with `"2x"` (half the `"1x"` delay) and `"max"` (zero delay for every packet) cases. (depends on T017) — **already done as part of T017**: writing comprehensive speed coverage made more sense at the time than artificially restricting it to `"1x"` only. No new test added here.

**Checkpoint**: US1 and US2 both independently functional.

---

## Phase 5: User Story 3 - Loop a recording for the public demo (Priority: P3)

**Goal**: `--loop` restarts the recording from the top on reaching its end, laps are overwritten pass over pass, and no new per-distance sample rows appear after the first pass.

**Independent Test**: start a looped replay, confirm the dashboard keeps receiving updates past the first pass's end, and watch what the stored data does over several passes (spec.md's own Independent Test).

- [X] T022 [US3] In `src/persistence/sessionContext.ts`: add `maxOverallFrameId: number` to `ActiveSession`; export `PASS_RESTART_THRESHOLD_FRAMES = 100` as a named, documented constant (same pattern as `MIN_DISTANCE_DELTA_M`/`MAX_TIME_GAP_MS` in `decimation.ts`); at the top of `getActiveSession`, if `header.overallFrameIdentifier < maxOverallFrameId - PASS_RESTART_THRESHOLD_FRAMES`, reset `lapDetector` (fresh `createLapCompletionDetector()`), `lapProgress`, `carTelemetryDecimation`/`carTelemetryDecimationLap`, and `motionDecimation`/`motionDecimationLap` to their just-created-session values, **preserving** `sessionId`, `trackId`, `lastTouchedAt`; log the detected restart; otherwise update `maxOverallFrameId` to the running max. (depends on T008)
- [X] T023 [P] [US3] New `src/persistence/sessionContext.test.ts`: three cases, per the project's own stated conditions — a small regression (at or below the threshold) does not reset; a drop larger than the threshold resets `lapDetector`/`lapProgress`/both decimation states while `sessionId`/`trackId` are unchanged; a flashback-shaped input (`frameIdentifier` and `sessionTime` go backward, `overallFrameIdentifier` does not) does not reset. (depends on T022)
- [X] T024 [US3] Extend `src/replay/runner.ts`: when `options.loop` is true, restarting from the first packet on reaching the end of `packets`, incrementing a pass counter and invoking an `onPass(passNumber)` callback, continuing until the wait is aborted; an abort mid-pass still resolves with the correct `packetsSent`/`passes` so far (FR-009). (depends on T014)
- [X] T025 [US3] Extend `tools/replayer.ts`: parse `--loop` (default off); pass through to `runReplay`; the end report states packets sent and passes completed even when stopped by `SIGINT` mid-pass. (depends on T018, T020, T024)
- [ ] T026 [US3] Add a loop-specific fixture to `src/replay/testFixtures.ts`: `overallFrameIdentifier` running **1000→1160** (span 160, chosen with explicit margin, not just-barely-clearing), a handful of packets across that range, `timestampMs` a few ms apart; the fixture asserts its own span exceeds `PASS_RESTART_THRESHOLD_FRAMES` (now importable from `sessionContext.ts`, exported by T022) so a future edit that shrinks it fails loudly instead of silently skipping the loop-boundary reset path it exists to exercise. Then extend `src/replay/replayIntegration.test.ts`: loop this fixture for 2 passes; assert the second pass's sample count equals the first pass's (zero new rows — FR-010+FR-011 together) and that the laps are still correctly reported after the restart. (depends on T015, T019, T022, T024)

**Checkpoint**: all three user stories independently functional; a looped demo run is bounded.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: the measured numbers this plan promised instead of inherited/stale ones, and the documentation that uses them.

- [X] T027 Repeat the baseline measurement (research.md point 6 / quickstart.md step 6): identical procedure to T001, with `npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl --speed=1x` (now available) in place of today's unpaced-only run; record the post-fix percentage; compare against T001's. (depends on T018, T020) — **done ahead of US2/US3**: `1x` is already the default from T018, so T020's flag parsing wasn't actually needed to measure it. Result: 2,411/2,411 (100%), recorded in baseline-measurement.md.
- [ ] T028 [P] Update `README.md` (research.md point 5): rewrite the "Running without the game" replay prose and the "Fast replay loses most samples" / "Replaying the same recording twice" known-limitations bullets using T001's and T027's measured numbers, not the spec's illustrative ones; remove "Next steps" item 1 (shipped) into the "Recorder and replayer" Features bullet; add the new known limitation — a recording whose own `overallFrameIdentifier` span is at or below `PASS_RESTART_THRESHOLD_FRAMES` does not restart correctly when looped. (depends on T027)
- [ ] T029 [P] Update `CLAUDE.md` (research.md point 5): the matching "Known pitfalls" edits with the same two measured numbers and the same new short-recording-loop bullet; update the Commands table's replay line to `npm run replay -- recordings/<file>.jsonl [--speed=1x|2x|max] [--loop]`; add a line under the `src/persistence/` Architecture row and a Conventions bullet documenting the `overallFrameIdentifier` dedup key. (depends on T027)
- [ ] T030 Run `npx tsc --noEmit` and `npm test`; confirm both pass with no failures reported, per the project's own pre-commit rule.
- [ ] T031 Walk through `quickstart.md` steps 1–5 manually against the real Interlagos recording, confirming the dashboard stays live during a paced replay (SC-004) and a looped run holds for 30+ passes without growth (SC-005).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: no dependencies, but blocks everything — it must measure today's *unmodified* behaviour.
- **Foundational (T002–T016)**: depends on T001. Blocks all user stories.
- **US1 (T017–T019)**: depends on Foundational. No dependency on US2/US3.
- **US2 (T020–T021)**: depends on Foundational and on T018 (extends the same CLI file US1 created). Independently testable once present.
- **US3 (T022–T026)**: depends on Foundational, and on T014/T018 (extends the same runner/CLI). Independently testable once present; does not require US2.
- **Polish (T027–T031)**: depends on all three stories (the baseline comparison and docs need the finished `--speed=1x` path; the loop-limitation doc bullet needs US3).

### Within Each User Story

- US1: tests (T017) before/alongside the CLI rewrite (T018) they exercise; the integration test (T019) last.
- US2/US3: both extend files US1 already created (`tools/replayer.ts`, `src/replay/runner.ts`) rather than creating new ones — expect small, sequential diffs to those files, not parallel edits.

### Parallel Opportunities

- Setup has a single task (T001) — nothing to parallelize, and nothing else may start until it's done.
- Within Foundational: T002/T003 (different files) in parallel; T006/T007 (different repositories) in parallel; T009/T010 (different test files, both depending on T005) in parallel; T011/T013/T015/T016 in parallel once their own dependency (T012) is done.
- Within US1: T017 can be written alongside T018 (different files); T019 depends on both being conceptually settled.
- T021 (US2) and T023 (US3) are independent of each other and of T028/T029 (Polish docs), which are independent of each other.

---

## Parallel Example: Foundational phase

```bash
# Once T001 (baseline) is done, these can run together:
Task: "Add DB_PATH override in src/config/env.ts"
Task: "Add overall_frame_identifier column to both sample tables in src/persistence/schema.ts"

# After T004/T005/T006/T007 land:
Task: "Dedup unit test in src/persistence/carTelemetrySampleRepository.test.ts"
Task: "Dedup unit test in src/persistence/motionSampleRepository.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 only)

1. T001 (baseline measurement — mandatory, must precede any code change).
2. Foundational (T002–T016).
3. US1 (T017–T019).
4. **Stop and validate**: run `src/replay/replayIntegration.test.ts`'s US1 case and `quickstart.md` step 2 by hand against the real recording.
5. This is already a usable, demoable fix for the sample-loss defect (SC-001/SC-002/SC-006), even before speed selection or looping exist.

### Incremental Delivery

1. Setup + Foundational → pacing/dedup/test-isolation foundation ready.
2. Add US1 → original-speed replay works end-to-end → demoable.
3. Add US2 → speed choice.
4. Add US3 → loop mode, the public-demo capability that motivated the feature.
5. Polish → real measured numbers in the docs, known limitations updated, full validation pass.

## Notes

- [P] tasks touch different files and have no unmet dependency.
- Tests are included per the constitution's rule for new pure logic and FR-013's explicit requirement; write them alongside (not strictly before) the implementation task they exercise, consistent with the project's existing flat `test()`/synthetic-fixture style.
- Commit after each task or small logical group, `npm test`/`tsc --noEmit` clean, per the project's pre-commit rule — do not batch uncommitted work across phases.
- T001 and T027 are the two points in this plan that touch `data/telemetry.db` destructively (backup/restore around them) — treat them with the same care as any other action that could discard real data. T005's helper exists precisely so no *other* task has to.
