---

description: "Task list for spec 003, demo mode for a public demonstration"
---

# Tasks: Demo mode for a public demonstration

**Input**: Design documents from `specs/003-demo-mode/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (`websocket.md`, `rest.md`, `coach-seed-file.md`, `configuration.md`) and quickstart.md are present.

**Tests**: requested (TDD, plan.md "Test strategy").

- **Pure functions** go through three separate tasks, always in this order: (1) **stub**: the module with the final signature and a body that returns a neutral wrong value (never a missing export, never a thrown "not implemented"); (2) **red**: the test written and run with `npm test`, seen failing **on its own `assert`** (an import error, a type error or a throw from the stub does not count as red; if it fails any other way, fix the stub, not the test); (3) **green**: the implementation, until the suite passes.
- Other code (database, sockets, the spawned server) is also test-first: the test is written and seen failing on its assertion before the implementation, in one task or two.
- A test that fails by design is committed together with the code that makes it pass, never alone, so no commit has a red suite (as in spec 002).
- Every test that needs a database uses `src/persistence/testDb.ts` (a disposable file) or `:memory:` in a spawned demo server. **No task opens, writes, copies or points anything at `data/telemetry.db`** (CLAUDE.md, Rules).
- No test can make a paid call: the coach is always a fake in tests, and demo mode refuses to start with a key.
- **No process the agent starts can see the maintainer's key.** `dotenv/config` loads `.env` from the current directory (or from `DOTENV_CONFIG_PATH`). An empty `ANTHROPIC_API_KEY=` on the command line is **not** enough: in `cmd` and in Windows PowerShell 5.1 an empty variable is removed, and `dotenv` then loads the key from `.env`. So:
  - every spawned test runs with a clean environment and a `cwd` outside the repository (as `src/config/serverFailFast.test.ts` does);
  - every server or tool the agent starts by hand (T026, T080, T081, T084–T086) runs either with its working directory outside the repository or with `DOTENV_CONFIG_PATH` pointing at a scratch `.env` that has no key (for local mode it holds only `WS_PORT`, `UDP_PORT`, `HTTP_PORT`; for demo mode it is empty), and **before starting it**, in the same environment, `node -e "require('dotenv/config'); console.log(Boolean(process.env.ANTHROPIC_API_KEY))"` must print `false`; if it prints `true`, nothing is started (**[PARADA]**);
  - `npm test` and `npm run typecheck` also run with `DOTENV_CONFIG_PATH` pointing at the empty scratch `.env`, after the same check: test files load `dotenv/config` through `src/config/dbPath.ts` from the repository's working directory, and the repository's `.env` does hold a key (found at T006, 2026-10-21, with the `Boolean(...)` check only; no test calls the coach, so nothing was spent);
  - the value of a key or the content of any `.env` is never printed;
  - only T061, the maintainer's, runs with a key.

**Commits**:

- Small Conventional Commits, English subject, **no `Co-Authored-By` trailer**. Allowed types: `feat`, `fix`, `docs`, `test`, `chore`, `ci`.
- **No attribution anywhere**: no `Co-Authored-By` trailer in any commit and no "Generated with Claude Code" footer (or any other attribution line) in the pull request body, even if a session reminder asks for one. This is the project's rule; it is not a choice to put to the maintainer.
- `npm test` and `npm run typecheck` pass before every commit; a failure is reported, never committed around.
- `README.md` and `CLAUDE.md` change **in the same commit as the behaviour they describe**, following plan.md's "Documentation" table. A behaviour becomes "visible" when a user can run it; building blocks that nothing runs yet get no documentation until the commit that wires them. While the branch is in progress, the README's "Demo mode" section says it is partial and lists only what exists (constitution IV).
- Text files are edited only with the Edit and Write tools, never with shell commands (CLAUDE.md, How to work in this repo).

**Markers**:

- **[MANUAL]**: done by the maintainer, not by the agent; each says what the maintainer hands back.
- **[PARADA]**: the session stops and waits for the maintainer, including at every conditional stop listed. The agent never pushes, opens or updates the pull request's state, or merges without the maintainer's explicit go-ahead for that specific action.
- **The agent never runs the coach seed export with a key** (T061 is [MANUAL]).

**Pull request and CI** (one pull request for the whole feature):

- It is opened **as a draft at the first push** (T020), and marked ready only at T094. It is the feature's only pull request: the spec's status line is set before the merge (T089), not by a second pull request.
- After **every** push, the CI is awaited and recorded: `gh run list --branch 003-demo-mode --limit 1 --json databaseId,headSha,event,status,conclusion`, then `gh run watch <databaseId> --exit-status`, then the jobs from the API: `gh api repos/AnaLauraFFerraz/TelemetryF1_API/actions/runs/<databaseId>/jobs --jq '.jobs[] | [.name, .status, .conclusion, .started_at, .completed_at] | @tsv'`. The row (push, head SHA, run id, `typecheck`, `test`) goes into the "CI runs" table of research.md, committed with the next group of changes; the last push's row goes into the pull request body (T097), since recording it in a commit would need one more push.
- **CI red**: the cause is diagnosed from the job log (`gh run view <id> --log-failed`), fixed in its own commit, and pushed after its own **[PARADA]**. A re-run (`gh run rerun <id> --failed`) is allowed **only for an infrastructure failure** (runner, network, GitHub outage), stated as such in the "CI runs" table; never to get past a real failure.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel: a different file from every other task it could run alongside, and no dependency on an incomplete task.
- **[Story]**: US1–US6 from spec.md. Setup, Foundational and Polish tasks carry no story label.
- Every task names its file(s), the FRs it serves and the plan decision it follows (T-1 … T-7 from plan.md "Decisions taken at the plan review", or the plan section).

---

## Phase 1: Setup

- [x] T001 Baseline, read-only, on branch `003-demo-mode`: `node -v` is v22.23.x (`fnm use` if not); `git status` clean; `npm run typecheck` passes and `npm test` reports 95 tests, 95 passing; the published recording is in `recordings/demo-interlagos-tt-20hz-laps6-8.jsonl` and its SHA-256 (`Get-FileHash -Algorithm SHA256`) equals the README's `c41bdfaf…b033`. No file changes. If any check differs, **[PARADA]** and report.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the build, the project root, the demo configuration and the lap-completion seam that every story uses.

### F1. Project root, build and start (FR-019; plan "Source code", research.md point 8) — the first implementation commit, which also documents the existing local-replay limitation (FR-021)

- [x] T002 Stub `src/config/projectRoot.ts`: `export function findProjectRoot(startDir: string = __dirname): string` that returns `startDir` unchanged (neutral wrong value).
- [x] T003 Red: write `src/config/projectRoot.test.ts` (test names in Portuguese): from `__dirname` it returns the folder whose `package.json` has `"name": "telemetryf1-server"`; from a nested folder created under `os.tmpdir()` with a `package.json` two levels up it returns that folder; from a temporary folder tree with no `package.json` up to the filesystem root it throws `[projectRoot] package.json não encontrado acima de <startDir>`. Run `npm test`; confirm the failure is an `assert` failure.
- [x] T004 Green: implement `findProjectRoot` (walk up with `path.dirname` until a `package.json` exists; throw the message above at the root).
- [x] T005 Change `src/config/dbPath.ts` to resolve `data/telemetry.db` as `path.join(findProjectRoot(), "data", "telemetry.db")`, keeping the `DB_PATH` semantics and its comment unchanged. Test first in `src/config/dbPathRoot.test.ts`: a child process (clean environment, `cwd` a temporary folder, as in `src/config/serverFailFast.test.ts`) runs `node -r ts-node/register -e "process.stdout.write(require('<repo>/src/config/dbPath').dbPath)"` and must print `<repo>/data/telemetry.db`. It only prints the path: nothing opens the database.
- [x] T006 Create `tsconfig.build.json` (extends `./tsconfig.json`; `compilerOptions.outDir: "dist"`, `noEmit: false`; `include: ["src", "tools"]`; `exclude: ["**/*.test.ts", "**/testFixtures.ts", "src/persistence/testDb.ts", "node_modules"]`) and, in `package.json`, `"build": "tsc -p tsconfig.build.json"` and `"start": "node dist/src/server.js"`. Verify: `npm run build` creates `dist/src/server.js`; with `DB_PATH` unset, `node -e "process.stdout.write(require('./dist/src/config/dbPath.js').dbPath)"` prints `<repo>\data\telemetry.db` (path only, nothing opened). `dist/` stays ignored.
- [x] T007 Docs for F1, in the same commit: `README.md` Getting started gains `npm run build` and `npm start`; `README.md` Known limitations gains "replaying an old recording in local mode moves its session's last-seen time to now, so the history shows its duration stretched to the current time" (spec Edge Cases, FR-021); `CLAUDE.md` Stack line ("no build step yet" → the build and start scripts), Commands (`npm run build`, `npm start`), the sentence "There are no `build`, `start` or `lint` scripts" → only `lint` remains absent, and the same limitation under Known pitfalls.
- [x] T008 Commit T002–T007: `feat: add a compiled build and start, resolving paths from the project root`.

### F2. Demo-mode configuration (FR-001, FR-002, FR-003, FR-004; contracts/configuration.md; plan "Start sequence" step 1)

- [x] T009 [P] Stub `src/config/mode.ts`: `export type RunMode = "local" | "demo"; export function parseRunMode(raw: string | undefined): RunMode` returning `"local"` for every input.
- [x] T010 [P] Stub `src/config/demoEnv.ts`: `export interface DemoConfig { port: number; allowedOrigin: string; maxConnections: number; maxConnectionMs: number; wsCompression: boolean; recordingPath: string; seedPath: string }` and `export function parseDemoConfig(env: NodeJS.ProcessEnv, projectRoot: string): DemoConfig` returning `{ port: 0, allowedOrigin: "", maxConnections: 0, maxConnectionMs: 0, wsCompression: false, recordingPath: "", seedPath: "" }` without reading `env`.
- [x] T011 Red: write `src/config/mode.test.ts` and `src/config/demoEnv.test.ts`. The messages are fixed by these tests, in Portuguese:
  - `parseRunMode`: `undefined` and `""` → `"local"`; `"true"` → `"demo"`; `"yes"` → throws `Variável de ambiente DEMO_MODE="yes" inválida: use "true" para o modo demo, ou deixe vazia para o modo local.`
  - `parseDemoConfig` with a valid environment returns port, origin, `maxConnections` 5, `maxConnectionMs` 300000 (5 minutes), `wsCompression` true, `recordingPath` `<root>/recordings/demo-interlagos-tt-20hz-laps6-8.jsonl`, `seedPath` `<root>/demo/coach-seed.json`; `DEMO_MAX_CONNECTIONS=2`, `DEMO_MAX_CONNECTION_MINUTES=1`, `DEMO_WS_COMPRESSION=false`, `DEMO_RECORDING_PATH`, `DEMO_SEED_PATH` are honoured;
  - throws `O modo demo não aceita ANTHROPIC_API_KEY: remova a variável (o modo demo nunca faz chamada paga).` when the key is non-empty (FR-003);
  - throws `O modo demo não aceita DB_PATH: o banco do modo demo é sempre em memória.` when `DB_PATH` is non-empty (FR-004);
  - throws `Variável de ambiente PORT não definida (obrigatória no modo demo).` and `Variável de ambiente PORT="abc" não é uma porta válida (1-65535).`;
  - throws `Variável de ambiente DEMO_ALLOWED_ORIGIN não definida (obrigatória no modo demo).` and, for `https://x.github.io/app` and `https://x.github.io/`, `Variável de ambiente DEMO_ALLOWED_ORIGIN="<valor>" não é uma origem válida (esquema://host[:porta], sem caminho nem barra no fim).`;
  - throws `Variável de ambiente DEMO_MAX_CONNECTIONS="0" deve ser um inteiro ≥ 1.` (same wording for `DEMO_MAX_CONNECTION_MINUTES`);
  - `DEMO_WS_COMPRESSION` unset or `""` → true, `"false"` → false, `"no"` → throws `Variável de ambiente DEMO_WS_COMPRESSION="no" inválida: use "true" ou "false".`
  Run `npm test`; confirm `assert` failures.
