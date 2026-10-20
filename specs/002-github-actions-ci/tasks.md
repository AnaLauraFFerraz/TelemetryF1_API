---

description: "Task list for spec 002, automated CI on GitHub Actions"
---

# Tasks: Automated CI on GitHub Actions

**Input**: Design documents from `/specs/002-github-actions-ci/`

**Prerequisites**: plan.md, spec.md, research.md and quickstart.md are present. `data-model.md` and `contracts/` do not apply, as plan.md explains.

**Tests**: included and written before the code they cover, as requested by the maintainer. Each one fails before its change and passes after it, where that applies.

- **US1, persistence without ports (T002)**: the regression test for the FR-007 fix. It fails today.
- **US1, server fail-fast (T003)**: a characterization test that pins today's behaviour (US1 scenario 2). It passes before and after, and exists so the config split cannot break it.
- **US3, zero-files guard (T009)**: the guard is logic (FR-010), so it gets its own test. It fails before `tools/assertTestFiles.ts` exists.

All three run the code in a **child process with a clean environment and a working directory outside the repository**. `dotenv/config` reads `.env` from the current directory, so a child started from the repository root would load the maintainer's `.env` and pass for the wrong reason. Every `DB_PATH` they set points to a temporary file, never to `data/telemetry.db`.

**Organization**: grouped by user story. The phase order follows plan.md, US1 → US3 → US2 → US4, which deliberately differs from priority order: US2 (P1) needs US3's scripts, because the workflow may only call `npm` scripts (FR-003).

**Commits**:

- Small Conventional Commits with no `Co-Authored-By` trailer.
- `npm test` and `npx tsc --noEmit` run before every commit.
- A test that fails by design is committed together with the change that makes it pass, never alone, so no commit has a red suite.
- The workflow commit uses `chore:`, because the constitution lists `feat`/`fix`/`docs`/`test`/`chore`. Adding `ci` is one of the three items of the constitution-amendment pull request (see "Outside this feature's tasks").

**[PARADA]**: the agent stops before every push, every pull request it opens, and every merge, and waits for the maintainer's explicit go-ahead. Merges and GitHub settings are always done by the maintainer.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md. Setup and Polish tasks carry no story label.
- Every task names its exact file path, or the place where it acts, and the FRs/SCs it serves.

---

## Phase 1: Setup

- [x] T001 Baseline for SC-001, read-only:
  - confirm `node -v` is v22.23.x (`fnm use 22.23.1` if not; research.md, intro);
  - in a disposable worktree of `HEAD` outside the repository, with no `.env`, `data/`, `recordings/` or port variables, run `npm ci` and `npm test`;
  - expected: the same 5 files fail with `Variável de ambiente WS_PORT não definida`.
  Remove the worktree. No repository file changes.

## Phase 2: Foundational

None. US1 is itself the foundation, since the CI cannot be green until a clean checkout passes.

---

## Phase 3: User Story 1 - A clean checkout passes its own checks (Priority: P1) 🎯 MVP

**Goal**: the persistence layer no longer depends on the network ports, and the server still fails fast without them (FR-006, FR-007, FR-008; plan.md D7, Option 1).

**Independent Test**: T002 and T003 pass, and quickstart.md §1 passes in a disposable worktree with no environment (T008).

### Tests first

- [x] T002 [US1] Write `src/persistence/dbWithoutPorts.test.ts` (FR-006, FR-007, FR-008; SC-001). One flat `test()` with a Portuguese name, e.g. `"a persistência carrega sem WS_PORT, UDP_PORT e HTTP_PORT"`. It:
  1. creates a temp dir with `fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-noports-"))`;
  2. builds a child env from `process.env`, deleting `WS_PORT`, `UDP_PORT`, `HTTP_PORT` and `DB_PATH`, then setting `DB_PATH` to `<temp>/test.db` and `TS_NODE_PROJECT` to the absolute path of the repository's `tsconfig.json`;
  3. runs `spawnSync(process.execPath, ["-r", require.resolve("ts-node/register"), "-e", "require(<absolute path of src/persistence/db.ts>)"], { cwd: <temp>, env, encoding: "utf8", timeout: 30000 })`;
  4. asserts `status === 0`, and that stdout contains `[db] usando banco em ` followed by the temp `DB_PATH`, which proves it is not `data/telemetry.db`;
  5. removes the temp dir in `finally`.

  Run it alone (`node -r ts-node/register --test src/persistence/dbWithoutPorts.test.ts`). It **must fail now**, with the child's stderr showing `Variável de ambiente WS_PORT não definida`. Keep the output for the T007 commit message or notes.
