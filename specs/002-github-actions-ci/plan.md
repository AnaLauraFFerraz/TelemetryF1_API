# Implementation Plan: Automated CI on GitHub Actions

**Branch**: `002-github-actions-ci` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-github-actions-ci/spec.md`

## Summary

Make a clean checkout pass its own checks, then gate `main` on them.

The work starts from the measured defect. `src/persistence/db.ts` imports the whole `env` object, which validates the three network ports at load time, so 5 of the 20 test files fail without a `.env`. The fix moves the database-path resolution into its own config module. The persistence layer reads only that module, and the server keeps validating the ports at its entry point (FR-007, research.md point 5, prototyped at 89/89 with no environment).

Next come the local entry points (FR-003, FR-004, FR-005, FR-009, FR-010, FR-012):

- a `typecheck` script whose `tsconfig.json` covers `tools/`;
- a test script whose quoted glob is expanded by Node itself, measured identical under `cmd` and `sh`;
- a guard that fails when no test file exists, because `node --test` exits 0 on an empty glob;
- one `.nvmrc`-style version file pinned to `22`.

Only then comes the workflow (FR-001, FR-002, FR-008, FR-019, FR-020, FR-021). It runs on Linux only, with two independent jobs, `typecheck` and `test`, so a failure is visible by name in the pull request's checks list. It asks for read-only contents permission, uses setup-node's npm cache keyed on `package-lock.json`, and calls nothing but `npm` scripts.

Last come the README badge, the documentation updates, and the manual protection steps (FR-014, FR-015, FR-016). The maintainer applies the protection on GitHub after the first green run. A final verification confirms on GitHub that a pull request changing the workflow runs its own version (research.md point 8).

## Technical Context

**Language/Version**: Node.js major 22, pinned in one version file read by fnm and by `actions/setup-node`. `engines.node` is raised from `>=22.6` to `>=22.17` and stays the declared minimum: 22.17 is where the `fs.globSync` the D10 guard uses became stable (D9). TypeScript 5.6, `strict`, CommonJS, all unchanged. Patch versions may differ between the maintainer's machine (22.23.1 today) and the runner's cache (22.23.3 today), which is accepted by clarification (a) and recorded in research.md point 3.

**Primary Dependencies**: none new, runtime or development (FR-018). The guard uses `node:fs`. The workflow uses two first-party actions, `actions/checkout` and `actions/setup-node` (research.md point 9).

**Storage**: not affected. `data/telemetry.db` stays the default path and `DB_PATH` keeps its exact semantics. The CI never has a `data/` folder; tests use `src/persistence/testDb.ts` as today.

**Testing**: Node's built-in runner via `ts-node/register`, unchanged. The discovery changes from four shell-expanded folder globs to one Node-expanded `"src/**/*.test.ts"`, plus a zero-files guard. Three tests are written before the code they cover (tasks T002, T003, T009). Each runs its target in a child process with a clean environment and a working directory outside the repository, because `dotenv/config` reads `.env` from the current directory:
- `src/persistence/dbWithoutPorts.test.ts`: the persistence layer loads without the ports. It is the FR-007 regression test and fails today.
- `src/config/serverFailFast.test.ts`: the server stops at startup with today's messages. It is a characterization test and passes before and after.
- `src/tooling/assertTestFiles.test.ts`: the zero-files guard fails with zero files and passes with at least one. It fails before the guard exists.

**Target Platform**: GitHub-hosted Linux runner, pinned to `ubuntu-24.04` (see D4), for the CI. The maintainer's Windows machine covers the Windows half of FR-009.

**Project Type**: single backend project. This feature changes configuration loading, project tooling, CI and documentation, and no product behaviour.

**Performance Goals**: SC-007 sets a 5-minute ceiling per verification. Above it, the cause is investigated and recorded here. The first green run's duration is recorded as the reference.

**Constraints**:

- no secret and no GitHub-stored setting (FR-008);
- least privilege, `contents: read` only (FR-020);
- no `paths` filter on the triggers, because a required check skipped by a filter would leave a pull request blocked forever;
- no API contract change (FR-017);
- port error messages, the `[db] usando banco em ...` log and the empty-string `DB_PATH` rule are unchanged.

**Scale/Scope**: about 10 files touched (see Project Structure), one workflow file, and 4 short documentation edits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

| Principle / rule | Status | Notes |
|---|---|---|
| I. Validated binary parsing | ✅ Pass / N/A | Nothing under `src/telemetry/` changes. |
| II. Ingestion never crashes; config fails fast | ✅ Pass | Port validation stays at module load of `src/config/env.ts`. That module is still the first import of `src/server.ts`, so a missing or invalid port stops the process before anything else loads. Prototype: both messages are identical and no `data/` folder is created (research.md point 5). The per-packet try/catch is untouched. The AI coach still degrades to 503 without a key, and `coachService.ts` is not changed by the recommended option. |
| III. Deterministic analysis; AI only explains | ✅ Pass / N/A | `src/analysis/` and `src/coaching/` logic are untouched. The CI makes no model call and needs no API key. |
| IV. Record what is known; documentation describes only what exists | ✅ Pass | Documentation edits (FR-016) remove the "type-check does not cover `tools/`" statements in the same change that makes them false. Research facts not yet observed on Linux (prebuild download, UDP tests, run duration, workflow version on pull requests) are marked as pending and get recorded after the first run, not assumed. |
| V. Simple, embedded infrastructure; minimal dependencies | ✅ Pass | No dependency added (FR-018). One new config module, following the existing one-concern-per-file layout of `src/config/`. |
| VI. This repository owns the API contract | ✅ Pass | **FR-017: contract unchanged.** None of `src/ws/messageFormat.ts`, `src/http/` routers, repository row types or error strings is touched. Touched files: `src/config/`, `src/persistence/db.ts` (import line only), `tsconfig.json`, `package.json` scripts, `.nvmrc`, `.github/workflows/ci.yml`, a guard under `tools/`, `README.md` and `CLAUDE.md`. Nothing to flag to the frontend. |
| Tech constraints (Node ≥ 22.6, TS strict, CommonJS, `node:test`) | ✅ Pass | `engines.node` becomes `>=22.17`. That is narrower than, and still inside, the constitution's "Node.js ≥ 22.6", so nothing violates it. The constitution text keeps saying "≥ 22.6" until the planned amendment pull request, which updates the minimum version and the CI-as-merge-gate rule together (Phase 4, step 9). `strict`/CommonJS are kept. The runner change is in discovery only. |
| Workflow: spec → plan → tasks committed first | ✅ Pass | Spec and clarifications are committed (`f3afa95`, `7cb0018`, `de4eba9`). This plan, research and quickstart are committed as `docs:` before any implementation commit. |
| Workflow: `npm test` and `npx tsc --noEmit` before every commit | ✅ Pass | Both commands keep working. `npx tsc --noEmit` now covers `tools/` too, through `tsconfig.json`. `npm run typecheck` is the documented equivalent. The constitution's wording stays true, so no amendment is needed for this. |
| Workflow: known limitations in both CLAUDE.md and README | ✅ Pass | Neither file lists the `tools/` gap under "Known limitations". It is in the commands sections, and both get updated together. |
| Governance: amendment by separate PR | ✅ Pass | Making the CI the merge gate in the constitution is out of this feature (clarification d). It is a separate pull request after the CI works. |
| Published history never rewritten | ✅ Pass | The protection adds "require linear history". It is enforced by GitHub and rewrites nothing. |

No violations, so **Complexity Tracking is not needed.**

**Post-design re-check**: the design decisions below were checked against the table again, and nothing changed. D3 (actions by SHA or tag) and D4 (runner pin) are supply-chain and predictability choices with no principle at stake. D1 doubles the `npm ci` step, which is a cost and not a violation.

## Design decisions

The maintainer decided every **Trade-off** below on 2026-10-19; each one states the decision. The rest follow from the spec, the clarifications or the evidence.

### D1. One job with two steps vs two jobs (SC-003, FR-002). **Decided: two jobs**

| | One job, steps `typecheck` + `test` | Two jobs, `typecheck` and `test` |
|---|---|---|
| Pull request checks list | One entry (`CI / verify`). The failing step is visible only after opening the run. | Two entries, each with its own ✓/✗. The failing step is readable from the list without opening a log. |
| SC-003 | Not met by the list alone | Met |
| FR-002 (both run even if the first fails) | Needs `if: ${{ !cancelled() }}` on the second step, which is easy to get wrong | Inherent: independent jobs, no `needs:` |
| Cost | One `npm ci` | `npm ci` twice, in parallel. With the cache warm, this is measured on the first runs. Wall-clock is about the slower job, not the sum. |
| Required checks | One name | Two names |

**Decision**: two jobs with no dependency between them. SC-003 asks for the list itself to say which step failed, and only separate jobs give that.

### D2. Check names are a contract

- **Workflow file**: `.github/workflows/ci.yml`. The README badge URL depends on this file name.
- **Workflow name**: `CI`.
- **Jobs**: the job ids `typecheck` and `test` with explicit `name: typecheck` and `name: test`. GitHub's required status checks match the job's check-run name, which is the job `name`, not the `CI / ...` prefix shown in the list.
- **Required checks on `main`**: `typecheck` and `test`, both selected with GitHub Actions as their source.
- **Renaming** a job `name`, or adding another workflow with a job of the same name, requires updating the protection rule in the same piece of work. Otherwise every pull request waits forever for a check that will never report. Renaming `ci.yml` breaks the badge. The plan writes this rule into the protection steps (FR-014) and into CLAUDE.md, next to the existing "the frontend matches the literal error strings" note.

### D3. How the actions are referenced. **Decided: major tag for GitHub's first-party actions; full SHA for any third-party action**

| | Tag (`@v7`, or `@v7.1.0`) | Full commit SHA (`@949feb2...  # v7.1.0`) |
|---|---|---|
| Immutability | Tags can be moved or deleted by the action's owner. A moved tag runs new code without any change in this repository. | Immutable: the exact code that was reviewed runs |
| Security guidance | Acceptable for first-party `actions/*` | GitHub's security-hardening guidance recommends pinning to a full-length SHA as the only immutable reference |
| Updates | `@v7` gets patches automatically | Manual: re-read the tag's SHA (research.md point 9 shows the command). Dependabot or Renovate is out of scope. |
| Readability | Obvious | Needs the trailing `# vX.Y.Z` comment |

