---

description: "Task list for spec 005, fixing the analysis engine's artifacts"
---

# Tasks: Fix the analysis engine's artifacts

**Input**: Design documents from `specs/005-analysis-engine-artifacts/`

**Prerequisites**: spec.md, plan.md (decisions D1–D9, options O1–O5 decided on 2026-10-25), research.md (sections 0–15), data-model.md, contracts/ (`insights.md`, `coach-reading.md`) and quickstart.md are present, committed in `a9b0e2f`.

**Tests**: requested (TDD).

- **Pure functions** go through three separate tasks, always in this order: (1) **stub**: the module with the final signature and a body that returns a wrong value of the right type (never a missing export, never a thrown "not implemented"); (2) **red**: the test written and run with `npm test`, seen failing **on its own `assert`** (an import error, a type error or a throw does not count as red; if it fails any other way, fix the stub, not the test); the failing output is quoted in the task's note when it is ticked; (3) **green**: the implementation, until the suite passes.
- An existing test whose expectation this feature changes (old semantics) is updated in the red task of the function it covers, and seen failing on its assertion, like a new one.
- **The recording cut comes first** (Phase 3). Each engine phase then adds the cut's properties it makes true to `src/analysis/recordingCut.test.ts` in its red task, where they fail on their assertions against the engine as it is before that phase, and pass at its green task. **If a property already passes against the previous engine**, its red cannot be shown: **[PARADA]**, and the maintainer decides where it moves.
- **Tolerances are fixed** (plan D6, research.md section 14): corners identical both ways; differences, losses and the total's two directions within 0.01 + 1e-9; `totalDeltaS` within 0.045 s of the official difference; the cut at most 660,000 bytes. No task changes them (FR-014); a property failing for a reason the design did not foresee is a **[PARADA]**, never a wider tolerance.
- **No task changes the frontend repository** (`Telemetry-F1`); it is only read. What the frontend spec has to do is listed under "Outside this feature's tasks".
- The one exception to stub/red/green is `insightsMatch`, brought **unchanged** from `003-demo-mode` with its own tests (T003–T004): its tests are seen passing against it, and the task says so.
- A test that fails by design is committed together with the code that makes it pass, never alone, so no commit has a red suite (constitution, "Development Workflow").
- Tests in `src/analysis/` use synthetic data (`src/analysis/testFixtures.ts`) or the versioned cut (`src/analysis/recordingCut.json`); they open no database. Tests that need a database use `src/persistence/testDb.ts`. **No task opens, writes, copies or points anything at `data/telemetry.db`** (CLAUDE.md, Rules); this feature has no schema change and no migration.
- No test can make a paid call: the coach is always a fake in tests.
- **No process the agent starts can see the maintainer's key.** The repository's `.env` holds `ANTHROPIC_API_KEY`. Every command the agent runs that loads the dotenv configuration (`npm test`, `npm run typecheck`, `npm run analyze`, any `node -r ts-node/register` script) runs with `DOTENV_CONFIG_PATH` pointing at the scratch `keyless.env` of T001 (outside the repository, no key and no ports: `src/config/serverFailFast.test.ts` fails if ports reach `npm test`). **Before** each command, in the same environment, `node -r dotenv/config -e "console.log(Boolean(process.env.ANTHROPIC_API_KEY))"` must print `false`; if it prints `true`, nothing is run (**[PARADA]**). The value of a key or the content of any `.env` is never printed. Nothing in this feature needs `npm run dev` or `npm run replay`: databases are built in-process by `evidence/buildResearchDb.ts` or by the cut tool.

**Commits**:

- Small Conventional Commits, English subject, types only from the constitution's closed list (`feat`, `fix`, `docs`, `test`, `chore`, `ci`), **no `Co-Authored-By` trailer**, and no "Generated with" footer (or any attribution line) in the pull request body, even if a session reminder asks for one.
- `npm test` and `npm run typecheck` pass before every commit (after the key check); a failure is reported, never committed around.
- `README.md` and `CLAUDE.md` change **in the same commit as the behaviour they describe**; each commit task lists the lines it touches (line numbers at `a9b0e2f`, re-read before editing). A limitation fixed is removed from both files, one found is added to both.
- Text files are edited only with the Edit and Write tools, never with shell commands.
- The sequence: commit 1 (plan, `a9b0e2f`) and commit 2 (this file) are `docs:`; then commits 3–10 below. It differs from plan.md's proposed order in one point, stated here: the recording cut (plan's commit 7) moves before the engine changes (commit 4), so the engine's properties are seen red on real laps.

**Markers**:

