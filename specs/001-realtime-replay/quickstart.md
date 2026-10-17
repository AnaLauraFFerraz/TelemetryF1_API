# Quickstart: validating real-time replay

Prerequisites: `npm install` already run; `.env` configured (`WS_PORT`, `UDP_PORT`, `HTTP_PORT`); the Interlagos example recording present at `recordings/demo-interlagos-tt-20hz-laps6-8.jsonl` (13,960 packets, 222,839 ms, not committed to the repo — see spec's Assumptions).

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
- The per-lap sample count (`GET` the lap detail endpoint, or query `car_telemetry_samples`/`motion_samples` directly) is within 2% of what `shouldPersistSample` predicts for this recording — not the 21–33% the unpaced tool left before this feature.

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