**Decision**: `actions/checkout` and `actions/setup-node`, both first-party, owned by GitHub, are referenced by **major tag** (`@v7`) and receive patches automatically.

**Rule for the future**: any **third-party** action, meaning any owner other than `actions/`, MUST be referenced by its **full commit SHA**, with a trailing comment naming the version (`uses: owner/action@<40-char-sha>  # vX.Y.Z`). This rule goes into CLAUDE.md alongside the check-names rule (D2).

### D4. Runner label. **Decided: `ubuntu-24.04`**

- `ubuntu-latest` moves to the next LTS image when GitHub decides.
- `ubuntu-24.04` is the image researched here: Node 22.23.3 in its cache, and the gcc/make/python toolchain (research.md points 3 and 4).
- Pinning means a deliberate edit when 24.04 is retired, in exchange for no surprise change of OS under a required check.

### D5. Permissions, triggers, concurrency, timeouts

- **Permissions**: a top-level `permissions: contents: read`, and nothing else (FR-020, SC-010). It applies to every job.
- **Triggers**: `pull_request` with `branches: [main]` and `push` with `branches: [main]`. There are no `paths`/`paths-ignore` filters (see Constraints) and no `workflow_dispatch`, which nobody asked for.
- **Concurrency**: group by workflow and ref. `cancel-in-progress` is on only for `pull_request` events, so a superseded pull request run is cancelled, but a push to `main` always completes (SC-002: every push to `main` has a result).
- **Timeouts**: `timeout-minutes: 10` per job, a backstop against a hung UDP test well above the 5-minute investigation ceiling of SC-007. GitHub's default is 360 minutes.
- **Retries**: none (spec edge case: a failure is a failure).

