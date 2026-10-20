# Research: Automated CI on GitHub Actions

Each section answers one point of the planning brief with evidence. Commands were run on the maintainer's machine (Windows 11, Git Bash and PowerShell, Node v22.23.1 via fnm 1.39.0) on 2026-10-19, in a scratch directory or a disposable `git worktree` outside the repository. Nothing in the repository was changed by these experiments. External facts are quoted from the cited page as fetched that day. No `NEEDS CLARIFICATION` remains. Every point marked **Trade-off** was decided by the maintainer on 2026-10-19; each decision is recorded in the point and in plan.md.

An incident during the research, recorded because it is evidence for point 3: one experiment ran `fnm use` inside a scratch folder holding `.nvmrc` = `20`. That switched this session's shell to Node v20.20.2. In that state, `tools/analyze.ts` failed with `ERR_DLOPEN_FAILED ... compiled against NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 115`. The shell was switched back with `fnm use 22.23.1`. Every measurement below was taken on v22.23.1.

## 1. `node --test` when a quoted glob matches nothing (FR-010)

**Evidence** (scratch folder, Node v22.23.1):

```text
$ node -r <repo>/node_modules/ts-node/register --test "nada/**/*.test.ts"
TAP version 13
1..0
# tests 0
# pass 0
# fail 0
exit=0
```

The same command run through `cmd.exe` gives `exit=0`, and so does running it through an npm script, where npm uses `cmd.exe` on Windows. Plain `node --test` in an empty folder also gives `# tests 0`, `exit=0`. `node --help` lists every `--test-*` flag of v22.23.1, and none of them fails a run on zero files or zero tests.

**Finding**: an empty discovery passes silently, exit 0. FR-010 is not met by the runner alone.

**Decision** (maintainer, 2026-10-19): add a `pretest` guard, `tools/assertTestFiles.ts`, that fails before the tests run when no `*.test.ts` file exists under `src/`. The guard must find the files with the same glob mechanism `node --test` uses, with no new dependency. That mechanism was verified on v22.23.1 as follows.

**Same mechanism.** In the Node source at tag `v22.23.1`:

- `lib/internal/test_runner/runner.js:89` does `const { Glob } = require('internal/fs/glob')`.
- `createTestFileList` (lines 114–119) builds `new Glob(patterns, { ..., exclude: (name) => name === 'node_modules' })` and calls `.globSync()`.
- `lib/fs.js:3190` defines `fs.globSync` on the same `internal/fs/glob` `Glob` class (`lazyGlob`).

So `fs.globSync(pattern, { exclude: (name) => name === "node_modules" })` reproduces the runner's discovery exactly. Line 121 also explains point 1: the runner raises an error for an empty result only when no pattern has glob magic (a literal path), so a glob that matches nothing passes silently.

**No experimental warning on v22.23.1.** Measured:

```text
$ node -e 'process.on("warning", w => console.log("WARNING:", w.name, w.message)); require("fs").globSync("src/**/*.test.ts"); setTimeout(() => console.log("fim"), 50)'
fim                                   (no warning emitted)
$ node -e 'const f = require("fs").globSync("src/**/*.test.ts"); console.log(f.length)'
20                                    (the same 20 files the runner executes)
$ node -e 'console.log(require("fs").globSync("nada/**/*.test.ts").length)'
0
```