- [x] T012 Green: implement `src/config/mode.ts` and `src/config/demoEnv.ts` (the key and `DB_PATH` checks first, before any other).
- [x] T013 Change `src/config/env.ts` so the three ports are read (with today's exact messages) only when `parseRunMode(process.env.DEMO_MODE)` is `"local"`; `src/config/dbPath.ts` so it returns `":memory:"` in demo mode; and `src/server.ts` so that, in demo mode, it calls `parseDemoConfig(process.env, findProjectRoot())` before anything else (an error prints its message and exits 1, binding no port and opening no database) and, if the configuration is valid, prints `[demo] modo demo ainda não disponível nesta versão: só a configuração é validada.` and exits 1 (a temporary state of the branch, replaced in T075; it keeps a demo run from falling into the local wiring with undefined ports). Tests first: in `src/config/dbPathRoot.test.ts` (same child-process method as T005), `DEMO_MODE=true` prints `:memory:` and `DEMO_MODE` unset still prints `<repo>/data/telemetry.db`; a new spawned `src/config/demoFailFast.test.ts` (clean environment, `cwd` a temporary folder) starts `src/server.ts` with `DEMO_MODE=true` and each of: `ANTHROPIC_API_KEY` set, `DB_PATH` set, `PORT` missing, and asserts exit ≠ 0, the exact message from T011 on stderr, and no database file created; plus `DEMO_MODE=yes` with its message. `src/config/serverFailFast.test.ts` and `src/persistence/dbWithoutPorts.test.ts` stay green unchanged (FR-001).
- [x] T014 Docs for F2, same commit, describing only what exists at this commit: `README.md` gains a "Demo mode" section marked partial ("being built in this branch; at this point only the configuration is validated, and the server stops after validating it"), with the configuration table of `contracts/configuration.md` (including `DEMO_WS_COMPRESSION`) and the refusals; `.env.example` gains a commented demo-mode block (`DEMO_MODE`, `PORT`, `DEMO_ALLOWED_ORIGIN`, the optional settings including `DEMO_WS_COMPRESSION`; no key); `CLAUDE.md` Configuration paragraph (demo variables; the ports are not read in demo mode) and database-path paragraph (demo mode uses an in-memory database, and refuses `DB_PATH`).
- [x] T015 Commit T009–T014: `feat: add the demo-mode configuration and its fail-fast checks`.

### F3. The completed lap from persistence (FR-010 prerequisite; research.md point 4)

- [x] T016 Red: write `src/persistence/persistTelemetryCompletion.test.ts` (isolated database via `setupIsolatedTestDb`, packets from `buildSyntheticRecording()` in `src/replay/testFixtures.ts`): `persistTelemetry` returns `null` for every packet except the closing lap data packet, which returns the completed lap with `lapNumber` 1 and the expected lap time. First change the signatures of `persistTelemetry` (`src/persistence/persistTelemetry.ts`) and `handleLapDataPacket` (`src/persistence/sessionContext.ts`) to return `CompletedLap | null`, both returning `null` always (stub); run `npm test`; confirm the `assert` failure.
- [x] T017 Green: `handleLapDataPacket` returns the detector's completed lap (or `null`), `persistTelemetry` returns it for packet id 2 and `null` otherwise; `src/server.ts` keeps ignoring the value. No other behaviour changes.
- [x] T018 Commit T016–T017: `feat: return the completed lap from persistTelemetry`.

### First push and the draft pull request

- [x] T019 **[PARADA] [MANUAL] the maintainer approves the first push and the opening of the draft pull request.** Hands back: "go" for both.
- [x] T020 Push `003-demo-mode` to `origin` and open the pull request **as a draft**: `gh pr create --draft --base main --head 003-demo-mode --title "feat: demo mode for a public demonstration (spec 003)" --body-file <scratch>/pr-body.md`. The body (English) summarizes the spec, links spec/plan/tasks, and starts the "Changes the frontend sees" list from plan.md (14 items) for the frontend's spec 003 (FR-020). No attribution footer (see Commits).
- [x] T021 Await and record the CI of this push (procedure in the header): add a "CI runs" table to `specs/003-demo-mode/research.md` with the first row. It is committed with the next commit (T028).

**Checkpoint**: the build exists, paths agree between `src/` and `dist/`, the demo configuration is validated, local mode is unchanged (suite green).

---

## Phase 3: User Story 1 — a visitor explores a live-looking session (P1) 🎯 MVP building blocks

**Goal**: the recording, the in-process session build, the single-car message, the origin and capacity decisions and the demo WebSocket server, each tested on its own (FR-005–FR-009, FR-016, FR-018, FR-023, FR-024, FR-025; T-1, T-3, T-4, T-7). They are wired into a running server in Phase 7.

**Independent Test**: `npm test` runs the recording, session-build, player-only, origin/capacity and demo-WebSocket tests green; the session-build test stores exactly the synthetic recording's lap and samples.

### The recording (FR-007; T-4; research.md point 2)

- [x] T022 [US1] Stub `src/demo/recording.ts`: `export const PUBLISHED_RECORDING_SHA256 = "c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033"`; `export interface DemoPacket extends RecordedPacket { receivedAt: number | undefined }`; `parseRecording(text: string): DemoPacket[]` returning `[]`; `sha256Hex(data: Buffer): string` returning `""`; `verifyRecording(data: Buffer, expectedSha256: string): void` that never throws.
- [x] T023 [US1] Red: write `src/demo/recording.test.ts`: `parseRecording` decodes `timestampMs`, `receivedAt` and the base64 `data` of each non-empty line and keeps `receivedAt` `undefined` when absent; `sha256Hex(Buffer.from("abc"))` equals `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`; `verifyRecording` throws `[demo] gravação não confere com o SHA-256 esperado (esperado <e>, obtido <o>).` on a mismatch; `README.md` (read from `findProjectRoot()`) contains `PUBLISHED_RECORDING_SHA256`. Run; confirm `assert` failures.
- [x] T024 [US1] Green: implement `parseRecording`, `sha256Hex` (`node:crypto`), `verifyRecording`.
- [x] T025 [US1] Test first, then implement, `ensureRecording(destPath: string, fetchFn: typeof fetch): Promise<"present" | "downloaded">` in `src/demo/recording.ts` (test in `src/demo/recording.test.ts`, with a fake `fetchFn`, files under `os.tmpdir()`): an existing file with the right hash → `"present"` and `fetchFn` not called; missing → downloads, writes to `<dest>.part`, verifies, renames, `"downloaded"`; wrong hash → throws the `verifyRecording` message and leaves no file at `destPath` or `.part`; a non-2xx status → throws `[demo] download da gravação falhou: HTTP <status> em <url>`. The URL is the Release asset in README.md.
- [x] T026 [US1] Create `tools/fetchDemoRecording.ts` (thin CLI: `ensureRecording(process.env.DEMO_RECORDING_PATH || <root>/recordings/demo-interlagos-tt-20hz-laps6-8.jsonl, fetch)`, logs `[fetchDemoRecording] …` in Portuguese, exits 1 with the message on error) and append `&& node dist/tools/fetchDemoRecording.js` to the `build` script in `package.json`. Verify: `npm run build` with the recording present logs that it is already verified and downloads nothing; with `DEMO_RECORDING_PATH` pointing to a new empty folder under the scratch directory, it downloads 25,173,414 bytes and verifies them. Record both outputs in research.md "Implementation evidence".
- [x] T027 [US1] Docs, same commit, describing only what exists at this commit: `README.md` Getting started and Demo mode (partial): the build downloads the recording from the Release and verifies its SHA-256, and skips the download when a verified copy is present; `CLAUDE.md` Commands: `npm run build` also downloads and verifies the recording. The start-time refusal of a missing or altered recording is documented in T076, when it exists.
- [x] T028 [US1] Commit T022–T027 (plus the pending "CI runs" row from T021): `feat: download and verify the demo recording at build time`.

### The in-process session build (FR-005, FR-006, FR-008, FR-009; T-1; research.md point 3)

- [x] T029 [US1] Red: write `src/demo/buildDemoSession.test.ts` (isolated database; `buildSyntheticRecording()` with `receivedAt` added to every packet, increasing by 50 ms): `buildDemoSession(packets)` returns `{ sessionId, sessionUid, firstReceivedAt, lastReceivedAt, completions: [{ lapNumber, receivedAt }] }` matching the fixture; the database holds 1 session, the fixture's lap and `expectedSampleCount` samples per table; a packet that throws in `dispatchPacket` (a truncated buffer appended to the input) is skipped, not fatal (constitution II). Create `src/demo/buildDemoSession.ts` with the final signature returning `{ sessionId: 0, sessionUid: "", firstReceivedAt: undefined, lastReceivedAt: undefined, completions: [] }` and touching nothing; run; confirm `assert` failures.
- [x] T030 [US1] Green: implement `buildDemoSession` (every packet through `dispatchPacket` + `persistTelemetry`, in order, per-packet try/catch logging `[demo] pacote descartado na montagem: …`; first/last `receivedAt` of packets with a non-zero `sessionUID`; completions from T017's return value). Commit T029–T030: `feat: build the demo session in-process from the recording`.

### The single-car message (FR-025; T-3; research.md point 6)

- [x] T031 [P] [US1] Stub `src/demo/playerOnly.ts`: `export function toPlayerOnlyMessage<T>(message: TelemetryWsMessage<T>): TelemetryWsMessage<T>` returning `message` unchanged.
- [x] T032 [US1] Red: write `src/demo/playerOnly.test.ts`: for a message with 22 cars and `playerCarIndex` 7, the result has `data` of length 1 equal to car 7 and `playerCarIndex` 0; `type`, `sessionUID`, `sessionTime`, `frameIdentifier` unchanged; the input object and its array are not mutated. Run; confirm `assert` failures.
- [x] T033 [US1] Green: implement `toPlayerOnlyMessage`.

### Origin and capacity decisions (FR-018, FR-023; research.md point 5)

- [x] T034 [P] [US1] Stub `src/demo/liveConnections.ts`: `decideOrigin(origin: string | undefined, allowedOrigin: string): "accept" | "refuse"` and `decideCapacity(openConnections: number, maxConnections: number): "accept" | "full"`, both returning `"accept"`.
- [x] T035 [US1] Red: write `src/demo/liveConnections.test.ts`: `decideOrigin` accepts the exact origin and an absent `Origin`; refuses another origin, the allowed origin with a trailing slash, and a different case of the host; `decideCapacity` accepts 0…max−1 open and returns `"full"` at max, for max 1 and 5. Run; confirm `assert` failures.
- [x] T036 [US1] Green: implement both. Commit T031–T036: `feat: add the single-car message and the live-connection decisions`.

### The demo WebSocket server (FR-016, FR-018, FR-023, FR-024, FR-025, FR-028 counters; T-3; contracts/websocket.md)

- [x] T037 [US1] Red: write `src/network/demoWsServer.test.ts` (an `http.Server` on `127.0.0.1:0`, `ws` clients): with `allowedOrigin` `http://localhost:5173`, a client with `Origin: https://example.com` gets HTTP 403 (`unexpected-response`); clients without `Origin` and with the allowed origin open; with `maxConnections` 1, the second open closes with code **4001**, reason `"demo full"`; with `maxConnectionMs` 300, an open connection closes with **4002**, reason `"time limit"`, and its timer is cleared when it closes earlier; with `perMessageDeflate: {}`, a client offering it has `extensions` containing `permessage-deflate`; with `perMessageDeflate: false`, none; `broadcast(json)` reaches every open client; `stats()` returns open connections and the sum of `socket.bytesWritten` of closed and open sockets (> 0 after a broadcast); `onEvent` receives `opened`, `closed` with the code, `refused-origin` and `full`. Add to `src/network/wsBroadcaster.ts` the final signature `attachDemoWsServer(server: http.Server, options: { allowedOrigin: string; maxConnections: number; maxConnectionMs: number; perMessageDeflate: false | PerMessageDeflateOptions; onEvent?: (event: DemoWsEvent) => void }): { broadcast(json: string): void; stats(): { openConnections: number; bytesWritten: number }; close(code: number, reason: string): void }` doing nothing (no `upgrade` listener); run; confirm `assert` failures (not timeouts: every wait in the test has its own short deadline that fails an `assert`).
- [x] T038 [US1] Green: implement `attachDemoWsServer` (`noServer: true`, the server's `upgrade` handler with `decideOrigin` → `socket.write("HTTP/1.1 403 Forbidden\r\n\r\n")` + `destroy()`; `handleUpgrade`; `decideCapacity` → `close(4001, "demo full")`; per-connection timer → `close(4002, "time limit")`; the existing 15-second heartbeat, extracted into a helper shared with `startWsBroadcaster`, whose standalone behaviour is unchanged). Commit T037–T038: `feat: add the demo WebSocket server with origin, capacity, time limit and compression`.

**Checkpoint**: every US1 building block is green in isolation. Nothing runs in demo mode yet.

- [ ] T039 **[PARADA] [MANUAL] the maintainer approves the push of Phase 3.** Hands back: "go".
- [ ] T040 Push; await and record the CI (header procedure) in the research.md "CI runs" table (committed with the next group).

---

## Phase 4: User Story 2 — the session's dates and duration stay believable (P1)

**Goal**: capture times from `receivedAt` for the session and its laps, written once after the build (FR-010, FR-011; research.md point 4).

**Independent Test**: after `buildDemoSession` + `applyCaptureTimes` on the synthetic recording, `GET`-shaped reads (`getSessionById`, `listLapsForSession`) return the fixture's capture times; local ingestion still writes wall-clock times.

- [ ] T041 [P] [US2] Stub `src/demo/captureTimes.ts`: `export interface CaptureTimes { startedAt: string; lastSeenAt: string; lapRecordedAt: Map<number, string> }` and `buildCaptureTimes(firstReceivedAt: number | undefined, lastReceivedAt: number | undefined, completions: Array<{ lapNumber: number; receivedAt: number | undefined }>): CaptureTimes` returning `{ startedAt: "", lastSeenAt: "", lapRecordedAt: new Map() }`.
- [ ] T042 [US2] Red: write `src/demo/captureTimes.test.ts`: for `1792168223797`, `1792168446755` and laps 6/7/8 at `1792168298248`, `1792168372362`, `1792168445758` it returns `2026-10-16T16:30:23.797Z`, `2026-10-16T16:34:06.755Z` and the three ISO times (research.md point 4); a missing first, last or lap `receivedAt` throws `[demo] a gravação não tem receivedAt em <onde>: o modo demo não inventa datas.` (FR-010, constitution IV); last < first throws. Run; confirm `assert` failures.
- [ ] T043 [US2] Green: implement `buildCaptureTimes` (`new Date(ms).toISOString()`).
- [ ] T044 [US2] Red, then green: `applyCaptureTimes(sessionId: number, times: CaptureTimes): void`, split as `applySessionCaptureTimes` in `src/persistence/sessionRepository.ts` (`UPDATE sessions SET started_at = @startedAt, last_seen_at = @lastSeenAt WHERE id = @id`) and `applyLapCaptureTimes` in `src/persistence/lapRepository.ts` (`UPDATE laps SET recorded_at = @recordedAt WHERE session_id = @sessionId AND lap_number = @lapNumber`), prepared statements at module load; the combining function in `src/demo/captureTimes.ts`. Test in `src/demo/applyCaptureTimes.test.ts` (isolated database, synthetic recording through `buildDemoSession`): after the call, `getSessionById` and `listLapsForSession` return the synthetic capture times; a session ingested without it keeps SQLite's wall-clock format (FR-011). No existing statement changes.
- [ ] T045 [US2] Commit T041–T044: `feat: compute and apply the recording's capture times`.

**Checkpoint**: dates are ready to be applied by the demo server (Phase 7).

---

## Phase 5: User Story 5 — the maintainer prepares the coach cache once (P2)

**Goal**: the insight comparison, the seed file's validation and seeding, the idempotent export core and CLI, then the maintainer's one-off export and the committed file (FR-012, FR-013, FR-014; T-2, T-5; contracts/coach-seed-file.md; research.md point 7).

**Independent Test**: with a fake coach, the export core produces six entries on an empty seed and zero calls on a second run; `validateCoachSeed` accepts a valid synthetic seed and refuses each documented defect.

### The insight comparison (FR-013; T-5)

- [ ] T046 [P] [US5] Stub `src/demo/insightsMatch.ts`: `export type InsightsMatch = { match: true } | { match: false; path: string; stored: unknown; computed: unknown }` and `insightsMatch(stored: unknown, computed: unknown): InsightsMatch` returning `{ match: true }`.
- [ ] T047 [US5] Red: write `src/demo/insightsMatch.test.ts` (fixtures from `makeSample`/`buildInsights` in `src/analysis/testFixtures.ts`, or literal `LapInsights` objects): equal objects match; `0.35` vs `0.36` matches; `0.35` vs `0.37` does not; `1234.56` vs `1234.57` matches; a copied distance differing by one ulp (`x` vs `x + Number.EPSILON * x`) matches; one corner more, `trailBrakingPrimary` flipped, `severity` changed, `null` vs a number, a missing key and an extra key do not; the failure's `path` is the first difference, for example `corners[1].deltaLossS`. Tolerance: `Math.abs(a - b) <= 0.01 + 1e-9` (research.md point 7). Run; confirm `assert` failures.
- [ ] T048 [US5] Green: implement `insightsMatch` (recursive; arrays by index and length; objects by sorted key sets; numbers by the tolerance; everything else by `===`).

### The seed file (FR-012, FR-013; contracts/coach-seed-file.md)

- [ ] T049 [P] [US5] Stub `src/demo/coachSeed.ts`: the types of contracts/coach-seed-file.md (`CoachSeedFile`, `CoachSeedEntry`) and `validateCoachSeed(raw: unknown, context: { recordingSha256: string; sessionUid: string; completedLaps: number[]; computeInsights: (lapA: number, lapB: number) => LapInsights }): CoachSeedFile`, returning `raw as CoachSeedFile` without checking.
- [ ] T050 [US5] Red: write `src/demo/coachSeed.test.ts`: a valid synthetic seed is returned; each of these throws a message naming the problem, in Portuguese and prefixed `[demo] cache do coach inválido:` — not an object, `formatVersion` ≠ 1, `recordingSha256` different (message names both hashes), `sessionUid` different, a lap not in `completedLaps`, `lapA = lapB`, a duplicate pair, an entry without `analysisText`, a key outside the contract at the top level or in an entry (for example `usage` or `createdAt`: the file is public and holds nothing about the account, the request or the usage, contracts/coach-seed-file.md), and insights beyond the tolerance (message names the pair and `insightsMatch`'s path, values stored and computed). Run; confirm `assert` failures.
- [ ] T051 [US5] Green: implement `validateCoachSeed`.
- [ ] T052 [US5] Test first, then implement, `applyCoachSeed(sessionId: number, seed: CoachSeedFile): void` in `src/demo/coachSeed.ts`, inserting each entry with the existing `insertAnalysis` (`JSON.stringify(entry.insights)`, `analysisText`, `model`). Test in `src/demo/applyCoachSeed.test.ts` (isolated database): after the call, `getCachedAnalysis(sessionId, lapA, lapB)` returns each entry. Commit T046–T052: `feat: validate and apply the coach seed file`.

### The export core and CLI (FR-014; T-2; quickstart.md section D)

- [ ] T053 [US5] Red: write `src/demo/exportCoachSeed.test.ts` (isolated database, synthetic recording with two laps, so two ordered pairs; a **fake** `generate` function that counts calls and returns `{ text: "análise <a>-<b>", model: "modelo-falso" }`): `exportCoachSeed({ packets, recordingSha256, pairs, existing, generate, currentModel })` returns a seed with one entry per pair and calls `generate` once per pair on an empty `existing`; called again with its own result as `existing`, it calls `generate` zero times; with one entry's `insights` altered beyond the tolerance, it calls once; with `currentModel` different from an entry's `model`, it calls for that entry. Create the function with that signature in `src/demo/coachSeed.ts` returning an empty seed without calling `generate`; run; confirm `assert` failures.
- [ ] T054 [US5] Green: implement `exportCoachSeed` (`buildDemoSession`, `buildCaptureTimes` + `applyCaptureTimes`, `buildInsights` per pair from the repositories, `insightsMatch` to decide reuse, `generate(insights, getTrackBenchmark(trackId))` otherwise; entries sorted by `lapA`, `lapB`; each entry built with exactly the contract's fields `lapA`, `lapB`, `model`, `analysisText`, `insights`, so the result passes `validateCoachSeed`, which T053's test also asserts).
- [ ] T055 [US5] Create `tools/exportCoachSeed.ts`: refuses to run when `DB_PATH` is unset or resolves to `<root>/data/telemetry.db` (`[exportCoachSeed] defina DB_PATH=:memory: ou um caminho temporário; o data/telemetry.db nunca é usado.`), and when `ANTHROPIC_API_KEY` is unset; reads and verifies the recording against `PUBLISHED_RECORDING_SHA256`; uses the six ordered pairs of laps 6, 7 and 8 (T-2); passes the existing `demo/coach-seed.json` if present; uses `generateCoaching` as `generate` and the coach's model constant as `currentModel` (exported from `src/coaching/coachService.ts` if it is not yet); prints per pair `reutilizado` or the call's token `usage` (already logged by `coachService`); writes `demo/coach-seed.json` (2-space JSON, trailing newline). Add `"export-coach-seed": "ts-node-dev tools/exportCoachSeed.ts"` to `package.json`. A spawned test in `src/demo/exportCoachSeedCli.test.ts` (clean environment without `ANTHROPIC_API_KEY`, `cwd` a temporary folder so no `.env` is loaded) checks only the two `DB_PATH` refusals and the refusal without a key; nothing can be called. **The agent does not run the CLI with a key.**
- [ ] T056 [US5] Docs, same commit: `README.md` Demo mode (partial): the seed file, what it is tied to, the tolerance check, and the maintainer's export procedure (quickstart.md section D); Commands: `npm run export-coach-seed` (paid, manual); Known limitations: the demo seeds six ordered pairs while today's frontend, which fixes the primary lap to the latest one, can request only (8, 6) and (8, 7) (FR-021, T-2). `CLAUDE.md` Commands (`export-coach-seed`, paid, never run by the agent) and Known pitfalls (the same limitation).
- [ ] T057 [US5] Commit T053–T056: `feat: add the idempotent coach seed export`.
- [ ] T058 **[PARADA] [MANUAL] the maintainer approves the push of Phases 4–5.** Hands back: "go".
- [ ] T059 Push; await and record the CI (header procedure).

### The maintainer's export (manual, paid)

- [ ] T060 **[MANUAL] [PARADA] spending limit.** Before any export, the maintainer opens the Anthropic Console and confirms that the workspace of the key has a monthly spending limit set. Hands back: "limit set" (the amount is optional to share). The session waits.
- [ ] T061 **[MANUAL] [PARADA] run the export, only after T057 is committed, the suite is green with the fake coach, and T059's CI is green.** On the maintainer's own machine and shell, following quickstart.md section D, with the published recording verified in `recordings/`: `DB_PATH=:memory: ANTHROPIC_API_KEY=<own key> npm run export-coach-seed`, then the same command a second time. Never against `data/telemetry.db` (the tool refuses it). Then **the maintainer reads the six texts**, since `demo/coach-seed.json` is public once committed, checking for each pair that every number the text cites is either one of the numbers in that entry's `insights` or one of the two benchmark lines the coach receives with them, and that the text holds nothing but coaching about the two laps. A cited personal best or theoretical best must be the recording's own (the export builds its database from the recording alone): **1:13.372** (lap 8, the best valid lap) and **1:13.208** (the best valid sectors of laps 7 and 8: 18.310 + 37.573 + 17.325 s; lap 6 is invalid and does not count), never a time from another session. If a text fails, the maintainer deletes that entry from the file and runs the export again: only that pair is called. Hands back: `demo/coach-seed.json` in the working tree (uncommitted); the console output of both runs (six calls with their `usage` the first time, six `reutilizado` the second); the confirmation that the six texts were read and pass the check. The key is then removed from the shell and never set on the hosting platform. **Conditional [PARADA]**: if the second run makes any call, or the tool refuses the recording or the seed, the session stops and reports before anything else.
- [ ] T062 [US5] After T061: record the six `usage` lines and the second run's output in research.md "Implementation evidence" (token counts only; no key, no text of the analyses is needed there; the counts never go into the seed file). Check `demo/coach-seed.json` against contracts/coach-seed-file.md, including that it has no key outside the contract: `formatVersion` 1, `recordingSha256` equal to `PUBLISHED_RECORDING_SHA256`, `sessionUid` `1026725433292396341`, six entries (6,7), (6,8), (7,6), (7,8), (8,6), (8,7).
- [ ] T063 [US5] Add the test of the committed file, which only now can exist without being skipped: in `src/demo/recording.test.ts`, `demo/coach-seed.json` (read from `findProjectRoot()`) has `recordingSha256 === PUBLISHED_RECORDING_SHA256`, six entries, and passes `validateCoachSeed` with the context `{ recordingSha256: PUBLISHED_RECORDING_SHA256, sessionUid: "1026725433292396341", completedLaps: [6, 7, 8], computeInsights: (a, b) => <that entry's own insights> }`, which exercises the structural checks without the recording (the insight check against the real analysis runs at start, and in T084).
- [ ] T064 [US5] Commit `demo/coach-seed.json`, T062 and T063: `feat: add the coach seed for the demo recording`.

**Checkpoint**: the seed exists, is tied to the published recording, and is tested.

---

## Phase 6: User Story 3 — visitors cannot write data or cost money (P1)

**Goal**: the read-only switch and the demo HTTP app (CORS to one origin, cache headers, no-store), with no visitor write path and no paid call (FR-012, FR-015, FR-018, FR-026, FR-027 not adopted; T-1, T-6; contracts/rest.md).

**Independent Test**: in-process tests show a write failing after the switch, the demo app answering only the allowed origin with CORS headers, reads with `Cache-Control: no-cache` and a `304` on revalidation, and the coach POST with `no-store`.

- [ ] T065 [US3] Test first, then implement, `setReadOnly(): void` in `src/persistence/db.ts` (`db.pragma("query_only = ON")`). Test in `src/persistence/readOnly.test.ts` (isolated database): after `setReadOnly()`, `insertAnalysis` throws (`SQLITE_READONLY` or the attempt-to-write error) and the row counts of every table are unchanged; reads still work (FR-015, T-1).
- [ ] T066 [US3] Red: write `src/http/demoApp.test.ts` (an `http.Server` from the app on `127.0.0.1:0`; isolated database with a synthetic session and one seeded pair): `createApp({ demo: { allowedOrigin: "http://localhost:5173" } })` answers a request with `Origin: http://localhost:5173` with `Access-Control-Allow-Origin: http://localhost:5173` and `Vary: Origin`; with `Origin: https://example.com`, no `Access-Control-Allow-Origin`; without `Origin`, the body is served; `GET /sessions`, `/sessions/:id`, `/sessions/:id/benchmark` and `/sessions/:id/laps/:lap/telemetry` carry `Cache-Control: no-cache` and an `ETag`, and a repeat with `If-None-Match` gets `304` with an empty body; `POST /sessions/:id/analysis` carries `Cache-Control: no-store`, returns the seeded pair with `cached: true`, and returns the existing 503 body for another pair, writing nothing; `createApp()` with no options keeps today's headers (no `Cache-Control`, any origin reflected). Refactor `src/http/httpServer.ts` into `createApp(options?: { demo?: { allowedOrigin: string } }): express.Express` plus the unchanged `startHttpServer(port)` (= `createApp().listen(port, …)`), with the demo branch not yet implemented (it returns the local app); run; confirm `assert` failures.
- [ ] T067 [US3] Green: implement the demo branch of `createApp` (`cors({ origin: allowedOrigin })`; a middleware setting `Cache-Control: no-cache` on the four read routes and `no-store` on the POST; Express's default ETag left on). No per-IP limit and no `trust proxy` setting (FR-027 not adopted, T-6). No REST compression (T-3: the platform compresses).
- [ ] T068 [US3] Commit T065–T067: `feat: add the read-only switch and the demo HTTP app`.

**Checkpoint**: the write and cost protections exist as code; Phase 7 turns them on.

---

## Phase 7: User Story 4 — the hosting can run, probe and restart the API (P2), and the demo wired end to end (US1–US5)

**Goal**: the health endpoint, the demo logger, and `startDemoServer` running the full start sequence of plan.md on one port, with the spawned integration test and refusals (FR-002–FR-009, FR-012, FR-013, FR-015–FR-018, FR-023–FR-026, FR-028; all T-decisions).

**Independent Test**: the spawned demo integration test (synthetic recording and seed) passes, and the spawned refusals exit non-zero with their messages and bind no port.

### Health and logging (FR-017, FR-028)

- [ ] T069 [P] [US4] Test first, then implement, `src/http/routes/healthRouter.ts`: `createHealthRouter(isHealthy: () => boolean)`, `GET /health` → `200 {"status":"ok"}` or `503 {"status":"replay stopped"}`, always `Cache-Control: no-store`; mounted by `createApp` in both modes (local: always healthy). Test in `src/http/healthRouter.test.ts`; `src/http/demoApp.test.ts` gains the health assertions.
- [ ] T070 [P] [US4] Stub `src/demo/demoLog.ts`: `export interface DemoCounters { openConnections: number; wsBytes: number; restBytes: number; coach503: number; cpuUserMs: number; cpuSystemMs: number }` and `formatSummary(c: DemoCounters): string` returning `""`.
- [ ] T071 [US4] Red: write `src/demo/demoLog.test.ts`: `formatSummary` returns one line starting `[demo] resumo:` with the open connections, WebSocket, REST and total bytes (in bytes and MiB), the coach 503 count, the CPU time (user + system, ms) and the note `bytes escritos nos sockets pela aplicação; não é o número cobrado pela hospedagem`; it never contains an IP-like string (the counters have none). Run; confirm `assert` failures.
- [ ] T072 [US4] Green: implement `formatSummary`; add to `src/demo/demoLog.ts` the REST counting middleware (on `finish`, add the increase of `req.socket.bytesWritten` since that socket's previous response, kept in a `WeakMap`; count status 503 on `POST /sessions/:id/analysis`) with an in-process test in `src/demo/demoLog.test.ts` (one keep-alive client, two requests: the sum equals the socket's `bytesWritten`). Wire the middleware into `createApp`'s demo branch.

### The demo server (FR-002–FR-009, FR-012, FR-013, FR-015, FR-016, FR-023–FR-025, FR-028; plan "Start sequence")

- [ ] T073 [US4] Red: write `src/demo/demoServer.integration.test.ts`. It builds a synthetic recording with `receivedAt` (extending `src/replay/testFixtures.ts`'s builders, two completed laps), writes it as `.jsonl` to a temporary folder, computes its SHA-256, computes the two pairs' insights in-process exactly as the server will (same builders, `:memory:` through a separate child or `testDb`), writes a synthetic seed for them, finds a free port, and spawns `src/server.ts` (`ts-node/register`, clean environment, `cwd` the temporary folder) with `DEMO_MODE=true`, `PORT`, `DEMO_ALLOWED_ORIGIN=http://localhost:5173`, `DEMO_RECORDING_PATH`, `DEMO_SEED_PATH`, `DEMO_MAX_CONNECTION_MINUTES=1`. It waits for the `[demo] pronto` line (with its own deadline), then asserts: `GET /health` 200; `GET /sessions` one session with the synthetic capture times; laps and sample counts of the fixture; a `304` on revalidation; the seeded pair `cached: true` and another pair 503; CORS only for the allowed origin; a WebSocket from the allowed origin negotiates `permessage-deflate` and receives messages with `data.length === 1` and `playerCarIndex === 0`; a foreign origin gets 403; no `telemetry.db` file and no `data/` folder appear in the temporary folder. Then the refusals that need the wired server (the configuration refusals are already covered by T013's `src/config/demoFailFast.test.ts`), each spawned with one defect and asserting exit ≠ 0, the message on stderr, and that the port is still free afterwards: the recording missing (T-4); the recording altered by one byte; the seed for another hash; a seed with one insight number off by 0.05 (T-5). Run against today's `server.ts` (which has no demo branch); confirm the failures are `assert` failures.
- [ ] T074 [US4] Green: create `src/demo/demoServer.ts` `startDemoServer(config: DemoConfig): Promise<void>` with the plan's ten steps: verify the recording against the seed's `recordingSha256` (in production equal to `PUBLISHED_RECORDING_SHA256`); `buildDemoSession`; `buildCaptureTimes` + `applyCaptureTimes`; `validateCoachSeed` (with `computeInsights` from the built session) + `applyCoachSeed`; `setReadOnly()`; `http.createServer(createApp({ demo }))` + `attachDemoWsServer(…, perMessageDeflate: config.wsCompression ? {} : false)`; `listen(config.port, "0.0.0.0")`; `runReplay(packets, { speed: "1x", loop: true }, { send, onPass })` with `send` = dispatch (try/catch per packet) → `buildWsMessage` → `toPlayerOnlyMessage` → `broadcast`, **no persistence** (FR-005, T-1); log `[demo] pronto em <ms> ms (montagem <ms>, hash <ms>, cache <ms>; compressão do WebSocket <ligada|desligada>)`; the 15-minute `setInterval(...).unref()` summary (`formatSummary`, `process.cpuUsage()`); `SIGTERM`/`SIGINT` → abort the replay, `close(1001, "going away")`, close the server, `closeDb()`. The health callback reports false once the replay promise settles. Every startup error is printed (message only) and exits 1 before any port is bound.
- [ ] T075 [US4] Change `src/server.ts` (the move of today's wiring into `startLocalServer()`, with its modules loaded inside it, was done in T013, because the demo validation must run before `persistence/db` opens; what remains here is the demo branch): today's wiring stays in `startLocalServer()`, unchanged (ports, UDP, standalone WebSocket, per-packet logs), selected with `parseRunMode(process.env.DEMO_MODE)`; in demo mode replace T013's temporary "ainda não disponível" exit with `startDemoServer(parseDemoConfig(process.env, findProjectRoot()))`, and never touch the local wiring. `src/config/demoFailFast.test.ts` stays green. `src/config/serverFailFast.test.ts` stays green; T073 goes green.
- [ ] T076 [US4] Docs, same commit (every row of plan.md's Documentation table that is now visible): `README.md` Demo mode section complete and no longer partial (start sequence, in-memory database, capture dates, read-only, one port, the WebSocket rules: single car, `playerCarIndex` 0, compression and `DEMO_WS_COMPRESSION`, 4001/4002, 5 minutes, 403 by origin; CORS as a browser-only limit; cache headers; the platform compresses REST; health; the log and its summary; the coach in demo mode; the start-time refusals of a missing or altered recording and of a mismatching seed); the new `GET /health` also in the description of the REST API, since it exists in both modes; the Features bullet "all 22 cars per message" gains the demo exception, and the Contract ownership paragraph gains the sentence that the demo's message content differs (FR-025); Known limitations: the 5 GB allowance ≈ 1,330–2,410 full visits a month and a suspension until the next month without a payment method; no per-IP limit; the browser's pong frames may not count as activity (undocumented); the demo shows only the player's car; compression costs an estimated 11–12% of the free instance's CPU per connection (`DEMO_WS_COMPRESSION=false` is the way out). `CLAUDE.md`: Architecture table (`src/demo/`, `demo/`), the contract note (demo differences), Known pitfalls (the same new limitations).
- [ ] T077 [US4] Commit T069–T076: `feat: run the demo server end to end on one port`.
- [ ] T078 **[PARADA] [MANUAL] the maintainer approves the push of Phases 6–7.** Hands back: "go".
- [ ] T079 Push; await and record the CI (header procedure).

**Checkpoint**: demo mode runs end to end against synthetic data in the test suite.

---

## Phase 8: User Story 6 — local use is unchanged (P1)

**Goal**: evidence that local mode behaves as before (FR-001, FR-011, FR-019; SC-007; quickstart.md section C).

**Independent Test**: the spec 001 measurement gives 2,411 of 2,411 samples per table at `1x`, with a temporary `DB_PATH`.

- [ ] T080 [US6] **SC-007**, following quickstart.md section C and spec 001's [baseline-measurement.md](../001-realtime-replay/baseline-measurement.md) method: create a temporary folder under the scratch directory with a `.env` holding only `WS_PORT`, `UDP_PORT` and `HTTP_PORT` (the same values as the repository's, read without printing anything else); with `DOTENV_CONFIG_PATH` pointing at it, run the key check of the header (must print `false`), then `DB_PATH=<temp>/telemetry.db npm run dev` (demo mode off) and, in the same environment, the replay; confirm the startup log names the temporary database; `npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl` (default `1x`) to completion; stop the server; count rows in the **temporary** database with a one-off `node -e` using `better-sqlite3` opened read-only on that path. Expected: 1 session, 3 laps with the README's times, **2,411 of 2,411** car telemetry and **2,411 of 2,411** motion samples. Record the commands and output in research.md "Implementation evidence — SC-007". **Conditional [PARADA]**: any count other than 2,411, or the log naming any other database, stops the session for a report.
- [ ] T081 [US6] Compiled local mode: `npm run build`, then, with the same `DOTENV_CONFIG_PATH` as T080 and the key check printing `false`, `DB_PATH=<temp>/compiled.db npm start`; confirm the log names the temporary database, the WebSocket and REST answer on their own ports with 22 cars per message, and `GET /health` returns 200; stop it. Then, with `DB_PATH` unset, only print the compiled `dbPath` (as in T006) to confirm it is `<repo>/data/telemetry.db`, without starting the server. Record in research.md (FR-001, FR-019).
- [ ] T082 [US6] Check that no runtime or development dependency was added (FR-022): `git diff main -- package.json` shows only the `build`, `start` and `export-coach-seed` scripts. Record in research.md.
- [ ] T083 [US6] Commit T080–T082 evidence plus the pending "CI runs" rows: `docs: record the local-mode checks for spec 003`.

---

## Phase 9: Polish and cross-cutting

- [ ] T084 **Demo mode locally, quickstart.md section B**, with the committed seed and the published recording: `npm run build`, then, with `DOTENV_CONFIG_PATH` pointing at an empty scratch `.env` and the key check printing `false`, `DEMO_MODE=true PORT=10000 DEMO_ALLOWED_ORIGIN=http://localhost:5173 npm start` (PowerShell `$env:` form; T085–T086 start it the same way). Run every row of section B's table, including the 6-connection capacity check, the time limit with `DEMO_MAX_CONNECTION_MINUTES=1`, a restart with `DEMO_WS_COMPRESSION=false` (no extension; log says off), one 15-minute summary, and every refusal listed under the table. The WebSocket checks use a small script added as `specs/003-demo-mode/evidence/check-demo-ws.mjs` (origin, capacity, time limit, extension, `data.length`, `playerCarIndex`, bytes received). Record the commands and outputs in research.md "Implementation evidence — quickstart B", including the measured time until ready and the WebSocket bytes per second on the wire (SC-001, SC-005, SC-006, SC-008–SC-013, SC-015). **Conditional [PARADA]**: a real seed refused by the insight tolerance, a capture date other than 2026-10-16T16:30:23.797Z / 4 min, a sample count other than 2,411, or more than 10 KiB/s per connection stops the session for a report.
- [ ] T085 SC-002 and SC-003, in the same demo run as T084 or a second one: let the loop run at least 20 passes (about 75 minutes), reading `GET /sessions` and `GET /sessions/1` after the first and after the twentieth pass; then restart the server three times and read them again. Expected: identical bodies (session, laps, dates, counts) every time. Over the same run (more than one hour), check SC-015 in the log: no per-packet line, one summary every 15 minutes with non-zero WebSocket, REST and total bytes after traffic, a coach 503 count of 0 while only (8, 6) and (8, 7) are requested, and no IP address. Record in research.md.
- [ ] T086 SC-004: with the demo running, a scripted battery (`specs/003-demo-mode/evidence/check-demo-writes.mjs`) hitting every route and method (including malformed JSON bodies, unknown paths, `PUT`/`DELETE`, cached and uncached pairs, WebSocket client messages, and a UDP datagram to the port number), then `GET /health` and the session reads unchanged and the log showing no coach call; record the output in research.md.
- [ ] T087 Contract check (FR-020, constitution VI): `git diff main -- src/ws/messageFormat.ts src/http/routes/sessionsRouter.ts src/http/routes/analysisRouter.ts src/persistence/*Repository.ts` shows no change to any existing field, route, status or error string (only the new capture-time statements); `src/http/routes/healthRouter.ts` is the only new route. Record in research.md, and complete the pull request body's "Changes the frontend sees" list (plan.md, 14 items) for the frontend's spec 003.
- [ ] T088 Documentation review (FR-021, constitution IV): README.md and CLAUDE.md describe only what exists; the Demo mode section is no longer marked partial; every new known limitation is in both files (local replay, six pairs/two reachable, 5 GB, no per-IP limit, pong frames, single car, compression CPU); no stale "10 minutes", "no build", or "22 cars" without the demo exception remain (`grep -n "10 min\|no build\|22 cars" README.md CLAUDE.md`). Fix anything stale in this task.
- [ ] T089 Set the status line of `specs/003-demo-mode/spec.md` to "Implemented; pull request #<n>" (the merge date is not known before the merge, and no second pull request is opened to add it), mark the done tasks in this file, and commit with T084–T088: `docs: record the demo-mode validation for spec 003` (plus any fix from T088, with the matching type in its own commit if it changes code).
- [ ] T090 **[PARADA] [MANUAL] the maintainer approves the push of Phases 8–9.** Hands back: "go".
- [ ] T091 Push; await the CI (header procedure). **CI red**: follow the header's rule (diagnose, fix in its own commit, **[PARADA]** for that push, re-run only for infrastructure).
- [ ] T092 Run `/speckit-converge` for spec 003 (every FR and SC against the code). Any appended task follows the same rules; each extra push is its own **[PARADA]**.
- [ ] T093 Update the pull request body (`gh pr edit 003-demo-mode --body-file <scratch>/pr-body.md`) with: the spec summary, the "Changes the frontend sees" list, the validation summary (T080–T086), the manual steps done by the maintainer (T060, T061), the out-of-scope items (deploy, CI build check, frontend), and the last push's CI row (run id, head SHA, `typecheck`, `test` from the jobs API). **[PARADA] before editing the body**, since it is visible on GitHub.
- [ ] T094 **[PARADA] [MANUAL] the maintainer approves marking the pull request ready for review.** Hands back: "go". Then `gh pr ready 003-demo-mode`.
- [ ] T095 **[MANUAL] [PARADA] the merge is the maintainer's**, on GitHub with "Rebase and merge", with `typecheck` and `test` green and the branch up to date with `main` (ruleset). Hands back: "merged". If the branch is behind, the update (`git rebase origin/main` + push) is its own **[PARADA]** push, followed like every push by the CI wait and the jobs-API record (header procedure), and the merge waits for it.
- [ ] T096 After the merge: await and record the push-to-`main` CI run (jobs API), and confirm the README badge shows passing. The record goes into the pull request as a closing note only if the maintainer asks; otherwise it is reported in the session.
- [ ] T097 Delete the merged branch locally (`git branch -d 003-demo-mode` after switching to an updated `main`); deleting it on `origin`, if GitHub did not, is a push: **[PARADA]**.
- [ ] T098 Report to the maintainer: tasks done, evidence recorded, known limitations added, and the two items of future work (the CI build check spec; FR-027 after the deploy). The deploy itself, the CI build check and any frontend change are out of scope and not started.

---

## Outside this feature's tasks

- **The deploy** to Render and the links in both READMEs (the next step).
- **A build check in the API's CI**, in its own small spec before the deploy (plan.md "Future work"): it changes the ruleset of `main`.
- **FR-027 revisited** after the deploy, checking which header carries the visitor's address.
- **Any frontend change**: the frontend's spec 003 consumes the "Changes the frontend sees" list (plan.md and the pull request body).

---

## Dependencies & execution order

### Phase dependencies

- **Setup (T001)**: first, read-only.
- **Foundational (T002–T021)**: after Setup; blocks every story. F1 (T002–T008) → F2 (T009–T015) → F3 (T016–T018) → first push and draft pull request (T019–T021).
- **US1 (T022–T040)**: after Foundational.
- **US2 (T041–T045)**: after F3 (needs the completed-lap return) and T030 (`buildDemoSession`).
- **US5 (T046–T064)**: T046–T052 after Foundational; T053–T057 after T030 and T045; T060 (spending limit) any time before T061; **T061 only after T057 is committed, green locally with the fake coach, and T059's CI is green**; T062–T064 (including the committed-seed test T063) only after T061.
- **US3 (T065–T068)**: after Foundational; T066 needs an applied seed in its fixture, so after T052.
- **US4 (T069–T079)**: T069 ∥ T070; T071–T072 after T070; **T073–T077 after US1, US2, US3 and T052**, since the start sequence uses all of them; it does not need the real seed (the test writes a synthetic one).
- **US6 (T080–T083)**: after T077 (the local wiring was moved in T075).
- **Polish (T084–T098)**: T084–T086 after T064 (real seed) and T077; then T087–T089; then T090–T098 in order.

### After every push

Every push task (T020, T040, T059, T079, T091, a fix push, the rebase push of T095) is followed by the CI wait and the jobs-API record of the header procedure, and **the next phase starts only once that run is green** (T021 → Phase 3; T040 → Phase 4; T059 → T060/T061 and Phase 6; T079 → Phase 8; T091 → T092). A red run blocks until it is fixed by its own commit and push (**[PARADA]**), or re-run once for an infrastructure failure recorded as such.

### Within each pure function

stub → red (seen failing on its own `assert`) → green, then commit with the test. Never commit the red step alone.

### Parallel opportunities

- T009 (`src/config/mode.ts`) ∥ T010 (`src/config/demoEnv.ts`).
- T031 (`src/demo/playerOnly.ts`) ∥ T034 (`src/demo/liveConnections.ts`), and their red/green steps pairwise, since they share no file; they are committed together in T036.
- T041 (`src/demo/captureTimes.ts`) can run alongside Phase 3's tail.
- T046 (`src/demo/insightsMatch.ts`) ∥ T049 (`src/demo/coachSeed.ts`).
- T069 (`src/http/routes/healthRouter.ts`, plus its mount in `src/http/httpServer.ts`) ∥ T070 (`src/demo/demoLog.ts`). T072 also touches `src/http/httpServer.ts`, so it runs after T067 and T069.
- Tasks that edit `README.md`, `CLAUDE.md`, `package.json`, `src/http/httpServer.ts`, `src/network/wsBroadcaster.ts` or `research.md` are never parallel with each other.

## Parallel example: User Story 1

```text
in parallel:
  T031 stub src/demo/playerOnly.ts          T034 stub src/demo/liveConnections.ts
  T032 red  src/demo/playerOnly.test.ts     T035 red  src/demo/liveConnections.test.ts
  T033 green src/demo/playerOnly.ts         T036 green src/demo/liveConnections.ts + commit both
then T037 (red, demo WebSocket server) → T038 (green, commit)
```

## Implementation strategy

### MVP

Phases 1–3 give the tested building blocks; the demo is first runnable at the end of Phase 7 (T077), which is the real MVP: one session, live single-car stream on one port, against the synthetic recording in the suite and the published one locally.

### Incremental delivery

1. Foundational: build, paths, configuration, the completed-lap seam. Push, draft pull request.
2. US1 building blocks. Push.
3. US2 dates, US5 seed tooling. Push. Then the maintainer's export (manual, paid) and the committed seed.
4. US3 protections, US4 health, logging and the end-to-end wiring. Push.
5. US6 local checks and the quickstart validation. Push. Converge, ready, merge by the maintainer.

## Notes

- Never commit to `main`; the ruleset refuses direct pushes anyway.
- Every scratch file (pull request bodies, temporary databases, downloads) lives in the session's scratch directory, never in the repository.
- The evidence scripts under `specs/003-demo-mode/evidence/` are not part of `npm test` or the type check; they are run by hand and their output is recorded in research.md.

---

## FR coverage

| FR | Requirement (short) | Tasks |
|---|---|---|
| FR-001 | Demo mode by configuration; local mode unchanged | T009–T013, T075, T080, T081 |
| FR-002 | Single `PORT`; ports not required in demo; fail-fast | T010–T013, T073–T075 |
| FR-003 | Refuse to start with `ANTHROPIC_API_KEY` | T011, T012, T013 |
| FR-004 | Never `data/telemetry.db`; empty database each start | T005, T013, T073, T081 (and the key/`DB_PATH` rule in the header) |
| FR-005 | Build once, then loop at `1x`, broadcast only | T029, T030, T074 |
| FR-006 | No UDP socket in demo mode | T074, T075, T086 |
| FR-007 | Recording from the Release, verified by SHA-256; refuse otherwise | T022–T028, T073 |
| FR-008 | Bounded, stable data across passes | T029, T030, T074, T085 |
| FR-009 | Whole session before the first request; health not ready until then | T029, T030, T074, T084 |
| FR-010 | Capture times for session and laps; refuse if missing | T016–T018, T041–T045, T074, T084 |
| FR-011 | Local dates as today; no game session time | T044, T080 |
| FR-012 | Seeded pairs cached; others 503; no call, no write | T052, T066, T073, T086 |
| FR-013 | Seed from a versioned file tied to the recording; insights within tolerance | T046–T052, T063, T073 |
| FR-014 | Manual, idempotent, local export; never in CI/tests; agent makes no paid call | T053–T057, T060–T064 |
| FR-015 | No visitor writes or paid calls; read-only after seeding; independent of origin | T065, T066, T074, T086 |
| FR-016 | REST and WebSocket on one port; shapes unchanged | T037, T038, T074, T087 |
| FR-017 | Health endpoint | T069, T074, T084 |
| FR-018 | CORS and WebSocket handshake to one origin; browser-only limit, documented | T034–T038, T066, T067, T076 |
| FR-019 | Build and start commands, own build config | T002–T008, T026, T081 |
| FR-020 | Every frontend-visible change listed | T020, T087, T093 |
| FR-021 | README and CLAUDE.md as built; known limitations | T007, T014, T027, T056, T076, T088 |
| FR-022 | No new dependency without a reason | T082 |
| FR-023 | Max 5 connections; 4001 "demo full" | T034–T038, T073, T084 |
| FR-024 | Max 5 minutes; 4002 "time limit" | T037, T038, T073, T084 |
| FR-025 | Single car, `playerCarIndex` 0, per-message deflate, switchable; 20 Hz | T010–T012, T031–T033, T037, T038, T074, T076, T084 |
| FR-026 | Read responses cacheable by revalidation; POST and health not cacheable | T066, T067, T069, T084 |
| FR-027 | Not adopted: no per-IP limit, no 429, no `trust proxy` | T067, T076, T087 |
| FR-028 | Event log, 15-minute summary with socket bytes, 503s and CPU; no IP | T037, T070–T072, T074, T084 |