### D6. Steps of each job

The only commands are `npm` scripts (FR-003):

1. `actions/checkout`.
2. `actions/setup-node` with `node-version-file: .nvmrc` (or the chosen file, D9) and `cache: npm`.
3. `npm ci`.
4. Either `npm run typecheck` (job `typecheck`) or `npm test` (job `test`, which runs the `pretest` guard first).

No `env:` block anywhere in the workflow (FR-006).

### D7. FR-007 config split. **Decided: Option 1** (research.md point 5)

**Option 1**:

- Create `src/config/dbPath.ts` with `FIXED_DB_PATH`, `resolveDbPath()`, its existing comment moved as is, and `import "dotenv/config"`.
- `db.ts` imports `dbPath` from it.
- `env.ts` drops its own path code, imports `dbPath`, and keeps exposing `env.dbPath`.

It is the smallest change that preserves every message and the `DB_PATH` semantics, and it is prototyped at 89/89 with no environment.

**Scope of FR-007 after `/speckit-analyze`**: the persistence layer no longer depends on the ports, and the server keeps failing fast. The command-line tools (`record`, `replay`) and the AI coach (`coachService.ts`) keep loading the shared `env`, so they still require the three ports. The spec's FR-007 was narrowed to say exactly this.

**Effect observed in US1 (T008)**: `tools/analyze.ts` no longer requires `WS_PORT`, `UDP_PORT` and `HTTP_PORT`. It depended on the ports only through the chain `db.ts` → `env.ts`, which `db.ts` no longer follows. `tools/recorder.ts` and `tools/replayer.ts` still import `env` and still require them. README and CLAUDE.md must not claim that `analyze` needs the ports (checked in T024/T025).

