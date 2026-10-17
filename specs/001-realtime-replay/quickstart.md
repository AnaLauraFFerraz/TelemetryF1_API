# Quickstart: validating real-time replay

Prerequisites: `npm install` already run; `.env` configured (`WS_PORT`, `UDP_PORT`, `HTTP_PORT`); the Interlagos example recording downloaded to `recordings/demo-interlagos-tt-20hz-laps6-8.jsonl` (13,960 packets, 222,839 ms) from the published Release — see README.md's "Running without the game."

## 0. Baseline measurement — run once, *before* any implementation task touches `src/` (research.md point 6)

```bash
cp data/telemetry.db data/telemetry.db.baseline-backup 2>/dev/null       # skip if the file doesn't exist yet — note that
cp data/telemetry.db-wal data/telemetry.db-wal.baseline-backup 2>/dev/null
cp data/telemetry.db-shm data/telemetry.db-shm.baseline-backup 2>/dev/null
rm -f data/telemetry.db*                                                 # start from a known-empty database
npm run dev &                                                            # terminal A, today's unmodified code
npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl       # terminal B, today's only mode: unpaced
# wait a few seconds for the receive buffer to drain, then:
sqlite3 data/telemetry.db "SELECT COUNT(*) FROM car_telemetry_samples;"  # "actual" count
# compute "ground truth" separately: feed the same file through the real
# dispatcher/persistTelemetry in-process (no UDP socket), per research.md
# point 6, against a disposable DB_PATH — write down actual ÷ ground-truth
kill %1                                                                   # stop npm run dev
rm -f data/telemetry.db*
mv data/telemetry.db.baseline-backup data/telemetry.db 2>/dev/null       # restore, or leave absent if there was none
mv data/telemetry.db-wal.baseline-backup data/telemetry.db-wal 2>/dev/null
mv data/telemetry.db-shm.baseline-backup data/telemetry.db-shm 2>/dev/null
```

Write down the resulting baseline percentage — it, not the spec's illustrative "21–33%", is what SC-001 is measured against and what the README/CLAUDE.md task in research.md point 5 quotes.

## 1. Automated checks

```bash
npx tsc --noEmit
npm test
```

`npm test` now also runs `src/replay/*.test.ts` (pure `computeDelayMs`, `runReplay` with an injected fake clock, and the synthetic end-to-end integration test against a disposable database and an OS-assigned port — see [research.md](research.md) point 4) and the new `sessionContext` pass-restart tests in `src/persistence/`. All should complete in a few seconds; none requires the game or the multi-minute example recording.

## 2. Manual validation against the example recording (US1 — original speed)

```bash
rm -f data/telemetry.db*          # start from a known-empty database
npm run dev &                     # terminal A
npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl    # terminal B, --speed defaults to 1x
```

Expect (SC-001, SC-003, SC-006):
- The start report states speed `1x`, no loop, 13,960 packets, ~222,839 ms duration.
- The replay takes approximately 3 min 43 s (within 2%).
- `GET /sessions` (via curl or the frontend) shows one session with laps 6–8, correct times/sectors/validity.
- The per-lap sample count (`GET` the lap detail endpoint, or query `car_telemetry_samples`/`motion_samples` directly) is within 2% of what `shouldPersistSample` predicts for this recording — not the baseline percentage measured in step 0 before this feature.

## 3. Speed options (US2)

```bash
npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl --speed=2x    # ~1 min 52 s (SC-003)
npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl --speed=max   # today's old behaviour, warned as lossy
npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl --speed=3x    # rejected before any packet is sent (FR-007)
```

## 4. Loop mode for the public demo (US3)

```bash
npm run dev &
npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl --loop
```

- Open the dashboard (or connect a plain WebSocket client) partway through the first pass; confirm live updates keep arriving (SC-004).
- Let it run past the first pass boundary. Confirm (research.md point 2):
  - A "pass restart detected" log line appears once per loop.
  - Laps 6–8 are re-reported (overwritten, same `lap_number`, same `session_id` — check `laps` table row count stays at 3 for this session, not growing).
  - The per-distance sample count stops growing after the first pass (`SELECT COUNT(*) FROM car_telemetry_samples WHERE session_id = ?` taken once after pass 1 and again after pass 3 should match, per SC-002/SC-005).
- `Ctrl+C` mid-pass: process exits promptly (FR-009) and prints the end report (packets sent, passes completed).

## 5. Re-running the same recording (FR-010)

```bash
npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl   # run once
npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl   # run again, same database
```

The second run's sample counts must be identical to the first (SC-002: zero new rows), confirmed the same way as step 4.

## 6. Baseline measurement, repeated after the fix (research.md point 6)

Same backup/measure/restore procedure as step 0, with one change: the replay command in the middle uses `--speed=1x` (now available) instead of today's only, unpaced mode. The resulting percentage is compared against step 0's: SC-001's "at least 99%, up from 21–33%" is only true once both numbers are the *measured* ones from steps 0 and 6, not the spec's illustrative figures. These two numbers are what go into the README.md/CLAUDE.md edits from research.md point 5.
