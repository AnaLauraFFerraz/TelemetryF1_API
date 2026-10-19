# Quickstart: validating the CI feature

Runnable checks that prove spec 002 works end to end. Each one names the requirement or success criterion it covers. Design choices are in [plan.md](plan.md) (D1–D10), and the evidence behind them is in [research.md](research.md).

## Prerequisites

- Node 22 from the repository's version file: `fnm use` in the repository root should print a `v22.x`.
- A disposable checkout, never the working copy:

  ```bash
  git worktree add --detach <temp-dir> <branch-or-commit>
  cd <temp-dir>
  ```

  `<temp-dir>` must be outside the repository. Confirm `.env`, `data/` and `recordings/` do not exist there, and that `WS_PORT`, `UDP_PORT`, `HTTP_PORT` and `DB_PATH` are not set in the shell.
- Remove the worktree at the end: `git worktree remove --force <temp-dir>`.

## 1. A clean checkout passes (US1; FR-006, FR-007; SC-001)

```bash
npm ci
npm run typecheck        # expected: exit 0
npm test                 # expected: guard prints the file count; all tests pass; "# skipped 0"; exit 0
```

The two US1 tests (tasks T002, T003) also run on their own, by path. Until the `test` script changes in US3, `src/config/` is not covered by `npm test`:

```bash
node -r ts-node/register --test src/persistence/dbWithoutPorts.test.ts   # fails before the config split, passes after
node -r ts-node/register --test src/config/serverFailFast.test.ts        # passes before and after (characterization)
```

Fail-fast is preserved. Both commands below must print the existing message and exit non-zero. Afterwards `data/` must still not exist.

```bash
node -r ts-node/register src/server.ts
#   Error: Variável de ambiente WS_PORT não definida. Confira seu arquivo .env (veja .env.example).
WS_PORT=abc UDP_PORT=1 HTTP_PORT=2 node -r ts-node/register src/server.ts
#   Error: Variável de ambiente WS_PORT="abc" não é uma porta válida (1-65535).
```

`DB_PATH` semantics are unchanged:

```bash
DB_PATH=<temp-file> node -r ts-node/register tools/analyze.ts   # "[db] usando banco em <temp-file>", then the usage line
```

## 2. Local scripts match the CI (US3; FR-003–FR-005, FR-009, FR-010, FR-012; SC-005, SC-008)

| Check | How | Expected |
|---|---|---|
| Guard is tested | `node -r ts-node/register --test src/tooling/assertTestFiles.test.ts` (task T009) | Passes: zero files gives exit 1, one file gives exit 0, a file only under `node_modules` gives exit 1 |
| `tools/` is type-checked | Add `const x: number = "a";` to any file in `tools/`, then `npm run typecheck`, then revert | A TS2322 error in that file, exit non-zero |
| `src/` is type-checked | Same, in any file under `src/` | Exit non-zero |
| Automatic discovery | Create `src/tmpcheck/probe.test.ts` with one passing `test()`, then `npm test`, then delete it | The probe runs, with no script edited |
| Empty discovery fails | Temporarily point the guard/glob at an empty folder, or run the guard from a folder with no `src/**/*.test.ts` | Exit non-zero with the guard's message |
| Same set on Windows and Linux | Compare the Windows `npm test` list of test files with the CI log of the same commit | Identical list and count |
| One version source | `git ls-files .nvmrc .node-version` | Exactly one file, containing `22`. `grep -rn "node-version" .github/` shows only `node-version-file`, never a literal version. |

## 3. The workflow (US2; FR-001, FR-002, FR-008, FR-019–FR-021; SC-002, SC-003, SC-007, SC-009, SC-010)

On the feature's pull request:

- The checks list shows two entries, `typecheck` and `test`, both green (SC-002, SC-003).
- **Install log**: `npm ci` fetched the `better-sqlite3` `linux-x64` prebuild or compiled it. Either way, record which (FR-013).
- **Test log**: the UDP tests passed, and the file count matches Windows (FR-013, SC-005).
- **Duration**: record each job's duration in research.md. Over 5 minutes, investigate (SC-007).
- **Cache**: re-run the jobs with an unchanged lockfile. The setup step reports a cache hit (SC-009).
- **Permissions**: `.github/workflows/ci.yml` has `permissions: contents: read` and no other permission. There is no `env:` block and no `secrets.` reference (FR-008, FR-020, SC-010).

The SC-004 demonstration pull requests run in §4, after the protection exists.

## 4. Protection and docs (US4; FR-014–FR-017; SC-004, SC-006)

The API contract is unchanged (FR-017). Before the feature is merged, this command must print nothing. These are the contract files named in plan.md, Constitution principle VI:

```bash
git fetch origin
git diff --stat origin/main...HEAD -- src/ws/ src/http/ 'src/persistence/*Repository.ts'
```

- The README renders the CI badge for `main`, with no counts (FR-015).
- README and CLAUDE.md no longer say the type check skips `tools/`. Both show `npm run typecheck` (FR-016).

After the maintainer applies the protection steps documented in the README, each of these must be refused:

| Attempt | Expected |
|---|---|
| From a throw-away branch with one throw-away commit, `git push origin HEAD:main`, as administrator. The local `main` is never committed on or reset. | Rejected by GitHub |
| Merge a pull request whose `test` check failed | Merge button blocked |
| Merge a green pull request whose branch is behind `main` | Blocked until the branch is updated and re-checked |
| Merge a green, up-to-date pull request with "Rebase and merge" | Allowed, and `main` stays linear |

Three throw-away pull requests, created from the protected `main` (SC-004, SC-006). In each one, the maintainer's merge attempt is also evidence of a blocked merge. Close each unmerged, and delete its branch locally and on `origin`.

| Pull request | Expected checks | Merge |
|---|---|---|
| Type error in `src/http/routes/sessionsRouter.ts`, which no test loads at runtime (tasks T029) | `typecheck` ✗, `test` ✓ | Blocked |
| Type error in `tools/replayer.ts` | `typecheck` ✗ and `test` ✗: `replayerCli.test.ts` runs the replayer through ts-node, which type-checks it | Blocked |
| One failing assertion | `test` ✗, `typecheck` ✓ | Blocked |

A pull request runs its own workflow version (US4 scenario 6). Open a pull request that only adds a step printing `versao-do-PR` to `ci.yml`. The step must appear in that pull request's own run. Record the result in research.md, then close the pull request unmerged.
