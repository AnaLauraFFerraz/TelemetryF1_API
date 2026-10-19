# Feature Specification: Automated CI on GitHub Actions

**Feature Branch**: `002-github-actions-ci`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "CI da API no GitHub Actions. Objetivo: todo pull request para a main e todo push na main passam por uma verificação automática, e a main só aceita merge com a verificação aprovada. Hoje a qualidade depende de alguém lembrar de rodar os testes localmente antes do merge." (full description, including the measured baseline and the points reserved for `/speckit-clarify`, in the conversation that produced this spec)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A clean checkout passes its own checks (Priority: P1)

The maintainer clones the repository on a machine with nothing but the source: no `.env`, no `data/`, no `recordings/`, no secrets. They install the dependencies, run the type check and run the test suite, and both succeed. Today the test suite does not: measured on a clean checkout of `main` (Windows, no `.env`), the type check passes but 5 of the 20 test files fail to load (82 tests reported, 77 passing), because the persistence layer pulls in the configuration module, which demands the three network ports at load time. With the three ports defined, all 89 tests pass, so the defect is the coupling, not the tests.

**Why this priority**: nothing else in this feature is worth building until this holds. A CI that is red on a pristine checkout would be ignored or bypassed within a week, and the same coupling makes the suite unusable for any contributor without a local `.env`.

**Independent Test**: take a fresh checkout of the branch with no `.env`, `data/` or `recordings/`, install dependencies, run the type check and the test suite with no environment variables set. Delivers value on its own: the suite becomes runnable anywhere.

**Acceptance Scenarios**:

1. **Given** a fresh checkout with no `.env` and no network-port variables in the environment, **When** the test suite runs, **Then** every test file loads, every test passes, and none is skipped.
2. **Given** the same checkout, **When** the server entry point starts without the three ports, **Then** it still stops at startup with the existing clear message naming the missing variable (fail-fast preserved).
3. **Given** a module that only needs the database location, **When** it is loaded without the network ports, **Then** it loads, because it reads only the configuration it uses.
4. **Given** the real `data/telemetry.db` exists on the maintainer's machine, **When** the suite runs, **Then** it still never opens it (isolation rule unchanged).

---

### User Story 2 - Every change is verified automatically before it can merge (Priority: P1)

When the maintainer opens a pull request against `main`, or something lands on `main`, an automatic verification runs without anyone remembering to start it. It type-checks the code and runs the full test suite. The outcome is visible on the pull request itself, and when it fails it is obvious at a glance whether the type check or the tests broke.

**Why this priority**: this is the point of the feature. Today quality depends on someone remembering to run the tests locally before merging.

**Independent Test**: open a pull request that is correct and confirm the verification runs and reports success on the pull request; open one with a deliberate type error and one with a deliberately failing test, and confirm each reports failure naming the right step.

**Acceptance Scenarios**:

1. **Given** a pull request targeting `main`, **When** it is opened or updated, **Then** the verification runs and its result is shown on the pull request.
2. **Given** a push to `main`, **When** it lands, **Then** the verification runs against that commit and its result is recorded.
3. **Given** a change that breaks type checking, **When** the verification runs, **Then** it fails and the failing step is identified as the type check.
4. **Given** a change that breaks a test, **When** the verification runs, **Then** it fails and the failing step is identified as the tests.
5. **Given** a change that breaks both, **When** the verification runs, **Then** both failures are reported rather than only the first, so one fix-and-retry cycle is not wasted discovering the second.
6. **Given** the verification runs on a pull request from any branch of this repository, **When** it executes, **Then** it needs no secret and no configuration stored in GitHub.

---

### User Story 3 - Run locally exactly what the CI runs (Priority: P2)

Before pushing, the maintainer runs the same checks on their own machine, with the same entry points the CI uses, and gets the same answer. The checks cover all the TypeScript in the repository, including the command-line tools, and the test run finds every test file under `src/` on its own, the same set on Windows and on Linux. The Node.js version used locally (managed with fnm) and by the CI comes from one declared place.

**Why this priority**: it prevents "green locally, red in CI" and the reverse. It is secondary to the CI existing, but the CI would be a worse tool without it.

**Independent Test**: run the documented local checks on Windows and the same checks on a Linux runner and compare the set of test files executed and the result.

**Acceptance Scenarios**:

