# Implementation Plan: Fix the coach's input

**Branch**: `004-coach-input` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-coach-input/spec.md`

## Summary

The coach misread five of the six texts of the rejected demo seed because its input never said which laps were compared, left it to rank, number and read the signs of the opportunities itself, and put the personal best right before the data. This plan makes the code hand the coach a deterministic reading: the two laps with their official times, validity and official difference; up to three opportunities chosen, ordered and labelled exactly as the frontend chips are, with every direction written in words; a "not a target" warning when the comparison lap is invalid; no benchmark at all. A new prompt forbids what the texts invented. A prompt version, derived from the prompt and from the message the builder produces for fixed reference inputs, with line breaks normalized, is exported for spec 003 and recorded on each `lap_analyses` row; a stale row is regenerated and replaced with the key, 503 without it, with one paid call per pair at a time. `npm run analyze` prints the message and the version. Evidence, the six demo messages and the full new prompt are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (strict, CommonJS) on Node.js 22 (`.nvmrc`; ≥ 22.17 in `engines`)

**Primary Dependencies**: existing only — Express 5, `better-sqlite3`, `@anthropic-ai/sdk`; `node:crypto` (built-in) for the prompt version. No new dependency.

**Storage**: SQLite (`data/telemetry.db`, WAL). One new nullable column, `lap_analyses.prompt_version`, added by the existing defensive-`ALTER` migration pattern.

**Testing**: `node:test` + `node:assert/strict` via `ts-node/register`; pure functions test-first; the migration on a temporary database created with the old schema; the resolver with injected fakes; `analyze` through `src/persistence/testDb.ts`.

**Target Platform**: the local server (Windows, the maintainer's machine) and, through spec 003, the Linux hosting platform (which only imports the prompt version and never generates).

**Project Type**: web service (REST + WebSocket) with CLI tools.

**Performance Goals**: none new. The message building is a few string operations per request; the prompt version is computed once at module load.

**Constraints**: no paid call by the agent; dotenv commands with an empty `DOTENV_CONFIG_PATH` after the `false` check; nothing touches `data/telemetry.db` except the maintainer's own first start after her backup; REST and WebSocket shapes unchanged; the frontend not modified.

**Scale/Scope**: about eight source files changed or added under `src/coaching`, `src/persistence`, `src/http/routes` and `tools/analyze.ts`, their tests, `README.md` and `CLAUDE.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.1.0.