- [x] T003 [P] [US1] Write `src/config/serverFailFast.test.ts` (FR-007; US1 scenario 2). It has two flat `test()` calls, using the same clean-child setup as T002 (temp `cwd`, ports and `DB_PATH` removed, `DB_PATH` set to a temp file, `TS_NODE_PROJECT` absolute, `timeout: 30000`), each spawning `node -r <require.resolve("ts-node/register")> <absolute path of src/server.ts>`:
  - **no ports**: `status !== 0`, and stderr contains exactly `Variável de ambiente WS_PORT não definida. Confira seu arquivo .env (veja .env.example).`;
  - **`WS_PORT=abc`, `UDP_PORT=1`, `HTTP_PORT=2`**: `status !== 0`, and stderr contains `Variável de ambiente WS_PORT="abc" não é uma porta válida (1-65535).`.

  In both cases, assert the temp `DB_PATH` file does **not** exist afterwards, which proves the server stopped before loading the persistence layer. A `status` of `null` (timeout, meaning the server actually started) must fail the test. Run it alone. It **passes now**: it is a characterization test of the behaviour T005 must preserve. The current `test` script does not cover `src/config/` yet; T012 changes that, and T015 checks it is then discovered automatically.

### Implementation

- [x] T004 [US1] Create `src/config/dbPath.ts` (FR-007):
  - `import "dotenv/config"` (so a `DB_PATH` in `.env` keeps working) and `import path from "node:path"`;
  - move `FIXED_DB_PATH` and `resolveDbPath()` from `src/config/env.ts` together with their existing comment block, unchanged;
  - `export const dbPath = resolveDbPath();`.
  The empty-string rule (`raw ? raw : FIXED_DB_PATH` after `trim()`) is unchanged.
- [x] T005 [US1] Edit `src/config/env.ts` (FR-007):
  - remove `FIXED_DB_PATH`, `resolveDbPath()` and their comment;
  - remove the `node:path` import if it becomes unused;
  - add `import { dbPath } from "./dbPath";` and keep the `env.dbPath` property.
  `readPort`, both messages, the three ports and `anthropicApiKey` are unchanged, and `import "dotenv/config"` stays first. Depends on T004.
  After the edit, run `node -r ts-node/register --test src/config/serverFailFast.test.ts` explicitly by path (FR-007; US1 scenario 2), because the current `test` script does not cover `src/config/` until T012. It must still pass. Do not expect `npm test` to be green yet: `src/persistence/dbWithoutPorts.test.ts` (T002), which `npm test` covers, keeps failing until T006 removes `db.ts`'s import of `env`.
- [x] T006 [US1] Edit `src/persistence/db.ts` (FR-007):
  - replace `import { env } from "../config/env";` with `import { dbPath } from "../config/dbPath";`, and `env.dbPath` with `dbPath`;
  - in the comment "Só muda de data/telemetry.db quando DB_PATH está definida (ver env.ts)", change only `env.ts` to `dbPath.ts`.
  The `[db] usando banco em ...` log is unchanged. Depends on T004.
  After the edit, run `node -r ts-node/register --test src/config/serverFailFast.test.ts` and `node -r ts-node/register --test src/persistence/dbWithoutPorts.test.ts` explicitly by path (FR-006, FR-007). The first must still pass, and the second must pass now that both T005 and T006 are done. Then run `npm test`.