1. **Given** the repository, **When** the maintainer wants to type-check, **Then** a single documented command does it, and it is the same command the CI calls.
2. **Given** the command-line tools (`analyze`, `recorder`, `replayer`), **When** a type error is introduced in one of them, **Then** the type check fails; today it does not, because those files sit outside the checked folder.
3. **Given** a new `*.test.ts` file is added anywhere under `src/`, **When** the test suite runs, **Then** it is executed without editing any list of folders or files.
4. **Given** the same commit, **When** the suite is started from Windows and from Linux, **Then** the same set of test files is discovered on both.
5. **Given** the declared Node.js version, **When** the maintainer's version manager and the CI each resolve it, **Then** both end up on that version without it being written twice.
6. **Given** an empty discovery (no test file found), **When** the suite runs, **Then** it fails instead of passing vacuously.

---

### User Story 4 - `main` only accepts verified changes (Priority: P3)

The maintainer configures `main` so that changes reach it only through a pull request whose verification has passed, merged by them with "Rebase and merge" on GitHub. The README shows the current CI status of `main` as a badge, with no counts that would go stale.

**Why this priority**: it turns the verification from advice into a gate, but it can only be configured after the verification has run once on GitHub, and the configuration itself is a manual action on GitHub, not something the repository's code can do. The repository delivers the verification and the instructions; the maintainer applies the rule.

**Independent Test**: after the first successful run, apply the documented protection settings and try to push directly to `main`, and to merge a pull request whose verification failed; both must be refused. Open the README and confirm the badge renders the status of `main`.

**Acceptance Scenarios**:

1. **Given** the workflow has run at least once on GitHub, **When** the maintainer follows the documented steps, **Then** the verification can be selected as a required check on `main`.
2. **Given** the protection is applied, **When** someone pushes directly to `main`, **Then** GitHub refuses it.
3. **Given** the protection is applied and a pull request whose verification failed, **When** the maintainer tries to merge, **Then** GitHub blocks the merge.
4. **Given** the protection is applied, **When** the maintainer merges a green pull request using "Rebase and merge", **Then** the merge is allowed.
5. **Given** the README, **When** it is rendered on GitHub, **Then** a badge shows the CI status of `main` and contains no test count or other figure that goes out of date.

---

### Edge Cases

- A pull request breaks type checking and tests at once: both failures must be visible (Story 2, scenario 5).
- The test run discovers zero files, for example after a folder rename: it must fail, not pass.
- A test needs a resource that exists only on the maintainer's machine (`.env`, `data/`, `recordings/`, an API key): the clean-checkout run exposes it as a failure; no such dependency may remain, and none may be hidden by a skip.
- The two tests that open UDP sockets (the replay integration test and the replayer CLI test) bind ephemeral ports on loopback or all interfaces: they must behave on the Linux runner, and if something does not, the reason and the fix are recorded in this spec's plan, not silenced. Measured so far: the whole suite passes on Windows; **the Linux runner has not been exercised yet**, so this is unknown, not assumed.
- The native SQLite module needs a build for the runner's platform and Node version: if no prebuilt binary is available and the build fails, the install step fails visibly.
- Type-checking the command-line tools for the first time may reveal errors that have been hidden outside the checked folder: they are real defects and are fixed as part of this feature rather than suppressed or excluded.
- A pull request from a fork: it needs no secret, so it can run the same verification.
- The maintainer is an administrator of the repository: whether the protection also binds administrators is an open decision (see Assumptions), and the documented steps must state which was chosen.
- A required check can only be selected on GitHub after it has run once: the order of work (workflow first, protection afterwards) is part of the plan and of the documented steps.
- A flaky test: the verification does not retry silently; a failure is a failure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST run an automatic verification on every pull request targeting `main` and on every push to `main`.
- **FR-002**: The verification MUST consist of a type check and the full test suite, as two separately identifiable steps, both executed even when the first fails, so the result states precisely which step or steps failed.
- **FR-003**: The verification MUST invoke only scripts defined in the repository's `package.json`, never ad hoc commands written only in the workflow, so that running the same script locally is running what the CI runs.
- **FR-004**: The repository MUST provide a script that performs the type check, documented alongside the existing commands.
- **FR-005**: The type check MUST cover all TypeScript in the repository, including `analyze.ts`, `recorder.ts` and `replayer.ts` under `tools/`, and MUST fail on a type error in any of them.
- **FR-006**: The test suite MUST pass on a fresh checkout with no `.env`, no `data/`, no `recordings/`, no secret and no environment variable set by the workflow.
- **FR-007**: Each module MUST read only the configuration it uses. The persistence layer MUST NOT depend on the network ports. Network-port validation MUST remain at the server entry point and MUST keep failing fast at startup with a clear message when a required port is missing or invalid. The existing messages and the `DB_PATH` override semantics MUST NOT change.
- **FR-008**: The verification MUST NOT depend on any secret or setting stored in GitHub, and MUST NOT touch `data/telemetry.db`.
- **FR-009**: The test script MUST discover every `*.test.ts` file under `src/` automatically, with no list of folders in the script, and MUST discover the same set of files on Windows and on Linux.
- **FR-010**: The test run MUST fail if it discovers no test file.
- **FR-011**: No test MAY be skipped to make the suite pass on the runner. If a test cannot run on the runner, the reason and the fix MUST be recorded in the plan.
- **FR-012**: The Node.js version MUST be declared in one place that both the maintainer's local version manager (fnm) and the CI read, and MUST NOT be repeated in the workflow.
- **FR-013**: The native SQLite module and the UDP-socket tests MUST run on the Linux runner; any incompatibility found MUST be recorded with its cause and the chosen solution.
- **FR-014**: The repository MUST document the manual steps to protect `main`: pull-request-only merges, the verification as a required check, and "Rebase and merge" as the merge method. The protection itself is configured by the maintainer on GitHub after the first run of the workflow and is not performed by the repository's code.
- **FR-015**: The README MUST show a badge with the CI status of `main`, and MUST NOT state test counts or any figure that becomes outdated.
- **FR-016**: Documentation MUST describe only what exists: `CLAUDE.md` (commands, Known pitfalls, the note that `tsc --noEmit` does not cover `tools/`) and `README.md` MUST be updated in the same change that makes those statements untrue, and the limitation entries removed from both files together.
- **FR-017**: This feature MUST NOT change any REST or WebSocket payload, router, row type or error string; the API contract consumed by the frontend is unaffected, and the plan states so explicitly.
- **FR-018**: This feature MUST NOT add a runtime dependency; a development-only dependency is allowed only with a reason stated in the plan.