The Node v22 docs (`fs.json`, `fs.globSync`) show it was "added: v22.0.0" and marked stable in **v22.17.0** ("Marking the API stable", nodejs/node#57513). Between 22.6 and 22.16, which the current `engines.node` (`>=22.6`) admits, the function exists but is experimental and would print an `ExperimentalWarning`; this was not measured, it is documented. The pinned `.nvmrc` resolves to 22.23.1 locally and 22.23.3 on the runner, both past 22.17. **Decided** by the maintainer on 2026-10-19: `engines.node` is raised to `>=22.17` in this feature, so the declared minimum matches the stable API the guard relies on (plan.md D9).

**Alternatives that were considered for where the guard lives.** Option A was chosen.

| Option | How | Pros | Cons |
|---|---|---|---|
| A (chosen) | A `pretest` npm script that runs `tools/assertTestFiles.ts` with `ts-node`. npm runs it automatically before `npm test`. | `npm test` stays the single command, locally and in CI. The guard is type-checked, because `tools/` is covered (point 6). It uses the runner's own glob class, so the two listings cannot disagree. | It is a second pass over the file tree, which is negligible here. |
| B | A wrapper script that lists the files, fails on zero, and spawns `node --test <explicit list>` | One listing, done by the wrapper | Discovery moves from Node to the project's code. That is more code to own and contradicts the clarified decision "discovery by Node itself". |
| C | A custom `--test-reporter` that sets a non-zero exit code when `tests 0` | No extra npm script | It is clever and opaque. It checks zero tests, not zero files, and it would also replace the default TAP output. |

## 2. Does a quoted `"src/**/*.test.ts"` expand the same way in cmd and sh? Does `-r ts-node/register` still work?

**Evidence, synthetic tree**: the scratch tree holds `src/root.test.ts`, `src/a/one.test.ts`, `src/a/b/deep.test.ts`, `src/c/two.test.ts`, `src/a/helper.ts` and `node_modules/x/nm.test.ts`. Each test is named after its own file.

```text
npm run t   (script: node -r .../ts-node/register --test "src/**/*.test.ts"; npm on Windows uses cmd.exe)
ok 1 - src/a/b/deep.test.ts
ok 2 - src/a/one.test.ts
ok 3 - src/c/two.test.ts
ok 4 - src/root.test.ts
# tests 4

npm run --script-shell=".../Git/usr/bin/sh.exe" t      (same script under sh, as on Linux)
ok 1 - src/a/b/deep.test.ts
ok 2 - src/a/one.test.ts
ok 3 - src/c/two.test.ts
ok 4 - src/root.test.ts
# tests 4
```

- **What matches**: `**` matches zero or more folders, so `src/root.test.ts` and `src/a/b/deep.test.ts` are both found. `node_modules/` is excluded by Node's discovery, and `helper.ts` is not picked up.
- **Unquoted, under sh**: `node --test src/**/*.test.ts` with globstar off is expanded by the shell, and `**` then acts as `*`. Only `src/a/one.test.ts` and `src/c/two.test.ts` ran (`# tests 2`). This is exactly the divergence the quotes remove.
- **A false negative from the harness**: calling `cmd //c "node ... \"src/**/*.test.ts\""` from Git Bash found 0 files. That is a quoting artefact of passing nested quotes from MSYS to `cmd`, not Node behaviour. The npm-script runs above are the realistic path, and both found 4.

**Evidence, real suite** (repository root, the three ports still set because the FR-007 fix did not exist yet):

```text
cmd /c 'node -r ts-node/register --test "src/**/*.test.ts"'      -> # tests 89  # pass 89  # fail 0  # skipped 0
sh -c  'node -r ts-node/register --test "src/**/*.test.ts"'      -> # tests 89  # pass 89  # fail 0  # skipped 0
Compare-Object of the 89 test names from both runs               -> 0 differences
```

This was repeated with the prototype of points 5 and 6 in a disposable worktree, with no `.env`, no `data/`, no `recordings/` and no port variables. The script was `"test": "node -r ts-node/register --test \"src/**/*.test.ts\""`, and `npm test` gave `# tests 89  # pass 89  # fail 0  # skipped 0`, exit 0.

**Decision**: the test script becomes `node -r ts-node/register --test "src/**/*.test.ts"`, with the quotes escaped in `package.json`. `-r ts-node/register` keeps working with the quoted form: the loader is installed in each test subprocess and the `.ts` files compile.

## 3. Which version file do fnm and `actions/setup-node` both read? Is "22" predictable?

**fnm (local, 1.39.0)**: `fnm env` shows `FNM_VERSION_FILE_STRATEGY="local"` and `FNM_RESOLVE_ENGINES="true"`. In scratch folders:

```text
.node-version = 22                 -> fnm use: "Using Node v22.23.1"
.nvmrc        = 22                 -> fnm use: "Using Node v22.23.1"
.node-version = 22 + .nvmrc = 20   -> fnm use: "Using Node v20.20.2"   (.nvmrc wins when both exist)
```

- `fnm list` shows v22.14.0 and v22.23.1 installed. `22` resolved to the newest installed 22.x, not to the newest released.
- With no version file, fnm falls back to `engines.node` (`--resolve-engines`, enabled). Per its help text, it takes "the latest satisfying version", so today `>=22.6` would pick a Node 24 if one were installed. That stays true for the new `>=22.17`, which is why the version file is needed.

**setup-node** (README, fetched 2026-10-19; current major is `v7`):

- It supports `node-version-file` with "package.json, mise.toml, .nvmrc, .node-version, .tool-versions".
- For a spec like `22`: "The action will first check the local cache for a semver match". `check-latest` defaults to `false`.
- The `ubuntu-24.04` image readme (version `20261012.334.1`) lists cached Node `22.23.3` and `24.21.0`.

**Finding**: both tools read `.nvmrc` and `.node-version`. "22" is predictable at the major level, which is what clarification (a) asks for, but not at the patch level. Today the CI would resolve 22.23.3 (the runner's cache) and the maintainer's machine 22.23.1 (the newest installed). Each side moves when its own cache changes. This is accepted by decision (a); the plan records it instead of hiding it.

**Decision**: exactly one version file, containing `22`, and never both files, because fnm prefers `.nvmrc` when both exist. `engines.node` stays the declared minimum, raised to `>=22.17` (point 1). With the file present, fnm no longer falls back to `engines`.

**Trade-off: which file.** Decided by the maintainer on 2026-10-19: `.nvmrc`.

| Option | Pros | Cons |
|---|---|---|
| `.nvmrc` (chosen) | Read by fnm, setup-node and also nvm, so it covers any other contributor's version manager. It is the file fnm prefers. | The name refers to nvm, which the maintainer does not use. |
| `.node-version` | fnm's own convention, also read by setup-node | nvm does not read it. If someone later adds an `.nvmrc`, fnm silently prefers that one (measured above). |

## 4. better-sqlite3 12.x on Linux x64 with Node 22: prebuilt binary or compile?

**Evidence**:

- `node_modules/better-sqlite3/package.json` has `"install": "prebuild-install || node-gyp rebuild --release"` and `"engines": { "node": "20.x || 22.x || 23.x || 24.x || 25.x || 26.x" }`.
- `process.versions.modules` is `127` on Node v22.23.1.
- The release `v12.11.1` (`gh api repos/WiseLibs/better-sqlite3/releases/tags/v12.11.1`) includes `better-sqlite3-v12.11.1-node-v127-linux-x64.tar.gz`, alongside the `win32-x64`, `darwin-*`, `linux-arm*` and `linuxmusl-*` builds for ABI 127.
- Locally, `npm config get cache`'s `_prebuilds` folder holds `709e34-better-sqlite3-v12.11.1-node-v127-win32-x64.tar.gz`. The Windows install used a downloaded prebuild and did not compile.
- `prebuild-install/util.js:83-87` stores downloads under `<npm cache>/_prebuilds`, inside the folder setup-node's npm cache saves (point 7).
- The `ubuntu-24.04` image readme lists `gcc`/`g++` `4:13.2.0-7ubuntu1`, `make` `4.3-4.1build2` and Python `3.12.3`. That is the `node-gyp` toolchain, in case the fallback is ever needed.

**Finding**: on the runner, `npm ci` should download the `linux-x64` ABI-127 prebuild and not compile. If the download failed, the fallback compile has its tools available. Either way the install step fails visibly if both fail, which is the spec's edge case. **This has not been run on Linux yet.** The first CI run confirms it (task in the plan).

**Decision**: nothing to add. No `npm rebuild` and no apt step.

**Technical fact: the binary is tied to a Node major's ABI.** `better-sqlite3` installs a native binary built for one ABI (`NODE_MODULE_VERSION`), and each Node major has its own: 127 for Node 22, 115 for Node 20. Switching major without reinstalling the dependencies fails at load time. It was measured during this plan, when the shell was accidentally on v20.20.2 with `node_modules` installed under v22:

```text
Error: The module '...\node_modules\better-sqlite3\build\Release\better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 127. This version of Node.js requires
NODE_MODULE_VERSION 115. ...
  code: 'ERR_DLOPEN_FAILED'
```

Patch and minor differences within major 22 do not change the ABI (127 for every 22.x), so the local 22.23.1 and the runner's 22.23.3 load the same prebuild. This is one more reason the single `.nvmrc` pins the major. After any major change, run `npm ci` again.

## 5. FR-007: separating the configuration

**Current code** (`src/config/env.ts`): a single `env` object is built at module load. `readPort` throws for `WS_PORT`, `UDP_PORT` and `HTTP_PORT`. `resolveDbPath()` reads `DB_PATH`. `ANTHROPIC_API_KEY` is optional. The importers are:

| Importer | Uses |
|---|---|
| `src/server.ts` | `wsPort`, `httpPort`, `udpPort` |
| `src/persistence/db.ts` | `dbPath` only. This is the coupling that breaks 5 test files. |
| `src/coaching/coachService.ts` | `anthropicApiKey` only. It is loaded only through the HTTP router, so only by the server. |
| `tools/recorder.ts`, `tools/replayer.ts` | `udpPort` only. They also demand `WS_PORT`/`HTTP_PORT`, as `replayerCli.test.ts:10-13` already notes. |
| `tools/analyze.ts` | Nothing directly. It goes through the repositories to `db.ts`, so today it also demands the three ports. |

**Options.**

| Option | Change | Messages and `DB_PATH` | Trade-off |
|---|---|---|---|
| 1 (chosen, minimal) | New `src/config/dbPath.ts` holding `FIXED_DB_PATH`, `resolveDbPath()`, its existing comment and `import "dotenv/config"`. `db.ts` imports `dbPath` from it. `env.ts` re-exports it as `env.dbPath`, so no other importer changes. | Port messages unchanged, empty-string `DB_PATH` handling unchanged, `[db] usando banco em ...` unchanged | Smallest diff (prototype: 4 files, +18/−21). The tools keep demanding all three ports, as today, so "each module reads only what it uses" holds for persistence but not for the CLIs. |
| 2 | Lazy getters on `env` (`get wsPort()`), validated on first access | Messages unchanged | Fail-fast becomes order-dependent: it fires at first use instead of at module load. `server.ts` happens to read all three at top level, so it still fails at startup, but the guarantee is now implicit. Rejected. |
| 3 | Per-consumer config: `config/dbPath.ts`, `config/ports.ts` exporting `readPort(name)`. `server.ts` reads the three ports. `recorder.ts`/`replayer.ts` read only `UDP_PORT`. `coachService.ts` reads its key directly. `env.ts` is removed. | Messages unchanged (same `readPort`) | Fully meets "each module reads only what it uses". Larger diff, and **user-visible behaviour change**: `npm run record` and `npm run replay` would stop requiring `WS_PORT`/`HTTP_PORT`. The comment in `replayerCli.test.ts` and the CLAUDE.md wording would have to change. Arguably beyond the spec, which asks only that persistence stop depending on the ports. |

**Prototype evidence for Option 1** (disposable worktree; no `.env`, `data/`, `recordings/` or port variables):

```text
npx tsc --noEmit                                     -> exit 0
npm test                                             -> # tests 89  # pass 89  # fail 0  # skipped 0, exit 0
node -r ts-node/register src/server.ts               -> Error: Variável de ambiente WS_PORT não definida. Confira seu arquivo .env (veja .env.example).
WS_PORT=abc ... src/server.ts                        -> Error: Variável de ambiente WS_PORT="abc" não é uma porta válida (1-65535).
node -r ts-node/register tools/replayer.ts           -> Error: Variável de ambiente WS_PORT não definida. ...   (unchanged behaviour)
DB_PATH=<tmp> node -r ts-node/register tools/analyze.ts -> [db] usando banco em <tmp> / Uso: npm run analyze -- ...   (no ports needed any more)
ls data                                              -> does not exist (the server failed before db.ts was loaded)
```

`server.ts` imports `env` on line 1, so the port error is thrown before any import reaches `db.ts`, and no database or `data/` folder is created. Fail-fast keeps its current position.

**Decision** (maintainer, 2026-10-19): Option 1. Option 3 is recorded as a future improvement, together with dependency injection of the database connection, in plan.md D7. `dotenv/config` must be imported in `dbPath.ts` too, so a `DB_PATH` placed in `.env` keeps working exactly as today.

## 6. FR-005: type-checking `tools/` without changing build output; are `rootDir`/`outDir` used?

**Evidence**:

- `grep` over `package.json`, `.gitignore`, `README.md`, `CLAUDE.md` and `tsconfig.json`: `outDir`/`rootDir` appear only in `tsconfig.json`. `dist` appears only in `.gitignore`. No script runs `tsc` without `--noEmit`, and `dist/` does not exist.
- The only other mentions are documentation: `README.md:123` ("type-check (src/ only)") and `CLAUDE.md:22`. Both get updated (FR-016).
- Adding `tools` to `include` while keeping `rootDir: "./src"` fails with `error TS6059: File '.../tools/analyze.ts' is not under 'rootDir' '.../src'` for the three tools (scratch tsconfig extending the real one).
- Prototype in the disposable worktree, with `"rootDir": "."` and `"include": ["src", "tools"]`:
  - `npx tsc --noEmit` gives exit 0, so the three tools have no hidden type errors today.
  - An injected `const quebra: number = "texto";` in `tools/recorder.ts` gives `tools/recorder.ts(55,7): error TS2322`, exit 2. The check now covers `tools/`.
  - `ts-node` still runs the tools and the tests with that `tsconfig.json`: `replayer.ts` printed its usage message, and `npm test` passed 89/89.
- A scratch `tsconfig` placed outside the repository made `ts-node` fail to find `@types/node`. That is an artefact of the config's location, not of the change, and the worktree run above is the valid one.

**Finding**: `rootDir`/`outDir` are unused by any script. There is no build output to preserve.

**Trade-off: how to widen the type check.** Decided by the maintainer on 2026-10-19: Option A. A future build, such as one for the public demo, will need its own build `tsconfig` (plan.md D8).

| Option | Change | Pros | Cons |
|---|---|---|---|
| A (chosen) | In `tsconfig.json`: `"rootDir": "."`, `"include": ["src", "tools"]` | One config. `tsc --noEmit`, ts-node and the editor all see the same program. Smallest change, verified above. | A future `tsc` build would emit `dist/src/...` and `dist/tools/...` instead of `dist/...`. No build exists today, so that is a decision for whoever adds one. |
| B | Remove `rootDir` and `outDir`, and add `"noEmit": true` to `tsconfig.json` | States the truth: the project never emits | `ts-node` must ignore `noEmit`. It normally does, but this is unverified here and would need a run. It also removes settings someone might expect. |
| C | Keep `tsconfig.json`, and add a `tsconfig.typecheck.json` that extends it with `rootDir: "."` and both folders | Leaves the current config untouched | Two configs can drift. The editor and ts-node keep the narrower view, so "run locally what CI runs" is weaker. |

## 7. Dependency cache (FR-019)

**Evidence** (setup-node README): with `cache: npm`, "The action does not cache `node_modules`". It caches the global npm data, found from `package-lock.json` by default, and "uses its hash as a part of the cache key". `package-lock.json` is committed (`git ls-files package-lock.json`). The better-sqlite3 prebuild is downloaded into `<npm cache>/_prebuilds` (point 4), so it is cached too.

**Decision**: `cache: npm` on the setup step. No custom `actions/cache` step. `npm ci` still runs on every job, against a warm cache. Nothing found against it.

## 8. Which workflow version runs on a pull request? (US4 scenario 6, clarification on the bypass)

**Evidence** (GitHub docs, "Events that trigger workflows", fetched 2026-10-19), for `pull_request`:

- "`GITHUB_SHA` is the SHA of the merge commit on the merge branch".
- "`GITHUB_REF` is set to `refs/pull/PULL_REQUEST_NUMBER/merge`".
- "Workflows will not run on `pull_request` activity if the pull request has a merge conflict".
- "The `GITHUB_TOKEN` has read-only permissions in pull requests from forked repositories".

The fetched page does not state in so many words which copy of the workflow file is used.

**Finding**: the workflow is resolved at `GITHUB_SHA`, the merge commit that contains the pull request's version of `.github/workflows/`. That is consistent with the maintainer's premise, but the quoted page does not say it outright. **It is verified empirically after the first run** (plan, phase 4): a pull request that changes the workflow must show the changed behaviour in its own run. One consequence for US4: a pull request with a merge conflict gets no run, so its required checks stay pending. That is the intended behaviour, because the conflict has to be resolved first anyway.

## 9. Actions in use and their current versions

`gh api repos/actions/<name>/releases/latest` and `git/ref/tags/<tag>` (2026-10-19):

| Action | Latest release | Published | Commit SHA of the tag |
|---|---|---|---|
| `actions/checkout` | `v7.0.1` | 2026-07-20 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | `v7.1.0` | 2026-10-08 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |

Both tags are lightweight tags pointing straight at a commit (`object.type: commit`). The maintainer decided D3 on 2026-10-19: these two first-party actions are referenced by major tag (`@v7`), so the SHAs above are informational only. Any third-party action added later must be referenced by full commit SHA with a version comment, as recorded in plan.md D3.

## 10. Local timings (reference for SC-007, not a CI number)

On the maintainer's machine:

- `npm ci` in a fresh worktree: `added 184 packages in 28s`.
- `npm test`: `duration_ms 17238` (an earlier clean-checkout run).
- `tsc --noEmit`: a few seconds.

The 5-minute ceiling of SC-007 applies to the CI run, which is measured on its first green execution and recorded in this file.

## Post-implementation evidence

### Windows (local)

Maintainer's machine (Windows 11, Node v22.23.1), checkout with the US1 and US3 changes, on 2026-10-19. `fnm use` was not run by the agent; the `.nvmrc` check is the maintainer's, on their own terminal.

- `src/tooling/assertTestFiles.test.ts` failed before `tools/assertTestFiles.ts` existed (`Cannot find module '...\tools\assertTestFiles.ts'`, 3 of 3 failing) and passes after (3 of 3).
- `npm run typecheck` exits 0. A temporary `const x: number = "a";` appended to `tools/recorder.ts` gives `TS2322`, exit 2; the same in `src/server.ts` gives `TS2322`, exit 2. Both were reverted with `git checkout`.
- `npm test` runs the `pretest` guard first (`[assertTestFiles] 23 arquivos de teste encontrados em src/**/*.test.ts`), then `# tests 95  # pass 95  # fail 0  # skipped 0`.
- A temporary `src/tmpcheck/probe.test.ts` was picked up with no script edit: the guard reported 24 files and the run `# tests 96`. It was removed.
- With the guard's pattern temporarily set to `nada/**/*.test.ts`, `npm test` printed `[assertTestFiles] nenhum arquivo de teste encontrado em nada/**/*.test.ts`, exited 1, and no test ran. The pattern was restored.

Executed test files (23, sorted; the list comes from a `-r` preload that logs each test file's `process.argv[1]`, not from the glob). The 20 files of commit `978292b` plus the three added by this feature, `src/config/serverFailFast.test.ts`, `src/persistence/dbWithoutPorts.test.ts` and `src/tooling/assertTestFiles.test.ts`:

- `src/analysis/brakingAnalysis.test.ts`
- `src/analysis/buildInsights.test.ts`
- `src/analysis/cornerDetection.test.ts`
- `src/analysis/lineDeviation.test.ts`
- `src/analysis/segmentDelta.test.ts`
- `src/analysis/smoothing.test.ts`
- `src/analysis/throttleAnalysis.test.ts`
- `src/analysis/tyreAnalysis.test.ts`
- `src/analysis/tyreWindows.test.ts`
- `src/coaching/coachUserMessage.test.ts`
- `src/config/serverFailFast.test.ts`
- `src/persistence/carTelemetrySampleRepository.test.ts`
- `src/persistence/dbWithoutPorts.test.ts`
- `src/persistence/decimation.test.ts`
- `src/persistence/lapCompletionDetector.test.ts`
- `src/persistence/motionSampleRepository.test.ts`
- `src/persistence/sessionContext.test.ts`
- `src/persistence/testDb.test.ts`
- `src/replay/replayerCli.test.ts`
- `src/replay/replayIntegration.test.ts`
- `src/replay/runner.test.ts`
- `src/replay/scheduler.test.ts`
- `src/tooling/assertTestFiles.test.ts`