| Principle / rule | Check | Status |
|---|---|---|
| I. Validated binary parsing | No parser, layout or size changes. The research ingested the recording through the existing parsers, unchanged. | Pass (not affected) |
| II. Ingestion never crashes; config fails fast; optional capabilities degrade | The ingestion loop is untouched. The migration runs at startup like the existing ones: an unexpected `ALTER` error stops the process with its message (fail fast); "duplicate column" is the only error ignored. Without the key, a stale or missing pair answers the existing 503, not a crash. A failed generation is not cached and maps to the existing 429/502/500. | Pass |
| III. Deterministic analysis; the AI only explains; paid calls cached | `src/analysis/` is untouched. The coach still receives the `LapInsights` JSON and never raw samples. The lap numbers, official lap times and validity added to the message fit the principle: they are official values the game itself reports once per completed lap (`currentLapNum`, `lastLapTimeInMS`, `currentLapInvalid`, stored in `laps` by `lapCompletionDetector`), not telemetry samples. What the principle excludes is the per-distance sample stream, which the model would have to interpret; these are already-final facts about each lap, of the same kind as the insights, and principle IV ranks them above anything reconstructed from samples. The reading built from them and from the insights is pure, tested code. Every number it shows is in the insights or the official times; the only computed one is the official difference, by deterministic code. Paid calls: cached per pair; a stale row is regenerated because its input (prompt) changed; single-flight prevents two calls for the same pair at once. | Pass (confirmed at the plan review) |
| IV. Record what is known; never invent | A lap without a row says "desconhecido"; no time is estimated from samples. Old rows get `prompt_version` `NULL` (unknown), never a guessed version, and `NULL` counts as stale. Documentation describes only what is implemented; the token figure is withdrawn until re-measured. | Pass |
| V. Simple, embedded infrastructure | No new dependency (`node:crypto` is built-in). Prepared statements created at module load, snake_case → camelCase mapping in `analysisRepository` and `lapRepository`. Migration in the existing `db.ts` pattern. | Pass |
| VI. This repository owns the API contract | `POST /sessions/:id/analysis` keeps its request, response (`analysis`, `insights`, `cached`), status codes and error strings. Behaviour change called out: a pair whose cached row is stale now answers 503 without the key instead of the old text ([contracts/analysis-endpoint.md](contracts/analysis-endpoint.md)); the frontend already handles that 503 for uncached pairs. `GET /sessions/:id/benchmark` unchanged. WebSocket untouched. `CachedAnalysis` is an internal type, not a REST row type. No frontend change. | Pass |
| Tests on pure logic | Every new pure function has unit tests written first (research section 8). | Pass |
| Language rules | Identifiers, files and commits in English; logs, test names and comments in Portuguese; comments only for a non-obvious why. The coach-facing texts (prompt, reading) are in Portuguese, like today's prompt. | Pass |
| Workflow: SDD | Spec and clarifications committed (`f175b63`, `7d4b76d`); plan and tasks committed as `docs:` before any implementation commit. | Pass |
| Workflow: tests and typecheck before every commit | TDD failures are observed locally and never committed; test and implementation go in one `feat:` commit (research section 8). | Pass |
| Workflow: commit types | Only `docs:`, `feat:`, `fix:`, `test:`, `chore:` (no `ci:` change here), no `Co-Authored-By` trailer; the PR without a "Generated with" footer. | Pass |
| Workflow: known limitations | The `lap_analyses` limitation and the token figure are removed from `README.md` and `CLAUDE.md` in the commit that changes the behaviour. | Pass |
| Workflow: trade-offs as options | Listed under Trade-offs for the maintainer's decision. | Pass |
| Rules: real database | Manual tests and the research used temporary databases. The migration reaches `data/telemetry.db` only at the maintainer's first start after her `VACUUM INTO` backup (quickstart, M1). | Pass |

**Post-design re-check**: the design in [data-model.md](data-model.md), [contracts/](contracts/) and [quickstart.md](quickstart.md) adds nothing that changes the table above. No violation; Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-coach-input/
├── spec.md
├── plan.md              # this file
├── research.md          # evidence, the six demo messages, the new prompt
├── data-model.md
├── quickstart.md        # validation, and the maintainer's manual tasks
├── contracts/
│   ├── coach-message.md       # the message the coach receives (internal, read by the model and by spec 003)
│   ├── prompt-version.md      # the export spec 003 consumes
│   ├── analysis-endpoint.md   # POST /sessions/:id/analysis: shape unchanged, cache behaviour changed
│   └── analyze-cli.md         # npm run analyze output
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
src/
├── coaching/
│   ├── coachPrompt.ts              # CHANGED: the new prompt
│   ├── coachModel.ts               # NEW: COACH_MODEL (no env import)
│   ├── opportunities.ts            # NEW (pure): topOpportunities, opportunityLabel — the frontend rule
│   ├── coachReading.ts             # NEW (pure): ComparedLap, compared-laps block, official difference, direction phrases, invalid warning
│   ├── coachUserMessage.ts         # CHANGED (pure): buildCoachUserMessage(insights, primary, comparison); no benchmark
│   ├── promptVersion.ts            # NEW (pure + constant): computePromptVersion, reference inputs, PROMPT_VERSION
│   ├── analysisStaleness.ts        # NEW (pure): isCachedAnalysisCurrent
│   ├── singleFlight.ts             # NEW: per-key in-flight promise map
│   ├── analysisResolver.ts         # NEW: cache policy + single-flight, dependencies injected
│   ├── coachService.ts             # CHANGED: generateCoaching(insights, primary, comparison); model from coachModel
│   └── *.test.ts                   # NEW/CHANGED tests for each of the above
├── persistence/
│   ├── schema.ts                   # CHANGED: lap_analyses.prompt_version
│   ├── migrations.ts               # NEW: the defensive ALTERs as a function of the connection (moved from db.ts, plus the new one)
│   ├── db.ts                       # CHANGED: calls the migration function
│   ├── analysisRepository.ts       # CHANGED: reads prompt_version; upsert replaces the row
│   ├── lapRepository.ts            # CHANGED: getLapForSession
│   └── migrations.test.ts          # NEW
└── http/routes/
    └── analysisRouter.ts           # CHANGED: delegates to the resolver; reads the two laps; no benchmark