- [x] T007 [US1] Run T002 alone (must pass now) and T003 alone (must still pass). Then run `npm test` and `npx tsc --noEmit` in the real checkout. Commit `src/config/dbPath.ts`, `src/config/env.ts`, `src/persistence/db.ts`, `src/persistence/dbWithoutPorts.test.ts` and `src/config/serverFailFast.test.ts` as `fix: let persistence load without the network ports` (FR-007).
- [x] T008 [US1] Verify the T007 commit in a disposable worktree outside the repository (`git worktree add --detach <temp-dir> HEAD`), with no `.env`, `data/`, `recordings/`, or port/`DB_PATH` variables (FR-006, FR-008; SC-001):
  - quickstart.md §1: `npm ci`, `npx tsc --noEmit` and `npm test` (all files load, all pass, `# skipped 0`);
  - `node -r ts-node/register --test src/config/serverFailFast.test.ts` explicitly by path, since `npm test` does not cover `src/config/` until T012. `src/persistence/dbWithoutPorts.test.ts` is covered by `npm test`, because it is in one of the four current folders;
  - both server messages;
  - `data/` absent afterwards;
  - `DB_PATH=<temp-file>` honoured by `tools/analyze.ts`.
  Remove the worktree and the temp file. A deviation is fixed in a new commit and verified again.

**Checkpoint**: a clean checkout passes. This is the MVP.

---

## Phase 4: User Story 3 - Run locally exactly what the CI runs (Priority: P2)

**Goal**: one `typecheck` script covering `src/` and `tools/`, Node-side test discovery with a tested zero-files guard, and one Node version source (FR-003–FR-005, FR-009, FR-010, FR-012; plan.md D8–D10).

**Independent Test**: T009 passes, and quickstart.md §2 passes on the maintainer's Windows machine (T015).

### Tests first

- [x] T009 [US3] Write `src/tooling/assertTestFiles.test.ts` (FR-010). Tests live under `src/` because discovery covers `src/` only. It has three flat `test()` calls with Portuguese names. Each creates a temp dir outside the repository and spawns `node -r <require.resolve("ts-node/register")> <absolute path of tools/assertTestFiles.ts>` with that dir as `cwd`, `TS_NODE_PROJECT` absolute and `timeout: 30000`:
  - **zero files**: an empty `src/` gives `status === 1` and the guard's Portuguese message on stderr;
  - **at least one file**: `src/a/x.test.ts` present gives `status === 0`, with a stdout line reporting the count;
  - **only under `node_modules`**: `src/node_modules/x.test.ts` and nothing else gives `status === 1`. This proves the guard applies the same `node_modules` exclusion as `node --test` (research.md point 1).

  Each test removes its temp dir in `finally`. Run it alone. It **must fail now**, because `tools/assertTestFiles.ts` does not exist.

### Implementation

- [x] T010 [P] [US3] Edit `tsconfig.json` (FR-005): `"rootDir": "./src"` becomes `"."`, and `"include": ["src"]` becomes `["src", "tools"]`. Keep every other option, including `outDir` (plan.md D8). `npx tsc --noEmit` must exit 0 (research.md point 6).
- [x] T011 [P] [US3] Create `tools/assertTestFiles.ts` (FR-009, FR-010; plan.md D10):
  - call `fs.globSync("src/**/*.test.ts", { exclude: (name) => name === "node_modules" })` from `node:fs`, relative to `process.cwd()`. The pattern string must be identical to the `test` script's (T012);
  - when the count is 0: a Portuguese `console.error` naming the pattern, then `process.exit(1)`;
  - otherwise: a Portuguese `console.log` with the count, e.g. `[assertTestFiles] N arquivos de teste encontrados em src/**/*.test.ts`.
  No new dependency (FR-018).
- [x] T012 [US3] Edit `package.json` (FR-003, FR-004, FR-009, FR-010, FR-012):
  - in `scripts`, add `"typecheck": "tsc --noEmit"`;
  - add `"pretest": "node -r ts-node/register tools/assertTestFiles.ts"`;
  - `"test"` becomes `"node -r ts-node/register --test \"src/**/*.test.ts\""`;
  - in `engines`, `"node": ">=22.6"` becomes `">=22.17"` (plan.md D9).
  Leave the other scripts and the dependencies untouched. Depends on T011.