**Future improvement, out of this feature**: Option 3, a per-consumer configuration in which `record` and `replay` need only `UDP_PORT`, the coach reads only its key, and `env.ts` disappears. It belongs together with dependency injection of the database connection, so `db.ts` stops opening the connection at module load and tests stop relying on setting `DB_PATH` before a `require()`. Both change user-visible behaviour or the test pattern and need their own spec.

### D8. Type-check scope. **Decided: Option A** (research.md point 6)

- `tsconfig.json` gets `"rootDir": "."` and `"include": ["src", "tools"]`.
- The new script is `"typecheck": "tsc --noEmit"`.
- `outDir` stays, and nothing uses it. Prototyped: exit 0 on current code, exit 2 on an injected error in `tools/`, ts-node unaffected.
- **Recorded for later**: this `tsconfig.json` is a type-check configuration. A future build, for example for the public demo, will need its own build `tsconfig` that sets its own `rootDir`/`outDir` and includes only what ships. It is not part of this feature.

### D9. Version file. **Decided: `.nvmrc` containing `22`** (research.md point 3)

- **Decided** by the maintainer on 2026-10-19: `engines.node` goes from `>=22.6` to `>=22.17` in this feature.
  - The reason: `fs.globSync`, which the D10 guard uses, is stable only from 22.17. On 22.6–22.16 it works but prints an `ExperimentalWarning`, so the old minimum was no longer honest.
  - The `.nvmrc` stays `22`; it resolves to 22.23.x on both sides.
  - `CLAUDE.md` ("Node.js ≥ 22.6") and `README.md` ("Requirements: Node.js ≥ 22.6.") are updated to 22.17 in the documentation commit (FR-016).
  - The constitution keeps "Node.js ≥ 22.6" until the planned amendment pull request, which updates **both** the minimum version and the CI-as-merge-gate rule together (Phase 4, step 9).

- Exactly one file is committed, never both, because fnm prefers `.nvmrc` when both exist.
- The CLAUDE.md note "Node is installed through fnm" gains "the version comes from `.nvmrc`".

### D10. Zero-files guard. **Decided: `pretest` with `tools/assertTestFiles.ts`** (research.md point 1)

- `"pretest": "node -r ts-node/register tools/assertTestFiles.ts"`.
- **Condition set by the maintainer**: the guard finds the files with the same glob mechanism `node --test` uses, with no new dependency. It calls `fs.globSync("src/**/*.test.ts", { exclude: (name) => name === "node_modules" })`, which is the same `internal/fs/glob` `Glob` class and the same exclusion the runner uses (research.md point 1, read from the v22.23.1 source).
  - Verified on v22.23.1: available, no experimental warning, and it finds the same 20 files.
  - It is stable since v22.17.0 per the Node docs.
- It exits 1 with a Portuguese message when the count is 0.
- It prints the count, which also gives SC-005 a cheap comparison point between Windows and Linux.
- npm runs `pretest` automatically for `npm test`, so the CI still calls one script.

## Order of work

Each phase ends with its own verification before the next starts. Commits are small Conventional Commits with no `Co-Authored-By` trailer. `npm test` and `npx tsc --noEmit` run before every commit.

### Phase 1: a clean checkout passes (US1, P1)

1. Implement D7 (config split).
2. Verify in a disposable worktree with no `.env`, `data/`, `recordings/` or port variables:
   - `npm ci`, `npx tsc --noEmit` and `npm test` all pass, 0 skipped;
   - the server without ports, and with an invalid port, prints the unchanged messages and creates no `data/` folder;
   - `DB_PATH` set to a temporary file is honoured, with the `[db]` log line.
