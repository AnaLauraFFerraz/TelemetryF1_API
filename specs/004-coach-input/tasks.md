---

description: "Task list for spec 004, fixing the coach's input"
---

# Tasks: Fix the coach's input

**Input**: Design documents from `specs/004-coach-input/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (`coach-message.md`, `prompt-version.md`, `analysis-endpoint.md`, `analyze-cli.md`) and quickstart.md are present.

**Tests**: requested (TDD, plan.md and research.md section 8).

- **Pure functions** go through three separate tasks, always in this order: (1) **stub**: the module with the final signature and a body that returns a wrong value of the right type (never a missing export, never a thrown "not implemented"); (2) **red**: the test written and run with `npm test`, seen failing **on its own `assert`** (an import error, a type error or a throw does not count as red; if it fails any other way, fix the stub, not the test); the failing output is quoted in the task's note when it is ticked; (3) **green**: the implementation, until the suite passes.
- Other code (repositories, the migration, the resolver, the CLI) is also test-first: the test is written and seen failing on its assertion before the implementation.
- A test that fails by design is committed together with the code that makes it pass, never alone, so no commit has a red suite (constitution, "Development Workflow").
- Every test that needs a database uses `src/persistence/testDb.ts` (a disposable file) or a file the test creates under `os.tmpdir()`. **No task opens, writes, copies or points anything at `data/telemetry.db`** (CLAUDE.md, Rules); only the maintainer's M1 and her own first start touch it.
- No test can make a paid call: the coach is always a fake in tests (the resolver receives it as a parameter).
- **No process the agent starts can see the maintainer's key.** The repository's `.env` holds `ANTHROPIC_API_KEY`. Every command the agent runs that loads the dotenv configuration (`npm test`, `npm run typecheck`, `npm run dev`, `npm run replay`, `npm run analyze`, any `node -r ts-node/register` script) runs with `DOTENV_CONFIG_PATH` pointing at one of the two scratch `.env` files of T001, both outside the repository and both without the key: `keyless.env` (no ports, either) for `npm test`, `npm run typecheck` and `npm run analyze`; `keyless-ports.env` (only `WS_PORT`, `UDP_PORT`, `HTTP_PORT`) **only** for `npm run dev` and `npm run replay` (T057, T058). The ports must not reach `npm test`: `src/config/serverFailFast.test.ts` expects no port to be found and its child process inherits `DOTENV_CONFIG_PATH`. **Before** each command, in the same environment, `node -e "require('dotenv/config'); console.log(Boolean(process.env.ANTHROPIC_API_KEY))"` must print `false`; if it prints `true`, nothing is run (**[PARADA]**). The value of a key or the content of any `.env` is never printed.

**Commits**:

- Small Conventional Commits, English subject, types only from the constitution's closed list (`feat`, `fix`, `docs`, `test`, `chore`, `ci`), **no `Co-Authored-By` trailer**, and no "Generated with" footer (or any attribution line) in the pull request body, even if a session reminder asks for one.
- `npm test` and `npm run typecheck` pass before every commit (after the key check); a failure is reported, never committed around.
- `README.md` and `CLAUDE.md` change **in the same commit as the behaviour they describe**. Building blocks that nothing runs yet get no documentation until the commit that wires them.
- Text files are edited only with the Edit and Write tools, never with shell commands.
- The commit sequence is plan.md's: commit 1 (plan) and commit 2 (this file) are `docs:`; commits 3–8 below.

**Markers**:

- **[MANUAL]**: done by the maintainer, not by the agent; each says what the maintainer hands back.
- **[PARADA]**: the session stops and waits for the maintainer, at every manual task, before every push, before opening the pull request, before marking it ready and before the merge (which is the maintainer's), and at every conditional stop listed. The agent never pushes, opens or changes the pull request, or merges without the maintainer's explicit go-ahead for that specific action.

**Pull request and CI** (one pull request for the whole feature, to `main`):

- Opened **as a draft at the first push** (T021); marked ready only at T069. The spec's status line "Implemented; pull request #n" is set in the pull request itself, before the merge (T064).
- After **every** push the CI is awaited and confirmed through the jobs API: `gh run list --branch 004-coach-input --limit 1 --json databaseId,headSha,event,status,conclusion`, then `gh run watch <databaseId> --exit-status`, then `gh api repos/AnaLauraFFerraz/TelemetryF1_API/actions/runs/<databaseId>/jobs --jq '.jobs[] | [.name, .status, .conclusion, .started_at, .completed_at] | @tsv'`. The row (push, head SHA, run id, `typecheck`, `test`) goes into the "CI runs" table of research.md, committed with the next group of changes; the last push's row goes into the pull request body (T068).
- **CI red**: the cause is diagnosed from the job log (`gh run view <id> --log-failed`), fixed in its own commit, and pushed after its own **[PARADA]**. A re-run (`gh run rerun <id> --failed`) only for an infrastructure failure (runner, network, GitHub outage), stated as such in the "CI runs" table; never to get past a real failure.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel: different files from every task it could run alongside, and no dependency on an incomplete task.
- **[Story]**: US1–US5 from spec.md. Setup, Foundational and Polish tasks carry no story label.
- Every task names its file(s), the FRs it serves and the plan decision it follows ("D1"–"D8" = plan.md "Design decisions" 1–8; "TO-1"–"TO-9" = plan.md "Trade-offs"; "R§n" = research.md section n).

---

## Phase 1: Setup

- [x] T001 Baseline, read-only, on branch `004-coach-input`: `node -v` is v22.23.x (`fnm use` if not); `git status` clean; create two scratch `.env` files (in the session's scratch folder, outside the repository; nothing is read from the repository's `.env`): `keyless.env` with no variables (a comment only) and `keyless-ports.env` with only `WS_PORT=8080`, `UDP_PORT=20777`, `HTTP_PORT=3001` (the `.env.example` values); with `DOTENV_CONFIG_PATH` pointing at each, the key check prints `false`; `npm run typecheck` and `npm test` run with `keyless.env`; `npm run typecheck` passes and `npm test` reports 95 tests, 95 passing; `recordings/demo-interlagos-tt-20hz-laps6-8.jsonl` exists and its SHA-256 is `c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033`. No file changes. If any check differs, **[PARADA]** and report.

---

## Phase 2: Foundational (blocking prerequisites)

None. Every module this feature adds is used by a single story and is created in that story's phase; the two shared ones (`coachReading.ts`, `coachModel.ts`) are created where first needed (T005, T014), and later phases depend on those phases (see Dependencies).

---

## Phase 3: User Story 2 — the coach explains the same opportunities the visitor sees (P1) — commit 3, part 1

**Goal**: the code chooses, orders and labels up to three opportunities exactly as the frontend chips, and writes each direction in words (FR-006–FR-009).

**Independent test**: the unit tests of `opportunities.ts` and of the direction phrases in `coachReading.ts`, with synthetic insights (ties, 0, −0, `.5`, `null`, both signs).

- [x] T002 [P] [US2] Stub `src/coaching/opportunities.ts`: `export const MAX_OPPORTUNITIES = 3`; `export function topOpportunities(insights: LapInsights, max = MAX_OPPORTUNITIES): CornerInsight[]` returning `[]`; `export function opportunityLabel(rank: number, c: CornerInsight): string` returning `""`. (FR-006, FR-007; D2; R§2)
- [x] T003 [US2] Red (seen failing: 27 of 30 failed, all `ERR_ASSERTION`, e.g. `+ 'x' - 'Ponto de frenagem: …'`; the 3 that passed against the stub are the constant, the empty result and the no-mutation case): `src/coaching/opportunities.test.ts` (flat `test()` calls, Portuguese names, synthetic `CornerInsight`s built in the file): keeps only `deltaLossS > 0` (0, −0 and negatives out); sorts by `deltaLossS` descending; equal values keep their order in `insights.corners`; at most three; fewer than three when fewer lose time; empty when none. Labels compared byte for byte with the frontend's expression copied in the test as `` `${i + 1}. ${Math.round(c.corner.apexDistance)}m · +${c.deltaLossS.toFixed(2)}s` `` (U+00B7): `1. 334m · +0.29s` for apex 333.693359375 / 0.29; apex 2.5 → `3m`; apex −0.4 → `0m`; `deltaLossS` 1.005 → `+1.00s`; and, for the six demo pairs' top three (literal expected arrays from R§2), the same labels. Run; confirm `assert` failures. (FR-006, FR-007; SC-002; D2)
- [x] T004 [US2] Green: implement `topOpportunities` (`[...corners].filter(c => c.deltaLossS > 0).sort((a, b) => b.deltaLossS - a.deltaLossS).slice(0, max)`) and `opportunityLabel` (`` `${rank}. ${Math.round(c.corner.apexDistance)}m · +${c.deltaLossS.toFixed(2)}s` ``), the frontend's expressions verbatim (`Telemetry-F1/src/utils/coachInsights.ts:5-10`, `CoachPanel.tsx:65`). (FR-006, FR-007; D2)
- [x] T005 [P] [US2] Stub the direction part of `src/coaching/coachReading.ts`: `brakingPointPhrase(diffM: number | null): string | null`, `peakBrakePhrase(diff: number | null): string | null`, `throttleOnPhrase(diffM: number | null): string | null`, `trailBrakingPhrase(primary: boolean, comparison: boolean): string`, `coastingPhrase(primaryS: number, comparisonS: number): string`, `opportunityBlock(rank: number, c: CornerInsight): string` (label line from `opportunityLabel`, then the indented phrases); each returns `"x"`. (FR-008, FR-009; D1; contracts/coach-message.md)
- [x] T006 [US2] Red (seen failing together with T003: every direction case failed on `ERR_ASSERTION` against the `"x"` stub): `src/coaching/coachReading.test.ts`, direction cases, expected strings copied from the six messages of R§4: `brakingPointPhrase(-179.97)` → `Ponto de frenagem: a volta principal começou a frear 179.97 m antes da volta de comparação.`; `+5.2` → `… 5.2 m depois …`; `0` → `Ponto de frenagem: igual nas duas voltas.`; `null` → `null`. `peakBrakePhrase(0.8)` → `… freou mais forte (diferença de 0.8 numa escala de 0 a 1).`; `-1` → `… freou mais leve (diferença de 1 …)`; `0` → `Pressão máxima de freio: igual nas duas voltas.`; `null` → `null`. `throttleOnPhrase(-19.43)` → `… voltou ao acelerador 19.43 m antes …`; `+112.93` → `… depois …`; `0` → `Retomada do acelerador: no mesmo ponto nas duas voltas.`; `null` → `null`. The four trail-braking combinations (`as duas voltas fizeram`, `nenhuma das duas voltas fez`, `só a volta principal fez`, `só a volta de comparação fez`). `coastingPhrase(0.34, 0)` → `Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0.34 s na volta principal, 0 s na volta de comparação.` `opportunityBlock(2, <corner 334m of (6,7)>)` equals the six lines of that opportunity in R§4; with `throttleOnDiffM` `null` the throttle line is absent. No number in a phrase that is not the field's absolute value (FR-009). Run; confirm `assert` failures. (FR-008, FR-009; SC-003; D1; TO-3, TO-4)
- [x] T007 [US2] Green: implement the direction functions and `opportunityBlock` with the exact wording of R§4 (dot decimal, TO-4; `peakBrakeDiff` on the 0–1 scale, TO-3; magnitudes as `Math.abs` of the field). (FR-008, FR-009; D1)

---

## Phase 4: User Story 1 — the coach compares the right laps (P1) — commit 3, part 2

**Goal**: the compared laps block (numbers, official times, validity, official difference in words, "every delta is against the comparison lap") and the invalid-comparison warning (FR-001–FR-003, FR-001a).

**Independent test**: the unit tests of the compared-laps part of `coachReading.ts`.

- [x] T008 [US1] Stub the compared-laps part of `src/coaching/coachReading.ts`: `export interface ComparedLap { lapNumber: number; lapTimeMs: number | null; isValid: boolean | null }` (data-model.md: "`lapTimeMs` number | null — `null` when the lap has no row"; "`isValid` boolean | null — `null` when the lap has no row"); `toComparedLap(lapNumber: number, row: LapRow | undefined): ComparedLap` returning `{ lapNumber: 0, lapTimeMs: 0, isValid: true }`; `comparedLapsBlock(primary: ComparedLap, comparison: ComparedLap): string` returning `"x"`; `invalidComparisonWarning(comparison: ComparedLap): string | null` returning `"x"`. (FR-001, FR-001a, FR-002, FR-003; D3)
- [x] T009 [US1] Red (seen failing: 13 of 26 failed, all `ERR_ASSERTION`, e.g. `+ 'x' - 'Voltas comparadas (mesma sessão):\n' …`; the 13 direction tests of T006 already passed): add to `src/coaching/coachReading.test.ts`: `toComparedLap` maps a `LapRow` and gives `null`s without one; `comparedLapsBlock` for (7,6) equals the first five lines of R§4's (7,6) message (`1:14.144, válida`, `1:14.306, inválida`, `0.162 s mais rápida`), for (6,8) `0.934 s mais lenta`, for (8,7) `0.772 s mais rápida`; equal times → `Diferença oficial: as duas voltas tiveram o mesmo tempo.`; a lap without row → `tempo oficial desconhecido, validade desconhecida` and the unknown-difference line of contracts/coach-message.md; always the line `Todos os deltas e diferenças abaixo são da volta principal contra a volta de comparação, e de nada mais.`. `invalidComparisonWarning`: comparison invalid → the warning text of contracts/coach-message.md; comparison valid with primary invalid → `null`; comparison validity unknown → `null`; both invalid → the warning. Run; confirm `assert` failures. (FR-001, FR-001a, FR-002, FR-003; SC-001; US1 scenarios 1, 4, 5; edge cases)
- [x] T010 [US1] Green: implement the four with the exact wording of R§4 and contracts/coach-message.md; the official difference `primary.lapTimeMs − comparison.lapTimeMs`, `(Math.abs(ms) / 1000).toFixed(3)`; lap times with the existing `formatLapTime` (`m:ss.sss`), moved here from `coachUserMessage.ts` and exported (the old builder imports it from here until T015). (FR-001, FR-001a, FR-002, FR-003; D3; principle IV)
- [x] T011 Commit 3 (T002–T010), after the key check, `npm test` and `npm run typecheck`: `feat: read the opportunities and the compared laps for the coach`. No README/CLAUDE.md change: nothing runs these modules yet.

---

## Phase 5: User Stories 1 and 2 — the new message, wired (P1) — commit 4

**Goal**: the coach receives the compared laps, the warning, the opportunity reading and the JSON, and no benchmark (FR-004, FR-005 input side, FR-010, FR-015).

**Independent test**: the rewritten `coachUserMessage.test.ts`, the new `lapRepository.test.ts`, typecheck of the router and `coachService`.

- [x] T012 [P] [US1] Red (seen failing: 2 of 3 failed on `ERR_ASSERTION`, e.g. `+ undefined - 74144`; the "no row" case passes against the `undefined` stub): `src/persistence/lapRepository.test.ts` (isolated database via `setupIsolatedTestDb()`, modules loaded with `require` after it): after `upsertCompletedLap` of laps 6 (74306, invalid) and 7 (74144, valid) in one session, `getLapForSession(session, 7)` returns `{ lapNumber: 7, lapTimeMs: 74144, isValid: true, … }`, lap 9 returns `undefined`, another session's lap is not returned. Add to `src/persistence/lapRepository.ts` `getLapForSession(sessionId: number, lapNumber: number): LapRow | undefined` returning `undefined`; run; confirm `assert` failures. (FR-001; D3; R§3)
- [x] T013 [US1] Green: a prepared statement at module load (`SELECT lap_number, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, is_valid, car_position, recorded_at FROM laps WHERE session_id = @sessionId AND lap_number = @lapNumber`), mapped like `listLapsForSession`. `getTrackBenchmark` unchanged. (FR-001, FR-004; D3)
- [x] T014 [US1] Create `src/coaching/coachModel.ts` with `export const COACH_MODEL = "claude-opus-4-8";` (no `env` import); `src/coaching/coachService.ts` uses it instead of its local `MODEL` (log line and return value unchanged). No behaviour change. (FR-013 support, FR-014; D5; contracts/prompt-version.md)
- [x] T015 [US1] Stub the new message: `src/coaching/coachUserMessage.ts` exports `buildCoachUserMessage(insights: LapInsights, primary: ComparedLap, comparison: ComparedLap): string` returning `""` (the `TrackBenchmark` parameter and import removed). Update the callers so the typecheck passes: `generateCoaching(insights, primary, comparison)` in `src/coaching/coachService.ts`; `src/http/routes/analysisRouter.ts` builds `primary`/`comparison` with `toComparedLap(lapA, getLapForSession(sessionId, lapA))` (and `lapB`) and no longer calls `getTrackBenchmark`. (FR-001, FR-004, FR-015; D1, D3)
- [x] T016 [US1] Red (seen failing: 7 of 8 failed, all `ERR_ASSERTION`; the "no benchmark" test passes against the `""` stub and only bites once the message exists): rewrite `src/coaching/coachUserMessage.test.ts` (its benchmark tests go: FR-004): for synthetic insights and laps, the blocks in contracts/coach-message.md order separated by one empty line; the warning block only with an invalid comparison; the opportunities header and one block per `topOpportunities` entry; `Oportunidades: nenhuma curva teve perda de tempo contra a volta de comparação.` when none; the last block `Dados completos (JSON):\n` + `JSON.stringify(insights)`; the message contains none of `Recorde`, `teórica`, `setor` (US1 scenarios 2–3: the same message whatever benchmark exists, since none is a parameter); for the (8,6) insights and laps written into the test from R§4, the whole message equals R§4's (8,6) text. Run; confirm `assert` failures. (FR-001–FR-006, FR-010, FR-015; SC-001; D1)
- [x] T017 [US1] Green: implement `buildCoachUserMessage` from `comparedLapsBlock`, `invalidComparisonWarning`, `topOpportunities` and `opportunityBlock`. `LapInsights` and the REST response are untouched (FR-010). (FR-001–FR-006, FR-010, FR-015; D1)
- [x] T018 [US1] Docs, same commit: `README.md` "Technical decisions" paragraph "The coach receives insights, never raw samples": the model no longer prioritises — the code ranks and labels the opportunities as the frontend does, writes each direction in words, and gives the two laps' numbers, official times and validity; no benchmark is sent; the "AI coach" feature line unchanged except "the code picks the opportunities". `CLAUDE.md` Conventions line "The AI coach only ever receives the derived `LapInsights` JSON, never raw samples" gains "plus the compared laps' official number, time and validity and the code's reading of the opportunities"; the `src/coaching/` row of the Architecture table (and README's) lists the reading and the opportunity rule. (FR-004, FR-006; constitution IV)
- [x] T019 Commit 4 (T012–T018), after the key check, `npm test` and `npm run typecheck`: `feat: tell the coach which laps it compares and read the opportunities for it`.

### First push and the draft pull request

- [x] T020 **[PARADA] [MANUAL] the maintainer approves the first push and the opening of the draft pull request.** Hands back: "go" for both.
- [x] T021 Push `004-coach-input` to `origin` (`git push -u origin 004-coach-input`) and open the pull request **as a draft**: `gh pr create --draft --base main --head 004-coach-input --title "feat: fix the coach's input (spec 004)" --body-file <scratch>/pr-body.md`. Body in English: spec summary, links to spec/plan/tasks/research, the contract note of contracts/analysis-endpoint.md (shape unchanged; the stale-row 503 comes with commit 7), "no frontend change". No attribution footer.
- [x] T022 Await and confirm the CI of this push (header procedure); add a "CI runs" table to `specs/004-coach-input/research.md` with the first row (committed with commit 5).

---

## Phase 6: User Stories 3 and 4 — the prompt and its version (P2) — commit 5

**Goal**: the new prompt of R§4 (FR-011, FR-012, FR-005) and `PROMPT_VERSION`, derived and line-ending independent (FR-013).

**Independent test**: `coachPrompt.test.ts` and `promptVersion.test.ts`.

- [x] T023 [P] [US3] Red: `src/coaching/coachPrompt.test.ts` over `COACH_SYSTEM_PROMPT` (the constant is not a function: the current prompt is the wrong value): contains the instruction to use only the given labels in the given order and the example `1. 334m · +0.29s`; `nada de "Curva 4"`; `Não fale de setores`; trail braking `false` not to be contradicted; the coasting definition and `Coasting não é patinar, derrapar nem perder tração`; the four sign statements (`brakingPointDiffM`, `peakBrakeDiff` with `escala de 0 a 1`, `throttleOnDiffM`, `deltaLossS`); the arbitrary sign of `avgLateralDeviationM`; `Nunca afirme onde nem por que uma volta foi invalidada`; `totalDeltaS` not to be cited; the review's rules (`retomada do acelerador na saída`, unmeasured states `insegurança, hesitação, medo, falta de confiança`, no sum of losses against the official difference, `ajuste fino`); and does **not** contain `normalmente a melhor volta`, `tração na saída`, `Curva 4 -`. Run against today's prompt; confirm `assert` failures. (FR-005, FR-011, FR-012; US3 scenarios 1–4; R§4)
- [x] T024 [US3] Green: replace the text of `COACH_SYSTEM_PROMPT` in `src/coaching/coachPrompt.ts` with the full prompt of R§4, character for character (the comment on lines 1–4 stays). Then, with a one-off `node -r ts-node/register -e` after the key check, compare the constant with the block of R§4 (as in R§4's check) and keep the output for T057. Any difference: **[PARADA]**. (FR-005, FR-011, FR-012; R§4)
- [x] T025 [P] [US4] (amended at T025 by the maintainer: **three** reference inputs, not two, and `PHRASE_TEMPLATES` exported by `coachReading.ts`; see plan "Amendments") Stub `src/coaching/promptVersion.ts`: `export function computePromptVersion(systemPrompt: string, buildMessage: typeof buildCoachUserMessage): string` returning `"0000000000000000"`; `export const REFERENCE_INPUTS` (two pairs, R§5: one with corners covering braking earlier/later/equal, harder/softer/equal, throttle earlier/later/`null`, the four trail-braking combinations, a corner with `deltaLossS ≤ 0`, and an invalid comparison lap with known times; one with unknown times and validity and no opportunity); `export const PROMPT_VERSION = computePromptVersion(COACH_SYSTEM_PROMPT, buildCoachUserMessage)`. Imports only `coachPrompt`, `coachUserMessage`, `coachReading` types and `node:crypto`. (FR-013; D4; contracts/prompt-version.md)
- [x] T026 [US4] (amended: instead of a hand-written list of phrases, the test walks `PHRASE_TEMPLATES` and requires each template in at least one reference message; red seen: 2 of 9 failed on `ERR_ASSERTION` against the constant stub, the other 7 pass vacuously or independently of the hash) Red: `src/coaching/promptVersion.test.ts`: matches `/^[0-9a-f]{16}$/`; the same inputs twice give the same value; one character added to the prompt changes it; a `buildMessage` wrapper that changes one phrase changes it; the prompt with every `\n` replaced by `\r\n` gives the same value as with `\n` (SC-004a), and a lone `\r` too; the reference messages contain each branch's phrase (`antes`, `depois`, `igual nas duas voltas`, `mais forte`, `mais leve`, `no mesmo ponto`, the four trail-braking phrases, `Aviso: a volta de comparação é inválida`, `tempo oficial desconhecido`, `nenhuma curva teve perda de tempo`) and do not contain the label of the `deltaLossS ≤ 0` corner; requiring the module loads neither `config/env` nor `persistence/db` (checked through `require.cache`). Run; confirm `assert` failures. (FR-013; SC-004, SC-004a; US4 scenarios 1–3; D4; TO-1)
- [x] T027 [US4] Green: SHA-256 (`node:crypto`) over the prompt normalized with `.replace(/\r\n?/g, "\n")`, the separator `"\n\u0000\n"`, and each reference message normalized the same way, joined by the same separator; first 16 hex characters. (FR-013; D4; R§5)
- [x] T028 [US3] Docs, same commit: `README.md` "Static system prompt": the 1,378-token figure is replaced by "the current prompt's token count is not measured yet (pending re-measurement by the maintainer)", keeping the caching explanation; a sentence that the coach's texts follow the prompt only as far as the model obeys, which no test can check, so generated texts are read before being published (FR-016). `CLAUDE.md` Known pitfalls: the token line says the current prompt is not measured yet and must be re-measured. The "CI runs" row of T022. (FR-016, FR-017; constitution IV)
- [ ] T029 Commit 5 (T023–T028), after the key check, `npm test` and `npm run typecheck`: `feat: rewrite the coach prompt and derive its version`.

---

## Phase 7: User Story 5 — the local cache stops serving texts of an old prompt (P3) — commits 6 and 7

**Goal**: `lap_analyses.prompt_version`, its migration and the upsert (commit 6); the staleness rule, single-flight and the resolver wired into the router (commit 7) (FR-014, FR-014a).

**Independent test**: `migrations.test.ts`, `analysisRepository.test.ts`, `analysisStaleness.test.ts`, `singleFlight.test.ts`, `analysisResolver.test.ts`; the agent's V3 check (T058).

### The column, the migration and the upsert — commit 6

- [ ] T030 [US5] Stub `src/persistence/migrations.ts`: `export function runMigrations(db: Database.Database): void` (type from `better-sqlite3`) doing nothing; `db.ts` unchanged yet. (FR-014a; D6; R§6)
- [ ] T031 [US5] Red: `src/persistence/migrations.test.ts`: the test creates a file under `os.tmpdir()` with `better-sqlite3`, creates `sessions (id INTEGER PRIMARY KEY)` and the **old** `lap_analyses` DDL copied literally from `main`'s `schema.ts:91-101`, inserts one row (`texto antigo`, `claude-opus-4-8`); calls `runMigrations` twice; asserts the column `prompt_version` exists (`PRAGMA table_info`), the row is intact with `prompt_version` `null`, and no error. A second test runs it on a database created with the new `SCHEMA_SQL`: no error, columns unchanged. No `DB_PATH`; the file is removed in `after()`. Run; confirm `assert` failures. (FR-014a; US5 scenario 4; R§6)
- [ ] T032 [US5] Green: `src/persistence/schema.ts` `lap_analyses` gains `prompt_version  TEXT` (nullable, data-model.md: "`NULL` on every row written before this feature"); `runMigrations` holds the two existing defensive `ALTER`s and the `CREATE UNIQUE INDEX IF NOT EXISTS` moved from `db.ts` (behaviour unchanged, TO-9) plus `ALTER TABLE lap_analyses ADD COLUMN prompt_version TEXT`, each ignoring only "duplicate column name"; `db.ts` calls `runMigrations(db)` after `db.exec(SCHEMA_SQL)`. The existing tests of `db.ts` (`dbWithoutPorts.test.ts`, `testDb.test.ts`) still pass. (FR-014a; D6; principle II, IV)
- [ ] T033 [US5] Red: `src/persistence/analysisRepository.test.ts` (isolated database): `saveAnalysis(sessionId, lapA, lapB, insightsJson, analysisText, model, promptVersion)` twice for the same key leaves one row with the same `id`, the second text, model and version, and a `createdAt` not earlier than the first; `getCachedAnalysis` returns `promptVersion`; a row inserted with raw SQL without `prompt_version` reads as `promptVersion: null`. Add `saveAnalysis` with that signature doing nothing, and `promptVersion: string | null` to `CachedAnalysis`; run; confirm `assert` failures. (FR-014; D6; R§6, R§7)
- [ ] T034 [US5] Green: `getCachedStmt` selects `prompt_version`; `saveAnalysis` is the upsert of data-model.md (`INSERT … ON CONFLICT(session_id, lap_a, lap_b) DO UPDATE SET insights_json, analysis_text, model, prompt_version, created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`), prepared at module load; `insertAnalysis` is removed and `analysisRouter.ts` calls `saveAnalysis(…, model, PROMPT_VERSION)`. The router still serves any cached row until commit 7. (FR-014; D6)
- [ ] T035 [US5] Docs, same commit: `README.md`, under "Getting started", a short "Upgrading an existing database" paragraph: the first start of this version adds `lap_analyses.prompt_version` to `data/telemetry.db`; before it, with the API stopped, back it up with the `VACUUM INTO` command of quickstart.md M1, and keep the copy until the change is merged. `CLAUDE.md` Known pitfalls: the first start of a version with a schema change migrates `data/telemetry.db` in place; back it up first (README). (FR-014a; CLAUDE.md Rules)
- [ ] T036 Commit 6 (T030–T035), after the key check, `npm test` and `npm run typecheck`: `feat: record the prompt version of each cached analysis`.
- [ ] T037 **[MANUAL] [PARADA] M1 — backup before the first start of the new version on the real database.** From this commit on, starting this branch's server on `data/telemetry.db` migrates it. With the API stopped, the maintainer runs quickstart.md M1 (`VACUUM INTO 'data/telemetry-before-004.db'` through `better-sqlite3`, read-only connection). Hands back either "backup done" with the file name and size, or "I will not start this branch on the real database before the merge" (then M1 is done before her first start after the merge). The agent never runs it.

### Staleness, single-flight and the resolver — commit 7

- [ ] T038 [P] [US5] Stub `src/coaching/analysisStaleness.ts`: `export function isCachedAnalysisCurrent(row: { model: string; promptVersion: string | null }, current: { model: string; promptVersion: string }): boolean` returning `true`. (FR-014; D6; data-model.md "State of a cached row")
- [ ] T039 [US5] Red: `src/coaching/analysisStaleness.test.ts`: same version and model → `true`; other version → `false`; other model → `false`; `promptVersion` `null` → `false`. Run; confirm `assert` failures. (FR-014; SC-004b)
- [ ] T040 [US5] Green: `row.promptVersion !== null && row.promptVersion === current.promptVersion && row.model === current.model`. (FR-014)
- [ ] T041 [P] [US5] Stub `src/coaching/singleFlight.ts`: `export function createSingleFlight<T>(): { run(key: string, fn: () => Promise<T>): Promise<T> }` whose `run` calls `fn()` every time (no sharing). (FR-014; D7; R§7; TO-6)
- [ ] T042 [US5] Red: `src/coaching/singleFlight.test.ts`: two `run` calls with the same key while the first is pending → `fn` called once, both receive the same value; different keys → two calls; after the first settles, a new `run` with the same key calls `fn` again; a rejection reaches both joiners and is not kept (the next `run` calls again). Run; confirm `assert` failures. (FR-014; D7)
- [ ] T043 [US5] Green: a `Map<string, Promise<T>>`; the entry is deleted in `finally` when the promise settles. (D7)
- [ ] T044 [US5] Stub `src/coaching/analysisResolver.ts`: `export function createAnalysisResolver(deps: { getCached(sessionId: number, lapA: number, lapB: number): CachedAnalysis | undefined; isConfigured(): boolean; buildInputs(sessionId: number, lapA: number, lapB: number): { insights: LapInsights; primary: ComparedLap; comparison: ComparedLap } | null; generate(insights: LapInsights, primary: ComparedLap, comparison: ComparedLap): Promise<{ text: string; model: string }>; save(sessionId: number, lapA: number, lapB: number, insightsJson: string, text: string, model: string, promptVersion: string): void; currentModel: string; currentPromptVersion: string }): { resolve(sessionId: number, lapA: number, lapB: number): Promise<AnalysisOutcome> }`, with `AnalysisOutcome` = `{ kind: "cached" | "generated"; analysis: string; insights: LapInsights } | { kind: "unavailable" } | { kind: "no-samples" }`; `resolve` returns `{ kind: "unavailable" }`. Imports no database and no `env`. (FR-014; D6, D7; contracts/analysis-endpoint.md)
- [ ] T045 [US5] Red: `src/coaching/analysisResolver.test.ts` with fakes (a counting `generate`, an in-memory `save`): a current row → `cached` with its text and parsed insights, `generate` not called, with and without the key; a stale row (other version, other model, `null` version) with the key → `generated`, `generate` once, `save` once with `currentModel` and `currentPromptVersion`; the same stale row without the key → `unavailable`, `generate` not called, the old text not returned; a missing row without the key → `unavailable`; `buildInputs` returning `null` → `no-samples`, `generate` not called; two concurrent `resolve` for the same stale pair → `generate` once, both `generated` (TO-7); a `generate` that throws → both callers receive the error, nothing saved, and the next `resolve` calls `generate` again. Run; confirm `assert` failures. (FR-014; SC-004b; US5 scenarios 1–3; D7)
- [ ] T046 [US5] Green: implement with `isCachedAnalysisCurrent` and one `createSingleFlight` per resolver keyed `` `${sessionId}:${lapA}:${lapB}` ``; inside the flight, `buildInputs` → `generate` → `save` → `generated`. (FR-014; D6, D7)
- [ ] T047 [US5] Wire `src/http/routes/analysisRouter.ts`: the request validation and the 404 stay; a module-level resolver with the real dependencies (`getCachedAnalysis`, `isCoachingConfigured`, `buildInputs` from the sample repositories, `buildInsights`, `getLapForSession`, `toComparedLap`; `generateCoaching`; `saveAnalysis`; `COACH_MODEL`; `PROMPT_VERSION`); outcomes mapped to contracts/analysis-endpoint.md: `cached` → 200 `cached: true`, `generated` → 200 `cached: false`, `unavailable` → 503 `coaching indisponível: configure ANTHROPIC_API_KEY`, `no-samples` → 400 `uma das voltas não tem amostras de telemetria`; `Coaching*` errors → 503/429/502 and others → 500 as today. Every status code and error string unchanged. (FR-010, FR-014; constitution VI)
- [ ] T048 [US5] Docs, same commit: `README.md` Known limitations: the "analysis cache" item removed; "Static system prompt" paragraph's last sentence: an analysed pair is sent again only when the prompt version or the model changes, and concurrent requests for the same pair share one call — recording the bug fixed by spec 004 (before: two paid calls, the second ending in a 500 on `SQLITE_CONSTRAINT_UNIQUE` that discarded its paid text; R§7); "Without `ANTHROPIC_API_KEY` …" line: analyses cached with the current prompt version and model are still served, older ones answer 503; the `src/coaching/` Architecture row mentions the prompt version and the resolver. `CLAUDE.md`: the `lap_analyses` pitfall removed; the "Without `ANTHROPIC_API_KEY`" pitfall reworded the same way; `src/coaching/` row as in README. (FR-014; constitution, "known limitations")
- [ ] T049 Commit 7 (T038–T048), after the key check, `npm test` and `npm run typecheck`: `feat: regenerate stale coach analyses once per pair`.
- [ ] T050 **[PARADA] [MANUAL] the maintainer approves the push of Phases 6–7.** Hands back: "go".
- [ ] T051 Push; await and confirm the CI (header procedure); the row goes into research.md "CI runs" (committed with commit 8).

---

## Phase 8: User Story 1 — inspecting the input at no cost (FR-016a) — commit 8

**Goal**: `npm run analyze` prints the insights, the exact coach message and the prompt version (contracts/analyze-cli.md).

**Independent test**: `src/coaching/analyzeOutput.test.ts` (the pure function that assembles the output). `tools/analyze.ts` stays thin (arguments, reads, one call, print) and is exercised by the agent's V2 run (T057) on a temporary database, not by a spawned-process test (amendment of 2026-10-23, plan.md "Amendments").

- [ ] T052a [US1] Stub `src/coaching/analyzeOutput.ts`: `export function formatAnalyzeOutput(insights: LapInsights, coachMessage: string, promptVersion: string): string` returning `""`. Pure: imports only the `LapInsights` type. (FR-016a; D8; contracts/analyze-cli.md)
- [ ] T052b [US1] Red: `src/coaching/analyzeOutput.test.ts` (flat `test()` calls, Portuguese names, synthetic insights built in the file): the output has the three headers `=== insights ===`, `=== mensagem do coach ===`, `=== versão do prompt ===` once each and in that order; the first section is exactly `JSON.stringify(insights, null, 2)`; the second is the given message verbatim (multi-line, with a blank line inside it, unchanged); the third is the given version; sections separated by one empty line, no trailing line break (the CLI's `console.log` adds it). One more case composes it with the real `buildCoachUserMessage` for a comparison lap without a row (`toComparedLap(3, undefined)`) and checks the output contains `tempo oficial desconhecido`. Run; confirm `assert` failures. (FR-016a; contracts/analyze-cli.md; TO-5)
- [ ] T052c [US1] Green: implement `formatAnalyzeOutput` (the three sections joined as the test pins). (FR-016a; D8)
- [ ] T053 [US1] `tools/analyze.ts`, thin: reads both laps with `getLapForSession` and builds `primary`/`comparison` with `toComparedLap`; calls `buildCoachUserMessage(insights, primary, comparison)` and prints `formatAnalyzeOutput(insights, message, PROMPT_VERSION)`; imports neither `coachService` nor `config/env`; the usage message, the integer check, the missing-samples message and every exit code unchanged. No test of its own (there is no logic in it beyond the calls); checked by T057 and by a keyless, temporary-database run before the commit. (FR-016a; D8)
- [ ] T054 [US1] Docs, same commit: `README.md` "Running without the game"/commands: `npm run analyze` prints the insights, the coach's message and the prompt version, no AI call, and its output is no longer a single JSON document; `CLAUDE.md` Commands line for `analyze` the same; the `tools/` rows unchanged except "analyze (insights, coach message, prompt version)". The "CI runs" row of T051. (FR-016a)
- [ ] T055 Commit 8 (T052a–T054), after the key check, `npm test` and `npm run typecheck`: `feat: print the coach message and prompt version in analyze`.

---

## Phase 9: Polish, validation and the pull request

- [ ] T056 Contract check (FR-010, constitution VI): `git diff main -- src/ws/messageFormat.ts src/http/routes/sessionsRouter.ts src/persistence/sessionRepository.ts src/persistence/carTelemetrySampleRepository.ts src/persistence/motionSampleRepository.ts` is empty; `git diff main -- src/http/routes/analysisRouter.ts` keeps every status code and error string; `LapRow` and the REST bodies unchanged. Record in research.md "Implementation evidence".
- [ ] T057 Quickstart V2 by the agent (FR-016a, SC-001, M3 input): after the key check with `keyless-ports.env`, `DB_PATH=<scratch>/v2.db npm run dev` and, in the same environment, `npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl --speed=2x` to completion; stop the server; confirm its log named the temporary database; then, after the key check with `keyless.env`, `npm run analyze -- 1 <a> <b>` for the six ordered pairs of laps 6, 7 and 8, each output saved to `<scratch>/m3/analyze-<a>-<b>.txt`. A one-off script compares each message section with R§4's block for that pair and the prompt constant with R§4's prompt block (T024's output). Record in research.md "Implementation evidence — the six messages": the commands, the comparison result, and the implemented `PROMPT_VERSION`. **Conditional [PARADA]**: any difference from the approved text, or a lap time other than 74.306 / 74.144 / 73.372 s.
- [ ] T058 Quickstart V3 by the agent (FR-014, SC-004b, contracts/analysis-endpoint.md), on the same temporary database, no key (key check with `keyless-ports.env`, the one that carries the ports): start the server; with a one-off `better-sqlite3` script on **that** file, insert a `lap_analyses` row for (8, 7) with `prompt_version` `NULL`; `POST /sessions/1/analysis {"lapA":8,"lapB":7}` → 503 with the unchanged body; set the row's `prompt_version` to the printed version and `model` to `claude-opus-4-8` → 200 `cached: true` with the stored text. Stop the server. Record in research.md.
- [ ] T059 **[MANUAL] [PARADA] M3 — reading the six messages.** The maintainer reads `<scratch>/m3/analyze-*.txt` (T057) against the six messages approved in R§4 and the comparison result. Hands back: "approved", or the changes she wants (which become new tasks before T064, each with its own commit and, if it changes the prompt or the message, a new `PROMPT_VERSION` recorded).
- [ ] T060 **[MANUAL] [PARADA] M2 — token count of the new prompt.** With her own key, in her own shell, the maintainer measures `COACH_SYSTEM_PROMPT` for `claude-opus-4-8` with Anthropic's token-counting endpoint, the same way as the 1,378-token figure (quickstart.md M2). Hands back: the token count, the method used, and whether it reaches the model's minimum cacheable length. The agent never runs it.
- [ ] T061 Docs with M2's result: `README.md` "Static system prompt" and `CLAUDE.md` Known pitfalls get the new figure and whether `cache_control` now applies (if it does, the pitfall line changes accordingly); commit `docs: record the token count of the new coach prompt`. (FR-017)
- [ ] T062 Documentation review (constitution IV): `grep -n "1,378\|benchmark changes\|responsible for prioritising\|keyed only by" README.md CLAUDE.md` finds nothing stale; the README "Tests" paragraph lists the new covered areas (the coach's reading and message, the prompt and its version, the cache migration and policy, the `analyze` output); FR-016's sentence is present. Fix anything stale here.
- [ ] T063 Recheck FR coverage against the code (every row of the table below) and record the result in research.md.
- [ ] T064 Set `specs/004-coach-input/spec.md` **Status** to "Implemented; pull request #<n>" (n from T021), mark the done tasks in this file, and commit T056–T063 with the pending "CI runs" row: `docs: record the validation of spec 004` (any fix from T062 that changes code goes in its own commit with the matching type).
- [ ] T065 **[PARADA] [MANUAL] the maintainer approves the push of Phases 8–9.** Hands back: "go".
- [ ] T066 Push; await and confirm the CI (header procedure). **CI red**: header rule (diagnose, fix in its own commit, **[PARADA]** for that push, re-run only for infrastructure).
- [ ] T067 Run `/speckit-converge` for spec 004 (every FR and SC against the code). Any appended task follows the same rules; each extra push is its own **[PARADA]**.
- [ ] T068 **[PARADA] before editing the pull request body**, since it is visible on GitHub; then `gh pr edit 004-coach-input --body-file <scratch>/pr-body.md` with: the spec summary, the contract note (shape unchanged; a stale cached pair answers 503 without the key), the bug fixed (R§7), the validation summary (T056–T058), the manual steps done (M1, M2, M3), the out-of-scope items, and the last push's CI row (run id, head SHA, `typecheck`, `test` from the jobs API). No attribution footer.
- [ ] T069 **[PARADA] [MANUAL] the maintainer approves marking the pull request ready for review.** Hands back: "go". Then `gh pr ready 004-coach-input`.
- [ ] T070 **[MANUAL] [PARADA] the merge is the maintainer's**, on GitHub with "Rebase and merge", with `typecheck` and `test` green and the branch up to date with `main` (ruleset). Hands back: "merged". If the branch is behind `main`, how to update it without rewriting published history (never `--force`) is decided by the maintainer at that point, with its own **[PARADA]** push and CI record.
- [ ] T071 After the merge: await and confirm the push-to-`main` CI run (jobs API) and the README badge; report it in the session.
- [ ] T072 Switch to an updated `main` and delete the branch locally (`git branch -d 004-coach-input`); deleting it on `origin`, if GitHub did not, is a push: **[PARADA]**.
- [ ] T073 Report to the maintainer: tasks done, evidence recorded, the implemented `PROMPT_VERSION` (for spec 003's amendment), and the items out of scope below.

---

## Outside this feature's tasks

- **Spec 003**: the seed's `formatVersion` 2 with `promptVersion` per entry, the start check against `PROMPT_VERSION`, the export's `--dry-run` (mandatory before its T061), and the merge with this spec's changes to `coachService.ts` (`COACH_MODEL` moved to `coachModel.ts`), `db.ts` (`runMigrations`), `lapRepository.ts` and `analysisRepository.ts` (`saveAnalysis` replaces `insertAnalysis`, which 003's seeding uses).
- **The analysis-engine spec**: the artefacts visible in the six messages (R§4).
- **The frontend**: no change; the duplicated opportunity rule is a known debt (R§2).
- **`.gitattributes` `eol` rules**: a later change (R§5).

---

## Dependencies & execution order

### Phase dependencies

- Phase 1 → Phases 3 and 4 (independent of each other except that both touch `coachReading.ts`, so their stubs/red/green run in sequence within that file) → T011 (commit 3).
- Phase 5 depends on Phases 3–4 (the message uses both readings) → T019 (commit 4) → first push (T020–T022).
- Phase 6 depends on Phase 5 (`PROMPT_VERSION` hashes the real builder; the prompt describes the new message) → commit 5.
- Phase 7 depends on Phase 6 (`PROMPT_VERSION`) and Phase 5 (`COACH_MODEL`, `getLapForSession`) → commits 6 and 7 → push (T050–T051).
- Phase 8 depends on Phases 5–6 → commit 8.
- Phase 9 depends on everything; M3 (T059) depends on T057; T061 on M2 (T060).

### After every push

Await the CI, confirm it through the jobs API, record the row; red CI follows the header rule.

### Within each pure function

Stub → red (seen failing on its own `assert`) → green, in that order, never merged into one task; the test and the implementation are committed together.

### Parallel opportunities

- T002 and T005 (different files: `opportunities.ts`, `coachReading.ts`).
- T012 with T014 (`lapRepository.*` vs `coachModel.ts`/`coachService.ts`) — T014 is not marked [P] because T015 edits `coachService.ts` right after.
- T023 and T025 (`coachPrompt.*` vs `promptVersion.ts`).
- T038 and T041 (`analysisStaleness.ts` vs `singleFlight.ts`).

## Parallel example: User Story 2

```text
T002 Stub src/coaching/opportunities.ts            (in parallel with)
T005 Stub the direction part of src/coaching/coachReading.ts
then T003 → T004 and T006 → T007, each pair in order.
```

## Implementation strategy

### MVP

Phases 3–5 (US1 and US2, commit 4): the coach already receives the laps, the official difference, the warning and the opportunities read by the code, with no benchmark — the cause of four of the five rejected texts. This is the first push.

### Incremental delivery

1. Commit 3–4: the input (US1, US2) → push and draft pull request.
2. Commit 5–7: the prompt and its version (US3, US4), the cache (US5) → push.
3. Commit 8 and validation: `analyze`, V2/V3, M1–M3 → push, converge, ready, merge.

## Notes

- `src/analysis/`, `src/telemetry/`, `src/ws/` and the frontend are not touched.
- The implemented `PROMPT_VERSION` differs from the prototype's (`395e27bac6daabc6`); T057 records it.

## FR coverage

| Requirement | Tasks |
|---|---|
| FR-001 laps, times, validity | T008–T010, T012–T013, T015–T017, T052a–T053 |
| FR-001a "not a target" warning | T008–T010, T016–T017 |
| FR-002 official difference in words | T008–T010, T016–T017 |
| FR-003 every delta against the comparison lap | T008–T010, T016–T017 |
| FR-004 no benchmark in the message | T015–T018 |
| FR-005 opening with the official difference | T016–T017 (input), T023–T024 (prompt) |
| FR-006 opportunity rule | T002–T004, T016–T017 |
| FR-007 chip label | T002–T004 |
| FR-008 directions in words | T005–T007 |
| FR-009 no new numbers | T005–T007, T008–T010 |
| FR-010 REST and insights unchanged | T017, T047, T056 |
| FR-011 labels and order, no own numbering | T023–T024 |
| FR-012 no sectors, no contradiction, coasting, signs, invalidation, lateral sign, review rules | T023–T024 |
| FR-013 prompt version, CRLF/LF | T025–T027 |
| FR-014 staleness, regenerate, 503 | T033–T034, T038–T048, T058 |
| FR-014a migration, backup, limitation removed | T030–T032, T035, T037, T048 |
| FR-015 no theoretical best | T015–T017 |
| FR-016 tests; human reading documented | T003–T052c (tests), T028, T059, T062 |
| FR-016a `analyze` prints message and version | T052a–T055, T057 |
| FR-017 no paid call; token figure withdrawn; M2 | header rules, T028, T060–T061 |
| FR-018 keyless dotenv; never `data/telemetry.db` | header rules, T001, T057–T058 |

| Success criterion | Tasks |
|---|---|
| SC-001 | T009, T016, T057 |
| SC-002 | T003 |
| SC-003 | T006 |
| SC-004, SC-004a | T026 |
| SC-004b | T039, T045, T058 |
| SC-005 | header rules; every commit task |
| SC-006 | T059 (and spec 003's reading of the generated texts) |