- [x] T013 [P] [US3] Create `.nvmrc` containing exactly `22` and a newline (FR-012; SC-008). Confirm `git ls-files .node-version` is empty, and create no `.node-version` (research.md point 3).
- [x] T014 [US3] Run `npm ci` in the real checkout (FR-012, FR-018). If `package-lock.json` changes, the diff must be only the root package's `engines` field; keep it for T016.
- [ ] T015 [US3] Verify on the maintainer's Windows machine (FR-005, FR-009, FR-010, FR-012; SC-005, SC-008). Follow quickstart.md §2, and revert every temporary change:
  - T009 passes when run alone;
  - `npm run typecheck` gives exit 0, and a non-zero exit with TS2322 for `const x: number = "a";` appended to `tools/recorder.ts`, then separately to `src/server.ts`;
  - `npm test` prints the guard's count line, then all tests pass with `# skipped 0`. The run includes `src/config/serverFailFast.test.ts` and `src/tooling/assertTestFiles.test.ts`, which the old script would not have found: a new folder is picked up with no script edit;
  - a temporary passing `src/tmpcheck/probe.test.ts` is picked up and raises the count by one;
  - with the guard's pattern temporarily changed to `nada/**/*.test.ts`, `npm test` exits 1 before any test runs;
  - `fnm use` in the repository root prints `v22.x`.

  Save the sorted list of executed test files in a new section "Post-implementation evidence → Windows (local)" at the end of `specs/002-github-actions-ci/research.md`, for the SC-005 comparison in T020.
- [ ] T016 [US3] Run `npm test` and `npx tsc --noEmit` again (FR-003–FR-005, FR-009, FR-010, FR-012). Commit `tsconfig.json`, `tools/assertTestFiles.ts`, `src/tooling/assertTestFiles.test.ts`, `package.json`, `package-lock.json` (only if T014 changed it) and `.nvmrc` as `chore: add typecheck script, Node-side test discovery and a pinned Node version`. Commit the research.md evidence from T015 separately as `docs:`.

**Checkpoint**: everything the CI will call exists as an `npm` script, is tested, and passes locally.

---

## Phase 5: User Story 2 - Every change is verified automatically before it can merge (Priority: P1)

**Goal**: a Linux-only workflow with two independent jobs, `typecheck` and `test`, on every pull request to `main` and every push to `main`. It has read-only permissions and the npm cache (FR-001, FR-002, FR-003, FR-006, FR-008, FR-012, FR-013, FR-019–FR-021; plan.md D1–D6).

**Independent Test**: the feature's pull request shows `typecheck` ✓ and `test` ✓, with the first-run evidence recorded (quickstart.md §3). The SC-004 demonstrations run in US4, after protection exists, so each one also proves a blocked merge.