tools/
└── analyze.ts                      # CHANGED: also prints the coach message and the prompt version
```

**Structure Decision**: single project, the existing layout. The coach-facing logic stays in `src/coaching/` as small pure modules (the reading, the opportunity rule, the version, the staleness rule), so each is tested alone and none imports `env` or the database: `analyze` and spec 003 import them without the ports. Moving the two existing defensive `ALTER`s into `migrations.ts` together with the new one is the smallest change that makes the migration testable on a connection the test opens itself; their behaviour does not change. `analysisResolver.ts` sits in `src/coaching/` because it is the coach's cache policy; it receives the repositories and the coach as parameters, so it does not import the database either.

## Design decisions (from research)

1. **Message** ([contracts/coach-message.md](contracts/coach-message.md)): compared laps → optional invalid-comparison warning → opportunities (label + phrases) → `Dados completos (JSON):` + `JSON.stringify(insights)`. Research section 4.
2. **Labels**: the frontend's expressions verbatim (`Math.round`, `toFixed(2)`, U+00B7, literal `+`); research section 2.
3. **Laps**: `getLapForSession(sessionId, lapNumber)` → `ComparedLap { lapNumber, lapTimeMs | null, isValid | null }`; a missing row is unknown. Research section 3.
4. **Prompt version**: SHA-256 of the normalized prompt and the normalized reference messages, 16 hex; research section 5.
5. **Model**: `COACH_MODEL` in its own module, unchanged value `claude-opus-4-8`.
6. **Cache**: `prompt_version` column; current ⇔ same version and same model; upsert; research section 6.
7. **Concurrency**: single-flight per `(session, lapA, lapB)` in the resolver; research section 7.
8. **`analyze`**: prints the insights (as today), then the message and the version, with headers; [contracts/analyze-cli.md](contracts/analyze-cli.md).

## Commit sequence (proposed; tasks.md will refine)

Each commit passes `npm test` and `npm run typecheck`; `README.md` and `CLAUDE.md` change in the same commit as the behaviour they describe.

1. `docs:` plan, research, data model, contracts, quickstart (this phase, after approval).
2. `docs:` tasks.
3. `feat:` opportunity rule and label, direction phrases, compared laps and warning (pure, TDD).
4. `feat:` new message (no benchmark) wired into `coachService`, the router and their tests; reads the two laps.
5. `feat:` new prompt and the prompt version (TDD, CRLF/LF); `README.md`/`CLAUDE.md`: the 1,378-token figure withdrawn ("not measured yet"), the human-reading requirement (FR-016).
6. `feat:` `prompt_version` column and migration, upsert (tests on the old schema); `README.md`: the backup procedure before the first start.
7. `feat:` analysis resolver (staleness + single-flight) wired into the router; `README.md`/`CLAUDE.md`: the `lap_analyses` limitation removed; `README.md` records the concurrency bug (two paid calls for one pair, the second ending in a 500 on `SQLITE_CONSTRAINT_UNIQUE` that discards the paid text, research section 7) as fixed by spec 004.
8. `feat:` `npm run analyze` prints the message and the version; `README.md`/`CLAUDE.md` commands updated.

## Manual tasks of the maintainer

The agent never does these; they are in [quickstart.md](quickstart.md).

- **M1 — Backup before the first start**: with the API stopped, `VACUUM INTO` copy of `data/telemetry.db`, kept until this feature merges.
- **M2 — Token count of the new prompt**: with her key, the token-counting endpoint for `claude-opus-4-8`; the figure goes back into `README.md` and `CLAUDE.md` (and whether it now passes the model's minimum cacheable length).
- **M3 — Reading the six messages**: research section 4, before approving this plan; after implementation, the same six through `npm run analyze` on a temporary database, to confirm the implemented text matches what was approved.

## Trade-offs (for the maintainer's decision)

Decided at the plan review (2026-10-23): the maintainer approved the chosen option of all nine.

1. **Hash of reference messages vs. hash of the source files** (research section 5). Chosen: reference messages — the version changes only when what the coach receives changes. Cost: a new branch in the builder that the reference inputs do not exercise would not change the version; a test that checks the reference messages contain every branch's phrase guards it. Alternative: hash the files — changes on any comment or formatting edit and brings back the CRLF problem.
2. **Readings in words for five fields only** (FR-008: braking point, peak brake, trail braking, throttle pick-up, coasting). Oscillation and lateral deviation stay in the JSON, explained by the prompt (with the arbitrary sign of the lateral deviation). Alternative: read them too — more text and more room for engine artefacts to look authoritative; FR-008 does not ask for it.
3. **`peakBrakeDiff` in words with its value on the 0–1 scale** ("diferença de 0.8 numa escala de 0 a 1"). Alternative: percentage points ("80 pontos") — a number not in the insights (principle III/FR-009). Alternative: no value, only "mais forte/mais leve" — loses the size the coach may need.
4. **Numbers with a dot decimal** ("179.97 m", "0.162 s"), as in the chip label and the JSON. Alternative: Brazilian comma in the reading — matches the language but differs from the chip and the JSON the coach also sees; the coach writes its own text anyway.
5. **`analyze` output becomes three sections** (insights, message, version) instead of one JSON document. Anyone piping `npm run analyze` into a JSON parser breaks. Alternative: a flag (`--message`) keeping today's output by default — FR-016a says it must print both; a flag would make the default not satisfy it.
6. **Single-flight in memory, one process** (research section 7). Enough for the local server; two processes on one database would make two calls for one pair (the upsert keeps the last). Alternative: a lock row in the table — survives crashes as a stuck lock.
7. **Joiners of an in-flight generation get `cached: false`**, like the request that triggered it. Alternative: `cached: true` for joiners — they did not read the table; the frontend's "Análise em cache" badge would appear for a text produced right now.
8. **The prompt grows 47%** (3,236 → 4,749 characters) and each message by the reading: higher cost per call until M2 measures it; it may cross the minimum cacheable length, which would make `cache_control` start to work (to be seen in the usage log).
9. **Moving the two existing `ALTER`s into `migrations.ts`**: touches code that works, to make all migrations testable the same way. Alternative: only the new one in a function, the old ones left inline — two styles side by side.

## Out of scope, recorded

- **Duplicated opportunity rule** (frontend and API): known debt; the way out is the API delivering the ranked opportunities and labels in the analysis response and the frontend dropping its copy — a REST contract change, a later spec with a frontend counterpart (research section 2).
- **`.gitattributes` without `eol` rules**: debt; a later change (research section 5).
- **The engine artefacts** visible in the six messages: the analysis-engine spec.
- **Spec 003**: the seed's `formatVersion` 2 with `promptVersion`, the start check, the export's `--dry-run` (mandatory before T061), and the merge with this branch's changes to `coachService.ts` (003 exports `MODEL`; here it moves to `coachModel.ts`), `db.ts` and `lapRepository.ts`.
- **The spec's FR-004 wording**: corrected at the plan review — what stays is the benchmark's calculation and `GET /sessions/:id/benchmark`, not a display on screen (no frontend code requests it; research section 1).

## Not applicable

- **New dependencies**: none (`node:crypto` is built-in).
- **WebSocket contract**: not touched.
- **CI** (`ci.yml`, check names, ruleset): not touched; the new tests are found by the existing glob.
- **Frontend**: not changed by this spec.
- **Packet parsing (`src/telemetry/`)**: not touched.

## Complexity Tracking

No constitution violation; nothing to justify.