3. Verify in the real checkout that `npm test` still passes with the `.env` present.

### Phase 2: local scripts (US3, P2)

1. Implement D8: `tsconfig.json` changes and the `typecheck` script.
2. Implement the test script with the quoted glob, and the D10 guard.
3. Add the D9 version file, and raise `engines.node` to `>=22.17` in `package.json`.
4. Verify on the maintainer's Windows machine:
   - `npm run typecheck` passes, and fails on an injected error in `src/` and in `tools/` (reverted, never committed);
   - `npm test` passes and the guard reports the file count;
   - pointing the glob at an empty folder makes `npm test` exit non-zero (temporary, reverted);
   - a new `*.test.ts` in a new folder under `src/` is picked up with no script edit (temporary, reverted);
   - `fnm use` in the repository resolves to a 22.x.
5. Record the Windows list of executed test files for SC-005.

### Phase 3: the workflow on a branch with a pull request (US2, P1)

1. Add `.github/workflows/ci.yml` per D1–D6, committed as `chore:`. The constitution lists `feat`/`fix`/`docs`/`test`/`chore` as the commit types, and `ci` waits for the amendment (Phase 4, step 9).
2. Push the branch and open the pull request against `main`. **Push and opening the pull request each need the maintainer's explicit approval.**
3. On the first run, record the following in research.md:
   - Linux results of both jobs, and whether `better-sqlite3` downloaded the `linux-x64` prebuild or compiled (install log);
   - that the UDP tests passed;
   - the list and count of test files (compared with Phase 2's Windows list, SC-005);
   - each job's duration (the SC-007 reference; investigate if over 5 minutes);
   - the cache result: a miss on the first run, a hit on a re-run with an unchanged lockfile (SC-009).
4. If anything fails only on Linux, record the cause and the fix in research.md (FR-011, FR-013). No skip.
The SC-004 demonstration pull requests are not here. They run in Phase 4, after the protection exists, so each one also proves a blocked merge.

### Phase 4: documentation and protection (US4, P3)

1. **README**:
   - add the badge `https://github.com/AnaLauraFFerraz/TelemetryF1_API/actions/workflows/ci.yml/badge.svg?branch=main`, with no counts (FR-015);
   - update the Tests section (`npm run typecheck`, "covers `src/` and `tools/`");
   - add a short "CI and branch protection" section with the manual steps below (FR-014).
2. **CLAUDE.md**:
   - update the Commands block (`typecheck`, the `test` glob, the `.nvmrc`);
   - remove "does NOT cover tools/";
   - add the check-names-are-a-contract rule (D2) and the third-party-actions-by-SHA rule (D3);
   - change "Node.js ≥ 22.6" to "Node.js ≥ 22.17" in CLAUDE.md's Stack and in README's Requirements (D9);
   - add the ABI fact to the Known pitfalls: switching Node major without `npm ci` gives `ERR_DLOPEN_FAILED` (research.md point 4), and the same entry goes to the README's Known limitations.
   - the commit-type list is **not** changed: `ci` waits for the amendment;
   - the "Node.js ≥ 22.17" in CLAUDE.md diverges from the constitution's "≥ 22.6". The divergence is temporary and intentional, and the amendment (step 9) resolves it.
   README and CLAUDE.md are edited in the same commit (FR-016).
3. **FR-017 check, before the merge**: run `git diff --stat origin/main...HEAD -- src/ws/ src/http/ 'src/persistence/*Repository.ts'`. These are the files the Constitution Check (principle VI) names as the API contract:
   - `src/ws/messageFormat.ts`, the WebSocket payloads;
   - `src/http/` routers and `httpServer.ts`, the REST routes, payloads and error strings;
   - the repositories' row types, in `src/persistence/*Repository.ts`.
   The diff must be empty.
4. The feature's pull request is merged by the maintainer with "Rebase and merge", after the green run.
5. **Then the maintainer applies the protection on `main`**, after the merge, so that `main` itself carries the workflow. Before that, a pull request branched from an older `main` would have no workflow and would wait forever for the required checks. The steps:
   - require a pull request before merging;
   - require status checks `typecheck` and `test`;
   - require branches to be up to date before merging;
   - require linear history;
   - allow only "Rebase and merge";
   - do not allow bypassing, administrators included;
   - document the last-resort procedure from the clarifications: wait for GitHub Actions first; otherwise turn the protection off, merge, turn it back on at once, and record the reason in the pull request.
6. **Demonstrate SC-004, after the protection.** Three throw-away pull requests are created from the updated `main`:
   - a type error in a `src/` file that no test loads at runtime;
   - a type error in `tools/replayer.ts`, where `test` fails too, because `replayerCli.test.ts` runs the replayer through ts-node, which type-checks it;
   - a failing test.
   For each one, confirm the failing check is named in the list (SC-003) and that both jobs ran (FR-002). The maintainer's merge attempt must be blocked (SC-006). Close each unmerged, and delete its branch locally and remotely.
7. **Verify the rest of the protection** (SC-006):
   - **direct push**: from a throw-away branch, `git push origin HEAD:main` must be rejected, administrator included, without ever committing on the local `main`;
   - **branch behind `main`**: a green pull request whose branch is behind `main` must be blocked;
   - **allowed merge**: a green, up-to-date pull request merged with "Rebase and merge" must be allowed.
8. **Verify that a pull request runs its own workflow version** (US4 scenario 6, research.md point 8): open a pull request whose only change is a visible edit to `ci.yml`, for example an extra step that prints `versao-do-PR`. Confirm in that pull request's run that the edited step appears. Record the result in research.md, then close the pull request unmerged.
9. **Open the separate constitution-amendment pull request** (clarification d), after the CI works. It has three items:
   - "Development Workflow": the CI (`typecheck` and `test`) is the merge gate of `main`;
   - "Technology and Quality Constraints": Node.js ≥ 22.6 becomes ≥ 22.17, matching `engines.node`;
   - "Development Workflow": `ci:` joins the list of commit types (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), and CLAUDE.md's list follows in the same pull request.

   It is out of this feature's tasks and is listed only so it is not forgotten.

## Future improvements (out of this feature)

- **Per-consumer configuration and database dependency injection** (D7, Option 3): the CLIs need only `UDP_PORT`, the coach reads only its key, and `db.ts` stops opening the connection at module load.
- **A build `tsconfig`** (D8), when a build, for example for the public demo, is introduced.
- **Tests in ts-node transpile-only mode** (`TS_NODE_TRANSPILE_ONLY=true`), so the `test` job stops repeating the type check that the `typecheck` job already does.
  - Trade-off: faster tests and sharper CI signals. A type error would show only under `typecheck`, as in the `tools/replayer.ts` demonstration, where today both jobs fail.
  - The cost: a local `npm test` would no longer catch type errors, so `npm run typecheck` would have to be run on its own.
  - It needs its own decision, and the test-before-commit rule would have to name both scripts.

## Project Structure

### Documentation (this feature)

```text
specs/002-github-actions-ci/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0, with evidence; post-run facts appended in phases 3–4
├── quickstart.md        # validation guide
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks, not created here
```

**`data-model.md`: does not apply.** The feature adds no table, column, stored entity or payload. The spec's Key Entities (verification run, protection rule, declared Node version) live on GitHub or in a one-line file, and are fully described in the spec and in D2/D9.

**`contracts/`: does not apply as an API contract.** No REST or WebSocket payload, router, row type or error string changes (FR-017, Constitution VI). The one contract this feature creates, the check names the protection rule depends on, is defined in D2 rather than in a separate file, because it is three strings.

### Source code (repository root)

```text
.github/workflows/ci.yml        # new: workflow CI, jobs typecheck and test (D1–D6)
.nvmrc                          # new: "22" (D9; or .node-version if chosen)
package.json                    # scripts: typecheck, pretest, test (quoted glob); engines.node >=22.17
tsconfig.json                   # rootDir ".", include src + tools (D8)
src/config/dbPath.ts            # new: DB path resolution moved out of env.ts (D7)
src/config/env.ts               # ports + API key; re-exports dbPath
src/persistence/db.ts           # import dbPath from ../config/dbPath
tools/assertTestFiles.ts        # new: zero-files guard (D10; name final at implementation)
README.md                       # badge, Tests section, CI and branch protection steps
CLAUDE.md                       # Commands, tools/ note removed, check-names rule
```

**Structure Decision**: the existing single-project layout, unchanged. The new config module sits in `src/config/`, which already holds configuration. The guard sits in `tools/`, which holds the project's CLI scripts and is now type-checked.

## Complexity Tracking

Not needed. The Constitution Check has no violations.
