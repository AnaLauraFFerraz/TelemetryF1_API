# Quickstart: validating the coach's input

Validation of spec 004 after implementation, and the maintainer's manual tasks. Interfaces: [contracts/](contracts/); data: [data-model.md](data-model.md).

## Rules for every step

- No paid call. Nothing here calls the coach.
- Any command that loads the dotenv configuration runs with `DOTENV_CONFIG_PATH` pointing at a `.env` **without** `ANTHROPIC_API_KEY`, after this check prints `false`:

  ```bash
  node -e "require('dotenv').config({path:process.env.DOTENV_CONFIG_PATH});console.log(Boolean(process.env.ANTHROPIC_API_KEY))"
  ```

- `DB_PATH` points at a temporary file, never at `data/telemetry.db` (except M1 and the maintainer's own first start).

## V1 — Tests and type-check

```bash
npm test
npm run typecheck
```

Expected: all tests pass, among them the pure tests of the opportunity rule, the direction phrases, the message, the prompt version (same value for CRLF and LF), the staleness rule, the migration on a database with the old schema, and the resolver with fakes (stale row replaced once, 503 without the key, one generation for two concurrent requests).

## V2 — The six demo messages through `analyze`

Prerequisites: the published recording at `recordings/demo-interlagos-tt-20hz-laps6-8.jsonl` (SHA-256 `c41bdfaf…b033`, README), and a keyless `.env` with only the three ports (for example a copy of `.env.example` without the key) in `DOTENV_CONFIG_PATH`.

1. Start the server on a temporary database and replay the recording into it at `2x` (no sample loss at that speed):

   ```bash
   DB_PATH=<temp dir>/v2.db npm run dev
   npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl --speed=2x
   ```

2. Stop the server, then for each of the six ordered pairs of laps 6, 7 and 8:

   ```bash
   DB_PATH=<temp dir>/v2.db npm run analyze -- 1 8 6
   ```

Expected ([contracts/analyze-cli.md](contracts/analyze-cli.md)): three sections; the message names both laps with 1:14.306 (invalid), 1:14.144 and 1:13.372 (valid) and the official differences 0.162, 0.934, 0.772 s; the "não serve de meta" warning only in (7, 6) and (8, 6); no "Recorde" and no "teórica"; the same version line for all six. The message text matches research section 4 unless the wording was refined during implementation (then the difference is shown at the review).

## V3 — Cache behaviour, by hand (optional)

On the same temporary database, with no key, insert a `lap_analyses` row for a pair with `prompt_version` `NULL` (or an old value), start the server and `POST /sessions/1/analysis` for that pair: expected 503 with `coaching indisponível: configure ANTHROPIC_API_KEY`. Update the row's `prompt_version` to the printed version and `model` to `claude-opus-4-8`: expected 200 with `cached: true`.

## Manual tasks of the maintainer

### M1 — Backup before the first start of the new version

The migration adds `lap_analyses.prompt_version` to `data/telemetry.db` at the first start. Before it, with the API **stopped**:

```bash
node -e "const D=require('better-sqlite3'); const db=new D('data/telemetry.db',{readonly:true}); db.exec(\"VACUUM INTO 'data/telemetry-before-004.db'\"); db.close()"
```

Keep `data/telemetry-before-004.db` until spec 004 merges. After the first start, every existing analysis is stale: with the key, it is regenerated (a paid call) the next time its pair is requested; without it, the pair answers 503.

### M2 — Token count of the new prompt

With her key, the same way the 1,378-token figure was measured (Anthropic's token-counting endpoint, model `claude-opus-4-8`, the system prompt `COACH_SYSTEM_PROMPT`). The figure, and whether it now reaches the model's minimum cacheable length, go back into `README.md` ("Static system prompt") and `CLAUDE.md` (Known pitfalls); until then both say it is not measured yet.

### M3 — Reading the messages

- Before approving the plan: the six messages and the new prompt in research section 4.
- After implementation: the six messages from V2, to confirm the implemented text is the approved one.
- After any coach text is generated with this prompt (the demo seed of spec 003, after the analysis-engine spec): reading every text against its insights before it is published — no test can check that the model obeyed (FR-016, SC-006).
