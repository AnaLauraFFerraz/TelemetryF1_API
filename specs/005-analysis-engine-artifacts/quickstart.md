# Quickstart: verifying the corrected engine

No paid call; `data/telemetry.db` is never opened. Every command that loads the dotenv configuration runs with `DOTENV_CONFIG_PATH` pointing at a `.env` with no key and no ports, outside the repository, after this check printed `false`:

```bash
DOTENV_CONFIG_PATH=<scratch>/empty.env node -r dotenv/config -e "console.log(Boolean(process.env.ANTHROPIC_API_KEY))"
```

## A. Automated

```bash
npm test          # synthetic property tests + the recording cut's property tests and size ceiling
npm run typecheck
```

Expected: all pass with no key and no database. The cut's tests check, for (6,7), (6,8), (7,8) and their reverses: the same corners both ways; every difference and `deltaLossS` antisymmetric within 0.01 + 1e-9; `totalDeltaS` within 0.045 s of the official difference; no two corners sharing a sample; the file under 660,000 bytes.

## B. The six pairs from the published recording

1. Download the recording (README, "sample-recording-v1") and check its SHA-256 is `c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033`.
2. Build a temporary database (`DB_PATH` in a scratch folder):

   ```bash
   DB_PATH=<scratch>/q005.db TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register \
     specs/005-analysis-engine-artifacts/evidence/buildResearchDb.ts recordings/demo-interlagos-tt-20hz-laps6-8.jsonl <scratch>/raw.json
   ```

   Expected: 1 session, laps 6–8 with 74,306 / 74,144 / 73,372 ms, 2,411 car telemetry and 2,411 motion samples.
3. For each pair, `DB_PATH=<scratch>/q005.db npm run analyze -- 1 <lapA> <lapB>` and record the insights in research.md ("after"), next to the "before" of section 2–6. Expected: eight corners in every pair, the same in both directions; T1's braking differences in the tens of metres, not 180–190; `null` with a `false` boolean where a lap only lifted (T2, ~2,120 m, ~2,490 m).
4. Read the coach messages printed by `analyze` for (8,6) and (8,7), the pairs the demo shows, before spec 003 regenerates the seed.

## C. Regenerating the cut

```bash
DB_PATH=<scratch>/cut.db node -r ts-node/register tools/exportRecordingCut.ts recordings/demo-interlagos-tt-20hz-laps6-8.jsonl
git diff --stat src/analysis/recordingCut.json     # expected: no change
```

## D. The cache rule

With a temporary database holding a cached row whose insights differ from the recomputed ones: without the key, `POST /sessions/1/analysis` answers 503; covered by the resolver's tests with a fake coach (no manual paid check).