### Key Entities *(include if feature involves data)*

- **Verification run**: one execution of the type check and the test suite for a given commit, triggered by a pull request or a push to `main`; has a per-step outcome (type check, tests) and an overall outcome.
- **Protection rule on `main`**: the GitHub-side setting that makes the verification mandatory and restricts merging to pull requests; owned and applied by the maintainer, outside the repository's files.
- **Declared Node.js version**: the single value both the local environment and the CI resolve their Node.js from.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a fresh checkout with no `.env`, `data/`, `recordings/` or environment variables, 100% of the test files load and 100% of the tests pass with 0 skipped, on Windows and on the Linux runner. Baseline before this feature: 15 of 20 test files load; 5 fail.
- **SC-002**: 100% of pull requests targeting `main` and 100% of pushes to `main` have a verification result recorded against the commit.
- **SC-003**: When the verification fails, the step responsible (type check or tests) is identifiable from the pull request's checks list without opening the logs.
- **SC-004**: A deliberately introduced type error, in `src/` and in `tools/`, and a deliberately failing test are each caught by the verification, in three demonstration pull requests that are closed unmerged.
- **SC-005**: The set of test files executed is identical on Windows and on Linux for the same commit, and adding a test file under any folder of `src/` includes it with zero edits to scripts.
- **SC-006**: After the maintainer applies the documented protection, a direct push to `main` and the merge of a pull request with a failed verification are both refused (confirmed once, by trying).
- **SC-007**: The verification completes in a time the maintainer judges acceptable to wait for on each pull request; the measured duration of the first green run is recorded in the plan as the reference.
- **SC-008**: The Node.js version appears in exactly one declaration that both the local setup and the CI read.

## Assumptions

- The repository is on GitHub and GitHub Actions is available for it; this is a single-maintainer project and the merge is always done by the maintainer through the GitHub interface with "Rebase and merge".
- The type check and the test suite are the only gates in scope. Linting (no ESLint configuration exists), a build step, test coverage, deployment and any public demo are out of scope, as is the CI of the frontend repository, which is specified separately there.
- The 20 test files and 89 tests are the measured baseline on Windows; the Linux result is unknown until the first run and is not assumed to match.
- The first run of the workflow happens on a branch or pull request before the protection exists, so a red first run costs nothing.
- Decisions deliberately left for `/speckit-clarify`, each with the default this spec assumes until answered:
  - **Node.js version**: one pinned version for both local and CI, with `engines.node` kept as the declared minimum (default), versus also testing against the minimum.
  - **Dependency caching** in the CI: assumed useful but optional; it must not change results.
  - **Whether the protection also binds the maintainer as an administrator**: assumed yes, so the gate cannot be bypassed by accident.
  - **Constitution amendment** stating that the CI is the merge gate: assumed to be proposed as a separate pull request, per the constitution's amendment rule, not slipped into this one.
- Commits for this feature follow the project rule: spec, plan and tasks are committed before any implementation, with Conventional Commits and no `Co-Authored-By` trailer.