- [ ] T017 [US2] Create `.github/workflows/ci.yml` per plan.md D1–D6 (FR-001, FR-002, FR-003, FR-006, FR-008, FR-012, FR-019, FR-020, FR-021; SC-010):
  - `name: CI`;
  - `on: pull_request` with `branches: [main]`, and `push` with `branches: [main]`. No `paths`/`paths-ignore` and no `workflow_dispatch`;
  - a top-level `permissions: contents: read` and nothing else;
  - `concurrency: group: ${{ github.workflow }}-${{ github.ref }}`, with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`;
  - two jobs with no `needs:`: id/`name` `typecheck`, and id/`name` `test`. Both use `runs-on: ubuntu-24.04` and `timeout-minutes: 10`;
  - each job's steps:
    1. `actions/checkout@v7`;
    2. `actions/setup-node@v7` with `node-version-file: .nvmrc` and `cache: npm`;
    3. `npm ci`;
    4. `npm run typecheck` (typecheck job) or `npm test` (test job);
  - no `env:`, no `secrets.`, and no literal Node version.

  First-party actions use their major tag (plan.md D3). No third-party action is used.
- [ ] T018 [US2] Self-check `.github/workflows/ci.yml` (FR-008, FR-020; SC-010; plan.md D2):
  - `grep -n "permissions" -A2` shows only `contents: read`;
  - `grep -nE "env:|secrets\.|node-version:"` finds nothing;
  - the job names are exactly `typecheck` and `test`.

  Run `npm test` and `npx tsc --noEmit`, then commit as `chore: add GitHub Actions CI workflow`.
- [ ] T019 [US2] **[PARADA] push and pull request.** After the maintainer's go-ahead, push `002-github-actions-ci` to `origin` and open the pull request against `main` (FR-001; SC-002). The body is in English, with the attribution line the maintainer prefers. Merge nothing.
- [ ] T020 [US2] From the first run, append "Post-implementation evidence → Linux (CI, first run)" to `specs/002-github-actions-ci/research.md` (FR-011, FR-013; SC-001, SC-003, SC-005, SC-007):
  - the result of each job;
  - from the `npm ci` log, whether `better-sqlite3` downloaded the `linux-x64` prebuild or compiled;
  - that the UDP tests passed;
  - the guard's count and the sorted list of executed files, which must match T015's Windows list;
  - each job's duration, as the SC-007 reference;
  - the cache result, expected to be a miss.

  Above 5 minutes, investigate and record the cause.
- [ ] T021 [US2] Re-run both jobs with an unchanged `package-lock.json`. Record the setup step's cache hit in the same research.md section (FR-019; SC-009).
- [ ] T022 [US2] **Only if T020 or T021 shows a Linux-only failure** (FR-011, FR-013): find the cause, fix it in the smallest owning file, and record cause and fix in research.md. Never skip or disable a test. Commit with the matching type. **[PARADA] before pushing the fix.**
- [ ] T023 [US2] (FR-011, FR-013; SC-005, SC-007, SC-009) Commit the research.md evidence from T020–T022 as `docs: record the first CI runs for spec 002`. **[PARADA] before pushing.**

**Checkpoint**: the verification runs on Linux, reports per step, needs no secret, and is green on the feature's pull request.

---

## Phase 6: User Story 4 - `main` only accepts verified changes (Priority: P3)

**Goal**: the README badge and documentation that matches the code, a merge and protection done by the maintainer, and the proof of every refusal and of the pull-request workflow version (FR-002, FR-005, FR-014–FR-016; SC-003, SC-004, SC-006; plan.md Phase 4).

**Independent Test**: quickstart.md §4, plus the three SC-004 pull requests, each with its merge blocked.

### Documentation

- [ ] T024 [P] [US4] Edit `README.md` (FR-014, FR-015, FR-016):
  - **badge**: `[![CI](https://github.com/AnaLauraFFerraz/TelemetryF1_API/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/AnaLauraFFerraz/TelemetryF1_API/actions/workflows/ci.yml)` near the title;
  - **Requirements**: "Node.js ≥ 22.6" becomes "≥ 22.17", and mention `.nvmrc`;
  - **Tests block**: `npx tsc --noEmit  # type-check (src/ only)` becomes `npm run typecheck  # type-check (src/ and tools/)`. Add one line on the zero-files guard;
  - **new short section "CI and branch protection"**:
    - what runs (`typecheck`, `test`), on which events, on Linux only;
    - the check names are a contract with the protection rule;
    - the manual protection steps (plan.md Phase 4 step 5): PR required, required checks `typecheck` and `test`, branch up to date, linear history, only "Rebase and merge", no bypass including administrators;
    - the last-resort procedure: wait for GitHub Actions first; otherwise turn the protection off, merge, turn it back on immediately, and record the reason in the pull request;
  - **Known limitations**: switching Node major without running `npm ci` again makes `better-sqlite3` fail with `ERR_DLOPEN_FAILED`, because its binary is built for one major's ABI.

  - **`analyze` and the ports**: confirm README no longer says `npm run analyze` needs `WS_PORT`, `UDP_PORT` and `HTTP_PORT` (after US1 it does not; `record` and `replay` still do), and fix any such statement (plan.md D7, "Effect observed in US1").

  **No figure that goes stale**: no test or file counts, no durations, no patch versions.
- [ ] T025 [P] [US4] Edit `CLAUDE.md` (FR-016):
  - **Stack**: "Node.js ≥ 22.6" becomes "≥ 22.17", with the version coming from `.nvmrc`. This makes CLAUDE.md diverge from the constitution's "Node.js ≥ 22.6". The divergence is **temporary and intentional**: the constitution-amendment pull request resolves it (plan.md Phase 4 step 9). Say so in one short parenthesis next to the version, so a reader does not take it for a contradiction;
  - **Commands**:
    - add `npm run typecheck`;
    - the `npm test` comment becomes "all `src/**/*.test.ts`, found by Node itself; a pretest guard fails if none";
    - replace the `npx tsc --noEmit ... (does NOT cover tools/, it is outside rootDir)` line with the `typecheck` script.
    "There are no `build`, `start` or `lint` scripts" stays;
  - **Conventions**:
    - the commit-type list is **not** changed: `ci` waits for the constitution amendment;
    - **check names as a contract**: the CI job names `typecheck` and `test`, and the file name `ci.yml`, are a contract with the branch protection rule and the README badge. Renaming requires updating both in the same piece of work (plan.md D2);
    - **actions**: first-party `actions/*` by major tag; any third-party action by full commit SHA with a trailing version comment (plan.md D3);
  - **Known pitfalls**: the same `ERR_DLOPEN_FAILED` entry as README. It is mirrored in README's Known limitations by T024, as CLAUDE.md requires.

  - **`analyze` and the ports**: confirm CLAUDE.md no longer says `npm run analyze` needs `WS_PORT`, `UDP_PORT` and `HTTP_PORT` (after US1 it does not; `record` and `replay` still do), and fix any such statement (plan.md D7, "Effect observed in US1").

  **No figure that goes stale**, and no other comment or rule is touched.
- [ ] T026 [US4] Commit T024 and T025 together as `docs: document the CI, its checks and the branch protection steps` (FR-016 requires README and CLAUDE.md in the same change). **[PARADA] before pushing.** Then wait for `typecheck` and `test` to be green on the pull request (SC-002, SC-003).

### Merge and protection (maintainer)

- [ ] T027 [US4] First, **FR-017 check, before the [PARADA]**: after `git fetch origin`, run:

  ```bash
  git diff --stat origin/main...HEAD -- src/ws/ src/http/ 'src/persistence/*Repository.ts'
  ```

  The paths are the API-contract files that plan.md names under Constitution principle VI:
  - `src/ws/messageFormat.ts`, the WebSocket payloads;
  - `src/http/` routers and `httpServer.ts`, the REST routes, payloads and error strings;
  - `src/persistence/*Repository.ts`, the row types.

  Expected: empty output, meaning no contract file changed. Paste the command and its output in the pull request. Anything non-empty stops the merge and is reported.

  Then, **[PARADA] merge, done by the maintainer.** The maintainer merges the feature's pull request with "Rebase and merge". Then confirm the push to `main` triggered the workflow and both jobs went green on `main` (FR-001; SC-002), and that the README badge renders "passing" (FR-015).
- [ ] T028 [US4] **MANUAL, the maintainer on GitHub, only after T027** (FR-014): apply the protection on `main` exactly as documented by T024:
  - require a pull request;
  - required checks `typecheck` and `test`, source GitHub Actions;
  - require branches to be up to date;
  - require linear history;
  - allow only "Rebase and merge";
  - no bypass, administrators included.
  Applying it before T027 would leave pull requests from the older `main` waiting forever.

### Verifications, after protection

Every throw-away branch below is created from the updated `main`. At the end, delete it **locally and on `origin`** (`git branch -D <b>` and `git push origin --delete <b>`). The remote delete is a push: **[PARADA]**.

- [ ] T029 [P] [US4] **[PARADA] push and pull request.** SC-004a: type error in `src/`, in `src/http/routes/sessionsRouter.ts`. The file was chosen from the import graph, computed on 2026-10-19 over every `*.test.ts`, plus `tools/replayer.ts` and `src/server.ts`, which tests run as child processes:
  - **statically**, every `src/` file is reachable from some test, because `src/config/serverFailFast.test.ts` (T003) runs `src/server.ts`;
  - **at runtime**, `src/server.ts` stops at its first import (`./config/env`) in both of T003's cases, so the modules only `server.ts` imports after that are never loaded. ts-node then never compiles or type-checks them. They are `src/http/` (routers, `httpServer.ts`), `src/network/wsBroadcaster.ts`, `src/ws/messageFormat.ts`, `src/telemetry/packetIds.ts`, `src/persistence/analysisRepository.ts` and `src/coaching/coachService.ts`/`coachPrompt.ts`.

  Before pushing, confirm locally that `npm test` still passes with the error in place, and `npm run typecheck` fails. If `npm test` fails too, the runtime argument above is wrong: then expect both ✗, record why, and push anyway.

  Then add the error on a throw-away branch, push it, and open a pull request against `main`. Expected:
  - `typecheck` ✗ and `test` ✓ in the checks list, with the failing check identifiable from the list alone (FR-002; SC-003, SC-004);
  - the maintainer's attempt to merge is blocked (SC-006).
  Note both results, close unmerged, delete the branch locally and remotely.
- [ ] T030 [P] [US4] **[PARADA] push and pull request.** SC-004b: type error in `tools/`. Same as T029, with the type error in `tools/replayer.ts`. Expected: **`typecheck` ✗ and `test` ✗** (FR-005; SC-004), and the merge blocked (SC-006). `test` fails too, by design of today's setup: `src/replay/replayerCli.test.ts` runs `tools/replayer.ts` through `ts-node/register`, which type-checks the file it compiles, so the child process exits with a TS error instead of the expected `[replayer]` message. This is the case the transpile-only future improvement in plan.md addresses. Note, close, delete locally and remotely.
- [ ] T031 [P] [US4] **[PARADA] push and pull request.** SC-004c: failing test. Same as T029, with one failing assertion in an existing test under `src/analysis/`. Expected: `test` ✗ and `typecheck` ✓, identifiable from the checks list alone (SC-003, SC-004), and the merge blocked (SC-006). Note, close, delete locally and remotely.
- [ ] T032 [US4] **[PARADA] push.** Direct push refused, administrator included (FR-014; SC-006):
  - on a throw-away branch from `main`, make one throw-away commit and run `git push origin HEAD:main`;
  - expected: GitHub rejects it;
  - local `main` is never touched: no commit on it and no reset.
  Note the rejection message, then delete the throw-away branch locally. It was never pushed under its own name.
- [ ] T033 [US4] **[PARADA] push and pull request.** The pull request runs its own workflow version (US4 scenario 6; FR-014; research.md point 8):
  - on a throw-away branch from `main`, add a step `- run: echo versao-do-PR` to the `test` job in `.github/workflows/ci.yml`;
  - push and open the pull request;
  - confirm its own run shows the `echo versao-do-PR` step printing.
  **Leave it open**; T035 uses it. Once T035's check is done, close this pull request unmerged and delete its branch locally (`git branch -D <b>`) and remotely (`git push origin --delete <b>`). **[PARADA] before deleting the remote branch.**
- [ ] T034 [US4] **[PARADA] push and pull request; the merge is the maintainer's.** Evidence pull request, which is also the allowed-merge case (SC-006):
  - on a branch from `main`, append the results of T027–T033 to "Post-implementation evidence" in `specs/002-github-actions-ci/research.md`;
  - commit as `docs: record branch protection and workflow-version checks for spec 002`;
  - push and open the pull request. When it is green and up to date, the maintainer merges it with "Rebase and merge"; expected: allowed, and `main` stays linear.
  Delete its branch locally and remotely afterwards.
- [ ] T035 [US4] Branch behind `main` (SC-006). The T033 pull request is now behind `main`, because T034 moved it. Expected: its merge is blocked as out of date, even though its checks are green. The maintainer attempts it. Note the result. Closing that pull request and deleting its branch is done by T033's last step.
- [ ] T036 [US4] **[PARADA] push and pull request; the merge is the maintainer's.** (SC-006) Record T034's allowed merge and T035's blocked merge in research.md, through one more small branch and pull request, `docs: record the remaining protection checks for spec 002`. The maintainer merges it, then delete its branch locally and remotely.

**Checkpoint**: `main` only accepts green, up-to-date, linear pull requests, administrators included, and all evidence is in research.md.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T037 Run quickstart.md §1 and §2 on the merged `main`, in a disposable worktree with no environment (SC-001, SC-005). Check README and CLAUDE.md:
  - `grep -n "src/ only\|does NOT cover tools\|22\.6" README.md CLAUDE.md` finds nothing, except CLAUDE.md's one parenthesis about the temporary divergence from the constitution's "≥ 22.6" (T025);
  - the sections edited by T024/T025 contain no test/file counts, durations or patch versions (FR-016).
  Report anything stale. A fix goes only through a pull request: **[PARADA]**.
- [ ] T038 Run `/speckit-converge` for spec 002 (all FRs and SCs), to append any unbuilt requirement as new tasks.

---

## Outside this feature's tasks

- **Constitution amendment pull request** (clarification d; plan.md Phase 4 step 9), opened after the CI works, per the constitution's Governance section (MINOR version bump). It has three items:
  - Development Workflow: the CI (`typecheck` and `test`) is the merge gate of `main`;
  - Technology and Quality Constraints: Node.js ≥ 22.6 becomes ≥ 22.17, ending the temporary divergence with CLAUDE.md;
  - Development Workflow: `ci:` joins the commit types, and CLAUDE.md's list follows in the same pull request.
- **Future improvements** (plan.md, "Future improvements"):
  - a per-consumer configuration, so `record` and `replay` need only `UDP_PORT` and the coach only its key, together with dependency injection of the database connection;
  - a separate build `tsconfig` when a build is introduced;
  - tests in ts-node transpile-only mode, with the trade-off recorded in the plan.
  Each needs its own decision or spec.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: first, read-only.
- **US1 (T002–T008)**: after Setup. It blocks US2.
- **US3 (T009–T016)**: after US1. It blocks US2, because the workflow calls these scripts (FR-003).
- **US2 (T017–T023)**: after US3. T019 gates T020–T023.
- **US4 (T024–T036)**:
  - T024 and T025 can be written while US2's runs are pending;
  - T026 → T027 → T028;
  - after T028: T029–T033 in any order, then T034 → T035 → T036.
- **Polish (T037–T038)**: after T036.

### Within each story

- US1: T002 ∥ T003 (tests first) → T004 → T005 ∥ T006 → T007 (local check and commit) → T008 (clean-checkout check of that commit).
- US3: T009 (test first) → T010 ∥ T011 ∥ T013 → T012 (needs T011, since the pattern must match) → T014 → T015 → T016.
- US2: T017 → T018 → T019 → T020 → T021 → (T022 if needed) → T023.
- US4: T024 ∥ T025 → T026 → T027 → T028 → T029 ∥ T030 ∥ T031, T032, T033 → T034 → T035 → T036.

### Parallel opportunities

- T002 and T003 are different test files.
- T010 (`tsconfig.json`), T011 (`tools/assertTestFiles.ts`) and T013 (`.nvmrc`) are different files.
- T024 (`README.md`) and T025 (`CLAUDE.md`) are different files, committed together in T026.
- T029, T030 and T031 are independent throw-away pull requests.

## Parallel example: User Story 3

```text
T009  Write src/tooling/assertTestFiles.test.ts (fails: guard missing)
then in parallel:
  T010  Edit tsconfig.json (rootDir ".", include src + tools)
  T011  Create tools/assertTestFiles.ts (fs.globSync guard)
  T013  Create .nvmrc with "22"
then T012 (package.json) → T014 (npm ci) → T015 (verify) → T016 (commit)
```

## Implementation Strategy

### MVP first (User Story 1 only)

T001–T008. The suite runs on any clean checkout with no `.env`, guarded by its own regression test.

### Incremental delivery

1. US1: a clean checkout passes. Commit.
2. US3: the local scripts equal the future CI, and the guard is tested. Commit.
3. US2: the workflow on the feature's pull request, with first-run evidence. **[PARADA]** at each push.
4. US4: docs, then the merge and the protection by the maintainer, then the refusal and workflow-version checks, each **[PARADA]**.
5. Polish: quickstart on `main`, then `/speckit-converge`.

## Notes

- Never commit to `main` locally. After T028 GitHub refuses direct pushes anyway, and T032 proves it from a throw-away branch.
- Temporary edits in T015 and the throw-away branches in T029–T033 are never merged.
- No task points anything at the real `data/telemetry.db` (CLAUDE.md, Rules). Every check uses a disposable worktree or a temporary `DB_PATH`.