- **[MANUAL]**: done by the maintainer, not by the agent; each says what the maintainer hands back.
- **[PARADA]**: the session stops and waits for the maintainer, at every manual task, before every push, before opening the pull request, before editing its body, before marking it ready and before the merge (which is the maintainer's), and at every conditional stop listed. The agent never pushes, opens or changes the pull request, or merges without the maintainer's explicit go-ahead for that specific action.

**Pull request and CI** (one pull request for the whole feature, to `main`):

- Opened **as a draft at the first push** (T030); marked ready only at T062. The spec's status line "Implemented; pull request #n" is set in the pull request itself, before the merge (T060).
- After **every** push the CI is awaited and confirmed through the jobs API: `gh run list --branch 005-analysis-engine-artifacts --limit 1 --json databaseId,headSha,event,status,conclusion`, then `gh run watch <databaseId> --exit-status`, then `gh api repos/AnaLauraFFerraz/TelemetryF1_API/actions/runs/<databaseId>/jobs --jq '.jobs[] | [.name, .status, .conclusion, .started_at, .completed_at] | @tsv'`. A run counts as green only with both jobs `completed` and `success`. The row (push, head SHA, run id, event, `typecheck`, `test`) goes into a "CI runs" table at the end of research.md, committed with the next group of changes; the last push's row goes into the pull request body (T061).
- **CI red**: the cause is diagnosed from the job log (`gh run view <id> --log-failed`), fixed in its own commit, and pushed after its own **[PARADA]**. A re-run (`gh run rerun <id> --failed`) only for an infrastructure failure (runner, network, GitHub outage), stated as such in the "CI runs" table; never to get past a real failure.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel: different files from every task it could run alongside, and no dependency on an incomplete task.
- **[Story]**: US1–US3 from spec.md. Setup, Foundational and Polish tasks carry no story label.
- Every task names its file(s), the FRs it serves and the plan decision it follows ("D1"–"D9" = plan.md "Design decisions"; "O1"–"O5" = plan.md "Options", decided; "R§n" = research.md section n).

---

## Phase 1: Setup

- [x] T001 Baseline, read-only, on branch `005-analysis-engine-artifacts` at `a9b0e2f` or later: `node -v` is v22.x (`fnm use` if not); `git status` clean; create the scratch `keyless.env` (in the session's scratch folder, outside the repository; a comment only, no variables; nothing is read from the repository's `.env`); with `DOTENV_CONFIG_PATH` pointing at it, the key check prints `false`; `npm run typecheck` passes and `npm test` reports 190 tests, 190 passing; `recordings/demo-interlagos-tt-20hz-laps6-8.jsonl` exists and its SHA-256 is `c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033`. No file changes. If any check differs, **[PARADA]** and report.
- [x] T002 Commit 2: this file, `docs: list the tasks of spec 005`, after the key check, `npm test` and `npm run typecheck`. (Already committed as `4d44fd4` before the implementation session; nothing to commit.)

**User Story 1** (each suspect number classified before anything is changed, P1) was delivered before this file: the investigation (research.md sections 0–9, `evidence/`), its verdicts approved by the maintainer on 2026-10-25, committed in `a9b0e2f` (FR-001–FR-005, FR-011a, FR-013a; SC-001). Every correction below traces to an "engine artifact" verdict (research.md, "Summary of verdicts"); none to an unconfirmed one.

---

## Phase 2: Foundational — `insightsMatch` on `main` — commit 3

Needed by the staleness rule (Phase 9); nothing runs it until then, so no documentation changes here.

- [x] T003 Read `003-demo-mode:src/demo/insightsMatch.ts` and `003-demo-mode:src/demo/insightsMatch.test.ts` with `git show` (read only; no checkout of that branch). Write their content **unchanged** to `src/coaching/insightsMatch.ts` and `src/coaching/insightsMatch.test.ts` with the Write tool (the test imports `./insightsMatch`, which stays valid; if any change to the code or the tests turns out to be needed, **[PARADA]**: it is a deviation). Compare each new file with its source (`git show 003-demo-mode:src/demo/insightsMatch.ts | diff - src/coaching/insightsMatch.ts`, same for the test) and quote "no difference" in the note. (FR-018; D7)
- [x] T004 Run `npm test`: the ported tests pass against the ported function (the header's exception: code and tests arrive together, unchanged); quote the count. Commit 3: `feat: bring insightsMatch to main for the cache staleness rule`, body: "Copied unchanged from src/demo/insightsMatch.ts on branch 003-demo-mode (spec 003), with its tests, into a module outside src/demo/ so the local analysis cache can use the same tolerance rule as the demo's seed file. Spec 003 imports it from here when it is updated with main." (FR-018; D7)

---

## Phase 3: the recording cut — commit 4

**Goal**: real whole laps in the CI, generated reproducibly, under a size ceiling (FR-015a, FR-015c, SC-006a; D8).

**Independent test**: `npm test` finds `src/analysis/recordingCut.json` with the published recording's hash, laps 6–8 and their official times, under 660,000 bytes; regenerating it gives the same file.

- [x] T005 [US3] Stub `src/analysis/recordingCutFormat.ts` (pure): `toRecordingCut(input: RecordingCutInput): string` (returns `"{}"`) and `fromRecordingCut(json: string): RecordingCutInput` (returns `{ sourceSha256: "", laps: [] }`), with `RecordingCutInput = { sourceSha256: string; laps: { lapNumber: number; lapTimeMs: number; isValid: boolean; telemetry: TelemetrySample[]; motion: MotionSample[] }[] }`. (FR-015a; D8)
- [x] T006 [US3] Red in `src/analysis/recordingCutFormat.test.ts` (new) — *seen failing: all 6 tests `not ok` with `code: 'ERR_ASSERTION'`, none by import, type or throw (e.g. test 1 `Expected values to be strictly equal … expected: 1 … operator: 'strictEqual'`; test 2 `expected: 'abc123'`; test 4 `actual: '{}' … operator: 'match'`); the field-access grep of `src/analysis/` (non-test files) finds telemetry `lapDistance, sessionTime, speed, throttle, brake, steer, tyreSurfaceTemp` and motion `lapDistance, worldPosition.x, worldPosition.z`, nothing else, matching the list below*: only the fields the engine reads are written — data-model.md "Recording cut": telemetry `lapDistance, sessionTime, speed, throttle, brake, steer, tyreSurfaceTemp` (four wheels), motion `lapDistance, worldPosition.x, worldPosition.z` — checked against a grep of the field accesses in `src/analysis/` (quoted in the note; if the engine reads another field, **[PARADA]**); numbers written with 9 significant digits, and `Math.fround` of every parsed number equals the float32 input (lossless, R§13); integers written as integers; `fromRecordingCut(toRecordingCut(x))` gives back samples the engine accepts, the fields it does not read filled with 0; the output is byte-identical for the same input. Seen failing on the assertions. (FR-015a; D8)
- [x] T007 [US3] Green in `src/analysis/recordingCutFormat.ts`. Suite green. (FR-015a; D8) *(`fromRecordingCut` applies `Math.fround` to every number it reads, so the engine sees the same doubles it reads from the database.)*
- [x] T008 [US3] Red — *seen failing on the existence assertion: `error: 'src/analysis/recordingCut.json não existe; gere com tools/exportRecordingCut.ts'`, `code: 'ERR_ASSERTION'`, `expected: true, actual: false, operator: '=='`, both tests*: `src/analysis/recordingCut.test.ts` (new) checks `fs.existsSync` first, then that `src/analysis/recordingCut.json` has `sourceSha256 === "c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033"`, laps 6, 7, 8 with `lapTimeMs` 74306, 74144, 73372 and `isValid` false, true, true, 797 / 801 / 793 telemetry and motion samples, and at most **660,000 bytes** (D8). Seen failing on the existence assertion (the file does not exist yet). (FR-015a; D8)
- [x] T009 [US3] — *done: first run into `cut1.db`, second into a new `cut2.db`, the two files are byte-identical (`cmp`; SHA-256 `22a774c1…e55e`), T008 passes; **size 643,689 bytes** (under the 660,000 ceiling; the 600,523 of research §13 had `x`/`z` flat, the data-model layout nests them in `worldPosition`, about 40 KB more, so the margin is 2.5%, not 10%); the tool refuses a missing `DB_PATH`, `data/telemetry.db` and an existing file, checked before any repository import* — Write `tools/exportRecordingCut.ts`: argument `<recording.jsonl>`; refuses to run unless `DB_PATH` is set and does not resolve to `data/telemetry.db` (the check of `evidence/buildResearchDb.ts`); computes the recording's SHA-256; ingests it in-process through `dispatchPacket` + `persistTelemetry` (as `evidence/buildResearchDb.ts` does); reads laps 6–8 through the repositories; writes `src/analysis/recordingCut.json` with `toRecordingCut`; prints the hash, the per-lap counts and the file size. After the key check: `DB_PATH=<scratch>/cut1.db node -r ts-node/register tools/exportRecordingCut.ts recordings/demo-interlagos-tt-20hz-laps6-8.jsonl`; then the same into a new `<scratch>/cut2.db`, and `git diff --stat src/analysis/recordingCut.json` against the first run's file shows no change (reproducible, SC-006a). T008 passes; quote the size. Above 660,000 bytes: **[PARADA]** (the ceiling is not raised without the maintainer). (FR-015a, FR-021; D8)
- [x] T010 [US3] Commit 4: `test: version a cut of the published recording for the engine's property tests`. Same commit: `CLAUDE.md` Rules (line 65) records the exception — `src/analysis/recordingCut.json` is versioned although recordings stay out of git, because it holds none of the packets the engine does not use, it is small (ceiling 660,000 bytes) and it comes from data already public as a Release asset, regenerated with `tools/exportRecordingCut.ts`; `CLAUDE.md` Conventions (the tests line) mentions the cut next to `testFixtures.ts`; `CLAUDE.md` Architecture (`tools/` row) adds the tool; README (the release-asset paragraph at line 87, "not committed to git") records the same exception, and the README's `tools/` row adds the tool. (FR-015a, FR-015c, FR-022; D8)

---

## Phase 4: User Story 3 — the delta series, both directions — commit 5

**Goal**: `totalDeltaS` within 0.045 s of the official difference and symmetric; losses with both laps interpolated (FR-011, FR-012, FR-014; D5, D6).

**Independent test**: synthetic laps with known start offsets and end positions, and the cut's three pairs: the total within 0.045 s of the official difference, (A,B) + (B,A) = 0 within 0.01 + 1e-9.

- [x] T011 [US3] Stub in `src/analysis/segmentDelta.ts`: `lapStartTime(samples: TelemetrySample[]): number` (returns `samples[0].sessionTime`, wrong), `commonRange(primary, comparison): { from: number; to: number } | null` (returns `null`), `deltaAtDistance(primary, comparison, distance): number | null` (returns `0`), `totalDelta(primary, comparison): number` (returns `0`), and `cornerLoss(primary, comparison, from, to): number` (returns `0`, replacing the series-based signature); `computeDelta` keeps its signature. Call sites in `src/analysis/buildInsights.ts` follow the new `cornerLoss` signature so the typecheck passes. (FR-012; D5)
- [x] T012 [US3] Red — *seen failing on assertions (all `code: 'ERR_ASSERTION'`): cut `(6,7): totalDeltaS 0.28 contra 0.162 oficial`; cut `(6,7): soma 0.08000000000000002`; `lapStartTime` `esperava 99.6, veio 100`; `commonRange` `deepStrictEqual` actual `null`; `deltaAtDistance` `esperava 0.5, veio 0`; `totalDelta 0 contra 1.2565751022793705`; `cornerLoss 0 contra 0.292226767971946`; `computeDelta` `deepStrictEqual`. One test (`cornerLoss limita o trecho…`) first passed against the stub because stub `cornerLoss` and `totalDelta` both return 0; its expected value was changed to an independently computed one and it then failed (`cornerLoss 0 contra 1.25280537697253`). The old `cornerLoss` tests were rewritten to the new signature in the same step as the stub (they call the old one and would not compile), so the typecheck was green only after both; no commit in between* — in `src/analysis/segmentDelta.test.ts` (existing tests updated): `lapStartTime` extrapolates to 0 m from the first two samples (first sample at 4.0 m at 10 m/s → 0.4 s earlier); `commonRange` is `[max(firsts), min(lasts)]`, `null` without overlap; `deltaAtDistance` interpolates **both** laps, `null` outside the common range; `totalDelta` is the delta at the end of the common range, and for synthetic laps built with the first sample 0.028 s after the start and the last one 7 m before the line (R§2.2) equals the constructed difference within 0.045 s; `totalDelta(a,b) + totalDelta(b,a)` and `cornerLoss(a,b,x,y) + cornerLoss(b,a,x,y)` are 0 within 0.01 + 1e-9; `computeDelta` returns points only at the primary lap's distances inside the common range. In `src/analysis/recordingCut.test.ts`, for (6,7), (6,8), (7,8) and reverses: `totalDeltaS` within **0.045 s** of the official difference and `totalDeltaS(a,b) + totalDeltaS(b,a)` within 0.01 + 1e-9 (SC-005). Seen failing on the assertions (the cut's against today's engine: 0.280 vs 0.162 in (6,7)). (FR-011, FR-012, FR-014; D5, D6; R§2, R§12)
- [x] T013 [US3] — *suite 217/217; the cut's six pairs: (6,7) 0.17 vs 0.162, (6,8) 0.92 vs 0.934, (7,8) 0.75 vs 0.772 and their reverses, errors 0.008–0.022 s; no `buildInsights.test.ts` expectation depended on the old total, none changed* — Green in `src/analysis/segmentDelta.ts`: D5 (data-model.md "Delta series and `totalDeltaS`"); `computeDelta` uses `deltaAtDistance`; no clamping and no first-sample normalization; the comment on the port from the frontend stays and gains one sentence saying the frontend's copy now differs (FR-020). In `src/analysis/buildInsights.ts`, `totalDeltaS = round2(totalDelta(...))` and `deltaLossS` uses the new `cornerLoss` over today's corner bounds (they change in Phase 5). `src/analysis/buildInsights.test.ts` expectations that depended on the old total are updated, red first. Suite green. (FR-011, FR-012; D5)
- [x] T014 [US3] Commit 5: `feat: count each lap from its extrapolated start in the delta series`. README and `CLAUDE.md`: no line describes the delta's definition (checked: README:61, CLAUDE.md:41); none changes, and the commit body says so. (FR-012, FR-022)

---

## Phase 5: User Story 2 — corners as places — commit 6

**Goal**: the same corners in (A,B) and (B,A), from the track's geometry, each with a contiguous numeric stretch (FR-006, FR-009, FR-013; D1, D2, D9, O1, O2, O4).

**Independent test**: synthetic laps on a known path (two arcs of 40 m radius 65 m apart, a bend of 300 m radius, a kink): exactly the two arcs are corners, identical with the laps swapped, stretches contiguous; on the cut, the same corners both ways in all three pairs.

- [x] T015 [US2] Stub `src/analysis/trackGeometry.ts` with the named constants and the reason for each value in a comment — `GRID_STEP_M = 5` (about one stored sample, R§1.1), `CURVATURE_SMOOTHING_POINTS = 7` (35 m: removes the line's sample-to-sample noise, R§10), `MAX_CORNER_RADIUS_M = 100` (keeps the corners where laps brake or lift and leaves flat-out bends out; validated on Interlagos only, R§10), `MIN_CORNER_ANGLE_DEG = 20` (drops the 3–6° stretches at the radius threshold, R§10) — and `commonGrid(a: number[], b: number[]): number[]` (returns `[]`), `meanPath(primaryMotion, comparisonMotion, grid): { x: number; z: number }[]` (returns `[]`), `curvature(path, step): number[]` (returns zeros), `geometricCorners(grid, curvature): { apexDistance: number; startIndex: number; endIndex: number }[]` (returns `[]`). (FR-013; D1, O1)
- [x] T016 [US2] *Seen failing: all 6 tests `not ok`, `code: 'ERR_ASSERTION'` (`deepStrictEqual` for the grid, `meanPath` and `geometricCorners`; `==` for the curvature; `strictEqual` for the corner count); the path generator (`makePath`, `makeLapOnPath`) is in `testFixtures.ts`; `geometricCorners` was also given direct curvature arrays (radius 100 m, 20°, opposite sides), which the task did not list, to test the thresholds without a path* — Red in `src/analysis/trackGeometry.test.ts` (new), with a path generator (straights and arcs) added to `src/analysis/testFixtures.ts`: the grid of two laps is the same in either order; the curvature of a 40 m arc is 1/40 within 5% away from its ends; `geometricCorners` returns the two 40 m arcs 65 m apart as two corners and neither the 300 m bend nor a 10° kink of 80 m radius; apexes at the arcs' middles within one grid step; identical output with the laps swapped (`deepEqual`). Seen failing on the assertions. (FR-006, FR-013; D1)
- [x] T017 [US2] Green — *6/6 on the first run* — in `src/analysis/trackGeometry.ts`: data-model.md "Corner (a place)": "a corner is a run of grid points with curvature of the same sign and radius ≤ 100 m whose turning angle is ≥ 20° (curvature smoothed over 7 points = 35 m)"; each lap's positions interpolated on the grid, the mean of the two laps. Suite green. (FR-013; D1)
- [x] T018 [US2] Stub in `src/analysis/cornerDetection.ts`: `detectCorners(primaryTelemetry, comparisonTelemetry, primaryMotion, comparisonMotion): Corner[]` (returns `[]`) and `cornerStretches(grid, meanSpeed, apexIndexes): { from: number; to: number }[]` (returns `[]`); remove `hasProminence`, `findLocalMinima` and `mergeCloseMinima` (no longer used for detection, D1); `buildInsights.ts` calls the new signature. (FR-009, FR-013; D1, D2)
- [x] T019 [US2] *Seen failing: the 8 rewritten `cornerDetection` tests and the 3 `buildInsights` tests against the stub on `strictEqual`/`deepStrictEqual`. The cut's 3 properties, which pass vacuously against the stub (zero corners), were run against the commit-5 engine (the two engine files restored from `HEAD` with a path-limited `git stash`, then popped): `(6,7): 12 curvas contra 7`; `(6,7): o trecho da curva 1 (398.529296875–497.76953125) não começa onde o da anterior termina (497.76953125)`; `(6,7): número de curvas 12 !== 7`. Extra, not listed: the `buildInsights.test.ts` scenarios moved to a curved path (straight motion has no geometric corner), and the fixtures gained `lateralOffsetM` and `sessionTimeAt`* — Red in `src/analysis/cornerDetection.test.ts` (existing tests rewritten): stretches contiguous and never overlapping, the boundary between two corners at the grid point of highest mean speed strictly between their apexes, the first starting at the grid's start and the last ending at its end, every bound a number; `corner.apexDistance` the geometric apex; `severity` on the mean of the two laps' minimum speeds in the stretch ("`slow` ≤ 110 < `medium` ≤ 180 < `fast`"), the same both ways; `apexSpeed` the primary lap's minimum speed in the stretch (D9); without motion for either lap, `[]` (O4); identical corners with the laps swapped except `apexSpeed`. In `src/analysis/recordingCut.test.ts`, for the three pairs: the same corner count and `apexDistance`s in (A,B) and (B,A) (SC-006); every stretch numeric, contiguous and not overlapping (SC-004a); for every corner, every difference and `deltaLossS` of (A,B) plus (B,A) within 0.01 + 1e-9 (SC-004). Seen failing on the assertions (the cut's against the commit-5 engine: 12 vs 7 corners with lap 6, so the corners cannot even be paired; lap 6's stretches 211–498 and 399–498 m overlap). (FR-006, FR-009, FR-013; D1, D2, D9, O4)
- [x] T020 [US2] *Suite 228/228. On the cut: 8 corners in all six pairs, e.g. (8,7) apexes 385, 480, 1440, 2110, 2360, 2490, 2780, 3290 m with stretches 5–475, 475–1285, 1285–1930, 1930–2270, 2270–2435, 2435–2690, 2690–3160, 3160–4285 and losses 0.25, −0.07, 0.20, −0.25, −0.04, −0.24, 0.25, −0.85 (research §10.2: 0.246, −0.072, 0.196, −0.245, −0.036, −0.244, 0.251, −0.846)* — Green in `src/analysis/cornerDetection.ts`, with `buildInsights.ts` passing both laps' telemetry and motion. The braking and throttle analyses keep their ±80 m search until Phase 6; `deltaLossS` and `lineDeviation` now use the stretch. `src/analysis/buildInsights.test.ts` expectations that depended on primary-only corners are updated, red first. Suite green. (FR-009, FR-013; D1, D2)
- [x] T021 [US2] Commit 6: `feat: detect corners from the track's geometry, the same in both directions`. Same commit: README:61 ("corner detection from the speed trace" → from the geometry of the two laps' path, the same set whichever lap is primary, each corner with its own stretch); README "Known limitations" and `CLAUDE.md` "Known pitfalls" gain: the geometry thresholds were validated only on Interlagos, and on a track whose fast corners have a radius above 100 m those corners may not appear (future work: revalidate them when a recording of another track exists); a lap without motion samples gets no corners; and the contract's `corner.brakingStartDistance` / `exitDistance` now hold the start and end of the corner's stretch, not a braking point and a throttle pick-up — the names are kept for the frontend's contract, and renaming them is debt for the frontend spec (O5). `CLAUDE.md`:41 (`src/analysis/` row) adds "track geometry". (FR-009, FR-013, FR-022; O1, O4, O5)

---

## Phase 6: User Story 2 — each lap's behaviour inside the stretch — commit 7

**Goal**: braking start, peak and throttle pick-up from that corner's samples; "did not brake" and "no full throttle" as facts, `null` only when undeterminable; every difference antisymmetric (FR-006, FR-007, FR-008, FR-010, FR-011; D3, D4, O3).

**Independent test**: synthetic laps (brake released 30 m before the slowest point; a lap that only lifts; no full throttle before the next stretch; no sample in the stretch); on the cut, no shared points and exact antisymmetry.

- [ ] T022 [US2] Stub `src/analysis/cornerBehaviour.ts`: `lapBehaviourInStretch(samples: TelemetrySample[], from: number, to: number): LapCornerBehaviour | null` (returns a fixed object with `brakingStartIndex: 0`, wrong), with `LapCornerBehaviour = { slowestIndex: number; brakingStartIndex: number | null; brakingPeak: number; fullThrottleIndex: number | null }` in `src/analysis/types.ts`. (FR-007, FR-008; D3)
- [ ] T023 [US2] Red in `src/analysis/cornerBehaviour.test.ts` (new), fixtures in `src/analysis/testFixtures.ts`: the data-model.md "Behaviour of a lap in a corner" table row by row — the slowest sample (first on ties); the braking start = the first sample of the last braking phase (brake > 0.1) ending at or before the slowest point, so a release 30 m before the apex gives the onset, not the apex (R§4); no such phase → `brakingStartIndex: null`; the peak over that phase, 0 without one; the pick-up = the first throttle ≥ 0.9 after the slowest point inside the stretch, `null` when none before the stretch ends (R§5); no sample in the stretch → `null`. Seen failing on the assertions. (FR-007, FR-008, FR-010; D3)
- [ ] T024 [US2] Green in `src/analysis/cornerBehaviour.ts`. Suite green. (FR-007, FR-008; D3)
- [ ] T025 [US2] Stub the new shapes: in `src/analysis/types.ts`, `BrakingInsight` gains `brakedPrimary: boolean | null` and `brakedComparison: boolean | null`, `ThrottleInsight` gains `fullThrottlePrimary: boolean | null` and `fullThrottleComparison: boolean | null` (contracts/insights.md, "added"); `analyzeBraking` and `analyzeThrottle` (`src/analysis/brakingAnalysis.ts`, `src/analysis/throttleAnalysis.ts`) return the new fields as `true` (wrong), keeping their ±80 m logic for now; `src/coaching/promptVersion.ts` `REFERENCE_INPUTS` gain the four fields (all `true` for now) so the typecheck passes — this already changes `PROMPT_VERSION` (plan, "Impact"); the version tests still pass because they compare runs, not a literal. (FR-007, FR-008, FR-017; D4, O3)
- [ ] T026 [US2] Red in `src/analysis/brakingAnalysis.test.ts` and `src/analysis/throttleAnalysis.test.ts` (existing tests rewritten): the analyses use `lapBehaviourInStretch` over `[corner.brakingStartDistance, corner.exitDistance]`; two corners whose apexes are 65 m apart never share a sample of the same lap as slowest point, braking start or pick-up; `brakingPointDiffM` `null` unless both laps braked; `peakBrakeDiff` the difference of the peaks (0 for a lap that did not brake), `null` only without samples; `throttleOnDiffM` `null` unless both reached full throttle; the four booleans as the samples show, `null` without samples; trail braking and coasting measured from the lap's own points (data-model.md); swapping the laps negates every difference and swaps the booleans. In `src/analysis/recordingCut.test.ts`, for the three pairs and reverses: no two corners share a sample of the same lap as slowest point, braking start or pick-up (SC-002); no braking start is the lap's slowest point when the brake was applied and released before it (SC-003). Seen failing on the assertions against the commit-6 engine — SC-003: lap 7's braking start at T1 is still its apex, 391.2 m (R§4); SC-002: the unbounded forward walk still gives the corners at ~2,360 and ~2,490 m the same pick-up of lap 6, 2,593.0 m (R§5) — both expected from the research, confirmed in the note; if either passes, the header's **[PARADA]**. (SC-004, antisymmetry, is already true at the commit-6 engine because both directions then share corners and windows; it is seen red and made green in T019–T020.) (FR-006, FR-007, FR-008, FR-010, FR-011; D3, D4)
- [ ] T027 [US2] Green in `src/analysis/brakingAnalysis.ts` and `src/analysis/throttleAnalysis.ts`; remove `CORNER_SEARCH_WINDOW_M`, and from `src/analysis/sampleSearch.ts` the now unused `findApexIndexNear`, `findBrakingStartIndex` and `findThrottleOnIndex` (`peakInRange` stays only if still used). `src/analysis/buildInsights.test.ts` updated, red first. Suite green. A cut property still failing for a reason the design did not foresee: **[PARADA]**; a tolerance is never widened (FR-014). (FR-006, FR-007, FR-008, FR-014; D3, D4)
- [ ] T028 [US2] Commit 7: `feat: measure each lap's braking and throttle inside the corner's own stretch`. Same commit: README:61 says braking point and throttle pick-up are measured per lap inside each corner's stretch, and a lap that did not brake or did not reach full throttle is reported as such, not as a difference. No Known limitation is fixed or added (the ±80 m windows and the braking start at the apex were never listed). (FR-007, FR-008, FR-022; D3, D4)

### First push and the draft pull request

- [ ] T029 **[PARADA] [MANUAL] the maintainer approves the first push and the opening of the draft pull request.** Hands back: "go" for both.
- [ ] T030 `git push -u origin 005-analysis-engine-artifacts`; await and confirm the CI (header procedure). Then `gh pr create --draft --base main --head 005-analysis-engine-artifacts --title "Fix the analysis engine's artifacts (spec 005)" --body-file <scratch>/pr-body.md`, a short body (the spec's goal, "draft: work in progress", the contract note of contracts/insights.md; no attribution footer). Record the pull request number for T060.

---

## Phase 7: the coach reads the new insights (spec 004's code) — commit 8

**Goal**: the prompt and the reading describe what the insights now mean, and say when a lap did not brake (FR-016, FR-017; contracts/coach-reading.md; O3).

**Independent test**: the message for synthetic insights with `brakedPrimary: false` says the primary lap only lifted; the prompt contains each new instruction; `PROMPT_VERSION` changes only through the declared causes.

- [ ] T031 [P] [US2] Stub in `src/coaching/coachReading.ts`: `brakedPhrase(primary: boolean | null, comparison: boolean | null): string | null` and `fullThrottlePhrase(primary: boolean | null, comparison: boolean | null): string | null` (both return `null`), their templates added to `PHRASE_TEMPLATES` as empty strings. (FR-016; O3; contracts/coach-reading.md "Reading")
- [ ] T032 [US2] Red in `src/coaching/coachReading.test.ts`: one lap braked and the other did not → the phrase names which lap only lifted (or went flat) and which braked; neither braked → both lifted; one lap did not reach full throttle → which one; both `true` or any `null` → no phrase; `opportunityBlock` places these phrases before the difference phrases; existing phrase tests unchanged. Seen failing on the assertions. (FR-016; O3)
- [ ] T033 [US2] Green in `src/coaching/coachReading.ts` (Portuguese wording; the maintainer reads it in T055). Suite green. (FR-016; O3)
- [ ] T034 [P] [US2] Red in `src/coaching/coachPrompt.test.ts`: the prompt describes `totalDeltaS` as a sample-based measure close to the official difference and still forbids citing it; `corners` as the track's corners, the same whichever lap is primary; `brakingStartDistance`/`exitDistance` as the corner's stretch, not a braking point; `deltaLossS` as including the exit onto the next straight; the four booleans; coasting from the lap's slowest point; a rule never to say a lap braked when its `braked*` is `false`; and no longer contains "Não é a diferença oficial de tempo de volta" nor "curvas detectadas na volta principal". Seen failing on the assertions. (FR-016, FR-017; contracts/coach-reading.md)
- [ ] T035 [US2] Green in `src/coaching/coachPrompt.ts` (`COACH_SYSTEM_PROMPT`; the comment on lines 1–4 stays). Suite green. (FR-017)
- [ ] T036 [US2] Red then green in `src/coaching/promptVersion.test.ts` and `src/coaching/promptVersion.ts`: `REFERENCE_INPUTS` gain at least one `false` of each boolean and one corner where neither lap braked, so every new template appears in some reference message (the existing test requiring every `PHRASE_TEMPLATES` entry to appear is seen failing on its assertion first); the test that the same prompt, builder and inputs give the same version stays; a new test shows that changing only engine values (different insights passed to `buildCoachUserMessage`, the reference inputs untouched) leaves `PROMPT_VERSION` unchanged (SC-007). Print the new version with `npm run analyze` after the key check (any pair of a temporary database built by `evidence/buildResearchDb.ts`) and quote it. (FR-017; SC-007)
- [ ] T037 [US2] Commit 8: `feat: describe the corrected insights to the coach`. Same commit: README:177 and `CLAUDE.md`:96 no longer state the current prompt's size as 2,172 tokens — "not yet measured for the current prompt" until T056 (the 1,024-token minimum and the observation on the previous prompt stay); README:175 adds that the coach is told when a lap did not brake. (FR-016, FR-017, FR-022)

---

## Phase 8: one staleness rule for the cached analyses — commit 9

**Goal**: a cached analysis is served only while its prompt version, model and insights are the current ones (FR-018; D7).

**Independent test**: the resolver's tests with a fake coach: insights beyond the tolerance → regenerated with the key, 503 without; within it → served; samples gone → "no samples".

- [ ] T038 [US3] Stub in `src/coaching/analysisStaleness.ts`: `isCachedAnalysisCurrent(row: { model: string; promptVersion: string | null; insightsJson: string }, current: { model: string; promptVersion: string; insights: LapInsights }): boolean` (returns `true`, wrong); callers updated so the typecheck passes. (FR-018; D7)
- [ ] T039 [US3] Red in `src/coaching/analysisStaleness.test.ts`: current only when prompt version and model match **and** `insightsMatch(JSON.parse(row.insightsJson), current.insights)` holds; a `round2` flip (0.35 vs 0.36) is current; 0.35 vs 0.37, a corner more, a boolean changed, or a missing key is stale; a `null` prompt version is stale (existing). Seen failing on the assertions. (FR-018; D7)
- [ ] T040 [US3] Green in `src/coaching/analysisStaleness.ts` (imports `./insightsMatch`). Suite green. (FR-018)
- [ ] T041 [US3] Red in `src/coaching/analysisResolver.test.ts`: the resolver builds the pair's inputs **before** deciding; a cached row with matching insights is served without calling the coach; a row whose insights differ is regenerated and replaced with a fake coach, and answers `unavailable` (503) without the key; a pair whose samples are gone answers `no-samples`, whatever the cache holds; single-flight unchanged (existing test). Seen failing on the assertions. (FR-018; D7)
- [ ] T042 [US3] Green in `src/coaching/analysisResolver.ts` (and `src/http/routes/analysisRouter.ts` only if the wiring changes; the response shape and the error strings do not change). Suite green. (FR-018)
- [ ] T043 [US3] Commit 9: `feat: treat a cached analysis with outdated insights as stale`. Same commit: README:77 and `CLAUDE.md`:95 — cached analyses are served while their prompt version, model **and insights** are the current ones, otherwise 503 without the key; README:177 ("sent again only when the prompt version or the model changes") adds "or its insights". (FR-018, FR-022)
- [ ] T044 **[PARADA] [MANUAL] the maintainer approves the push of Phases 7–8.** Hands back: "go".
- [ ] T045 Push; await and confirm the CI (header procedure). **CI red**: header rule.

---

## Phase 9: Polish, validation and the pull request — commit 10 and after

- [ ] T046 The six pairs after the correction (FR-019, quickstart B): after the key check, build a temporary database with `evidence/buildResearchDb.ts` from the published recording (hash and counts as R§0); `DB_PATH=<scratch>/after.db npm run analyze -- 1 <a> <b>` for the six ordered pairs of laps 6, 7 and 8, each output saved to `<scratch>/after/analyze-<a>-<b>.txt`. Add to research.md "Implementation evidence — the six pairs after": the commands; per pair the corners (apex, stretch), the differences, the booleans, `deltaLossS`, `totalDeltaS` against the official difference and the three opportunities; the comparison with the prototype's preview (R§10.2); the implemented `PROMPT_VERSION`. **Conditional [PARADA]**: a property of SC-002–SC-006 failing, or a difference from the prototype beyond the tolerances that research.md does not explain.
- [ ] T047 FR and SC coverage rechecked against the code: each FR and SC of the tables below with the file and test that meet it, in research.md "Implementation evidence — coverage". A gap becomes a new task before T055, with its own red test.
- [ ] T048 Commit 10: `docs: record the validation of spec 005` (research.md: the six pairs after, the coverage, the "CI runs" table so far). README and `CLAUDE.md` re-read against the final behaviour; only a correction found here changes them, in this commit.
- [ ] T049 **[PARADA] [MANUAL] the maintainer approves the push of commit 10.** Hands back: "go".
- [ ] T050 Push; await and confirm the CI (header procedure).
- [ ] T051 **SC-007a — the publishing dependency in spec 003.** Preconditions: everything above committed and pushed; `git status` clean. Then `git switch 003-demo-mode` (its working tree must be clean too; otherwise **[PARADA]**); `git log origin/003-demo-mode..003-demo-mode --oneline` shows exactly `0e63e48` (not yet pushed; anything else: **[PARADA]**). With the Edit tool, record in `specs/003-demo-mode/tasks.md`, in its Phase 5 section "Updating this branch with `main`" (where the path for updating spec 003 with `main` is recorded), that the demo is not published until the frontend spec that ports the "Delta acumulado" series of spec 005 (or receives it from the API) is live, citing `specs/005-analysis-engine-artifacts/spec.md` FR-020 and research.md section 7 (the chart already shows the error: 0.28 vs 0.162 s in (6,7), 0.13 s off in (8,7)). After the key check, `npm test` and `npm run typecheck` on that branch; commit `docs: record the demo's dependency on the delta chart fix`; confirm `git log origin/003-demo-mode..003-demo-mode --oneline` now shows exactly `0e63e48` and the new commit. Nothing is pushed: switch back with `git switch 005-analysis-engine-artifacts` and stop at T052 (**[PARADA] before the push**, which carries `0e63e48` too and is the maintainer's go; it is pushed by name, `git push origin 003-demo-mode`, from any branch). (FR-020; SC-007a)
- [ ] T052 **[PARADA] [MANUAL] the maintainer approves the push of `003-demo-mode`** (T051's commit and `0e63e48`). Hands back: "go" or "not now".
- [ ] T053 If "go": push `003-demo-mode`; confirm pull request #12's CI through the jobs API (header procedure, with that branch name); the row goes into spec 003's research.md "CI runs" in that branch's next commit, not here.
- [ ] T054 Run `/speckit-converge` for spec 005 (every FR and SC against the code). Any appended task follows the same rules; each extra push is its own **[PARADA]**.
- [ ] T055 **[MANUAL] [PARADA] M1 — reading the six demo messages.** The maintainer reads `<scratch>/after/analyze-*.txt` (T046: insights, the coach's message and the prompt version for each pair, generated by `npm run analyze` on a temporary database built from the published recording, no paid call), compared with the prototype's preview in research.md section 10.2. Hands back: "approved", or the changes she wants (each becomes a new task before T060, with its own red test and commit; a change to the prompt or the reading records the new `PROMPT_VERSION`).
- [ ] T056 **[MANUAL] [PARADA] M2 — the token count of the new prompt.** With her own key, in her own shell, the maintainer measures `COACH_SYSTEM_PROMPT` for `claude-opus-4-8` with Anthropic's token-counting endpoint, as for the 2,172-token figure (the prompt plus a one-character message, minus the message alone). Hands back: the token count and whether it reaches the 1,024-token minimum, **or** "leave it unmeasured". The agent never runs it.
- [ ] T057 With a count from T056: a `docs:` commit puts it back in README:177 and `CLAUDE.md`:96 ("an estimate from the free token-counting endpoint"), after the key check and the suite. With "leave it unmeasured": nothing (T037's text stays), and the task says so.
- [ ] T058 **[PARADA] [MANUAL] the maintainer approves the push of the commits after T050** (T057 and any appended by T054/T055), if there are any. Hands back: "go".
- [ ] T059 Push; await and confirm the CI (header procedure).
- [ ] T060 Commit the spec's status line `**Status**: Implemented; pull request #<n>` in `specs/005-analysis-engine-artifacts/spec.md` (`docs:`), after the key check and the suite; push after its own **[PARADA]**; confirm the CI.
- [ ] T061 **[PARADA] before editing the pull request body**, since it is visible on GitHub; then `gh pr edit 005-analysis-engine-artifacts --body-file <scratch>/pr-body.md` with: the spec summary; the verdicts (research.md, "Summary of verdicts"); the contract changes as listed in contracts/insights.md (the four added booleans; the fields whose meaning changed — `totalDeltaS`, `apexDistance`, `brakingStartDistance`/`exitDistance`, `severity`, `deltaLossS`, the difference fields; no rename; renaming the bounds as debt for the frontend spec; the frontend not changed by this pull request); the prompt and `PROMPT_VERSION` change; the staleness rule; the recording cut and its exception; the dependencies (the frontend spec blocks publishing the demo; spec 003 regenerates the seed); the manual steps done (M1, M2); the out-of-scope items; and the last push's CI row (run id, head SHA, `typecheck`, `test` from the jobs API). No attribution footer.
- [ ] T062 **[PARADA] [MANUAL] the maintainer approves marking the pull request ready for review.** Hands back: "go". Then `gh pr ready 005-analysis-engine-artifacts`.
- [ ] T063 **[MANUAL] [PARADA] the merge is the maintainer's**, on GitHub with "Rebase and merge", with `typecheck` and `test` green and the branch up to date with `main` (ruleset). Hands back: "merged". If the branch is behind `main`, how to update it without rewriting published history (never `--force`) is decided by the maintainer at that point, with its own **[PARADA]** push and CI record.
- [ ] T064 Switch to an updated `main` and delete the branch locally (`git branch -d 005-analysis-engine-artifacts`); deleting it on `origin`, if GitHub did not, is a push: **[PARADA]**.

---

## Outside this feature's tasks

- **The frontend spec** (contracts/insights.md is its list): port the delta series (D5) to `computeDelta`, or receive it from the API and drop the copy (decided there, together with the opportunity rule's way out); mirror the four booleans in `src/types/rest.ts`; take in the fields whose meaning changed — `totalDeltaS` (now close to the official difference), `corner.apexDistance` (the geometric apex), `corner.brakingStartDistance`/`exitDistance` (the corner's stretch, so the highlight widens), `corner.severity` (from both laps), `deltaLossS` (over the stretch), the difference fields (`null` when a lap did not brake or did not reach full throttle); the debt of renaming `brakingStartDistance`/`exitDistance`. It blocks publishing the demo (FR-020, FR-020a).
- **Spec 003**, when updated with `main`: import `src/coaching/insightsMatch.ts` and delete its copy; regenerate the seed (its `--dry-run` first); the maintainer reads the texts.
- **Future work**: revalidate the geometry thresholds when a recording of another track exists (Known limitations).
- The flashback and out-lap spec.

## Dependencies & execution order

### Phase dependencies

- Phase 1 → everything. User Story 1 is delivered.
- Phase 2 (`insightsMatch`) → Phase 8 only.
- Phase 3 (the cut) → Phases 4, 5, 6 (their red tasks add the cut's properties).
- Phase 4 (delta) → Phase 5 (stretch losses use the new `cornerLoss`) → Phase 6 (behaviour inside the stretch).
- Phase 7 (coach) needs Phase 6's fields; Phase 8 needs Phase 2 and the final insights shape (Phase 6).
- Phase 9 after Phases 7–8.

### After every push

The CI is confirmed through the jobs API before the next step (header).

### Within each pure function

Stub → red (seen failing on its assert) → green, never merged into one task.

### Parallel opportunities

- T031 (`src/coaching/coachReading.ts`) and T034 (`src/coaching/coachPrompt.test.ts`): different files, no dependency between them.
- Nothing else: the engine phases share `buildInsights.ts`, `types.ts`, `testFixtures.ts` and `recordingCut.test.ts`.

## Parallel example: Phase 7

```text
T031 Stub brakedPhrase / fullThrottlePhrase in src/coaching/coachReading.ts
T034 Red: the prompt's new instructions in src/coaching/coachPrompt.test.ts
```

## Implementation strategy

### MVP

Phases 3–6 (commits 4–7): the cut, then the engine stops producing the artifacts, each property seen red on real laps and then green; first push and draft pull request after them.

### Incremental delivery

Phase 7 makes the coach read the new fields; Phase 8 stops serving cached texts built on old insights; Phase 9 validates, records the dependency in spec 003, and closes.

## Notes

- Line numbers of README and `CLAUDE.md` are at `a9b0e2f`; each commit task re-reads the file before editing.
- No task touches `data/telemetry.db`; no task makes a paid call; the maintainer's M2 is the only use of the key.

## FR coverage

| FR | Tasks |
|---|---|
| FR-001, FR-002, FR-003, FR-004, FR-005 | User Story 1, delivered in `a9b0e2f` (research.md sections 0–9) |
| FR-006 | T016, T019, T026, T027 |
| FR-007 | T022–T027 |
| FR-008 | T022–T027 |
| FR-009 | T018–T020 |
| FR-010 | T023, T026 |
| FR-011 | T012, T026 |
| FR-011a | delivered (research.md §2.4); T046 |
| FR-012 | T011–T014 |
| FR-013 | T015–T021 |
| FR-013a | delivered (research.md §6.2); T046 |
| FR-014 | T012, T027 (no widening) |
| FR-015 | T012, T016, T019, T023, T026 (synthetic) |
| FR-015a | T005–T010 |
| FR-015b | T012, T019, T026 (properties on the cut, each seen red against the previous phase's engine) |
| FR-015c | T010 |
| FR-016 | T030, T061 (contract change listed), T031–T037 |
| FR-017 | T025, T034–T037 |
| FR-018 | T003, T004, T038–T043 |
| FR-019 | T046, T048 |
| FR-020 | T013 (comment), T051 |
| FR-020a | Outside this feature's tasks (recorded for the frontend spec); T061 |
| FR-021 | header (key check, no `data/telemetry.db`), T001, T009, T046, T056 |
| FR-022 | T010, T014, T021, T028, T037, T043, T048, T057 |

| SC | Tasks |
|---|---|
| SC-001 | User Story 1, delivered |
| SC-002 | T026 |
| SC-003 | T023, T026 |
| SC-004 | T012 (synthetic), T019, T026 (synthetic) |
| SC-004a | T019 |
| SC-004b | T039, T041 |
| SC-005 | T012 |
| SC-006 | T016, T019 |
| SC-006a | T008, T009 |
| SC-007 | T036 |
| SC-007a | T051 |
| SC-008 | header, T001, T046 |
