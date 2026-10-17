# Baseline measurement (T001)

Measured 2026-10-17, against the published recording `recordings/demo-interlagos-tt-20hz-laps6-8.jsonl` (downloaded from the [sample-recording-v1 Release](https://github.com/AnaLauraFFerraz/TelemetryF1_API/releases/tag/sample-recording-v1); 25.2 MB, 13,960 packets, 222.8 s), **before any implementation code for this feature changed anything** — the replayer used here is today's unmodified `tools/replayer.ts` (unpaced, the only mode that exists at this point).

## Method

Two counts, same recording, same empty starting database:

1. **"Actual" — today's real UDP path.** `npm run dev` (unmodified code) + `npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl`, then the resulting row counts in `data/telemetry.db`.
2. **"Ground truth" — the same recording fed through the real parsing/persistence code in-process, with no UDP socket involved**, so nothing can be dropped for lack of receive capacity (research.md point 6's reasoning: this is the only honest denominator, since measuring it over real UDP a second time would just be measuring the same loss twice). A throwaway script (not committed — written, run, and deleted as part of this task) called `src/telemetry/dispatcher`'s `dispatchPacket` and `src/persistence/persistTelemetry` directly for every line of the recording, against the same schema.

`data/telemetry.db` (plus its `-wal`/`-shm` sidecars) was backed up before this measurement and restored byte-for-byte after — confirmed by comparing row counts before backup and after restore.

## Commands run

```bash
cp data/telemetry.db data/telemetry.db.baseline-backup
cp data/telemetry.db-wal data/telemetry.db-wal.baseline-backup
cp data/telemetry.db-shm data/telemetry.db-shm.baseline-backup
rm -f data/telemetry.db data/telemetry.db-wal data/telemetry.db-shm

npm run dev &                                                              # today's unmodified code
npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl         # today's only mode: unpaced
# (stopped the dev server, counted rows — see Results)

rm -f data/telemetry.db data/telemetry.db-wal data/telemetry.db-shm
npx ts-node tools/_baseline-ground-truth.ts recordings/demo-interlagos-tt-20hz-laps6-8.jsonl   # throwaway, not committed
# (counted rows, then deleted the script)

rm -f data/telemetry.db data/telemetry.db-wal data/telemetry.db-shm
mv data/telemetry.db.baseline-backup data/telemetry.db
mv data/telemetry.db-wal.baseline-backup data/telemetry.db-wal
mv data/telemetry.db-shm.baseline-backup data/telemetry.db-shm
```

## Results

Laps, times, sectors and validity matched the recording's own published metadata exactly in **both** runs (lap 6: 1:14.306, invalid; lap 7: 1:14.144, valid; lap 8: 1:13.372, valid) — confirming the existing "laps survive a fast replay" claim still holds.

| | Actual (today's UDP path) | Ground truth (in-process, no UDP) | Baseline % |
|---|---|---|---|
| `car_telemetry_samples` | 354 | 2,411 | **14.68%** |
| `motion_samples` | 350 | 2,411 | **14.52%** |
| Combined | 704 | 4,822 | **14.60%** |

**Baseline: ~14.6% of samples survive today's unpaced replay of this recording — a loss of ~85.4%.**

This number is *not* the spec's inherited "21–33%" figure (SC-001 no longer quotes that number for exactly this reason — see spec.md and research.md point 6) and is not expected to match it: that figure came from an untraceable, different test recording (the old README mentioned "64,412 packets" / "7.3 minutes," which doesn't correspond to this 13,960-packet / 222.8 s file). This measurement is specific to `demo-interlagos-tt-20hz-laps6-8.jsonl`, reproducible by anyone who runs the commands above against that exact file, and is what SC-001's "up from the baseline measured..." now points to.

T026 repeats this same procedure once `--speed=1x` exists, for the after-the-fix comparison that goes into the README/CLAUDE.md edits (research.md point 5, T027/T028).
