# Contract: `npm run analyze`

```bash
npm run analyze -- <sessionId> <lapA> <lapB>
```

No API key, no ports, no paid call. Reads the database at the resolved path (`DB_PATH` when set). When the agent runs it, `DB_PATH` points at a temporary database; against the real database, the maintainer runs it.

## Output (stdout)

Three sections, in this order, each introduced by its header line:

```text
=== insights ===
<JSON.stringify(insights, null, 2), as today>

=== mensagem do coach ===
<the exact user message the coach would receive (contracts/coach-message.md)>

=== versão do prompt ===
<PROMPT_VERSION>
```

The `[db] usando banco em …` line printed by `db.ts` stays as today.

## Errors (unchanged)

- Missing arguments: usage message, exit code 1.
- Non-integer arguments: message, exit code 1.
- A lap without telemetry samples: message with both sample counts, exit code 1.

A lap with samples but no row in `laps` is not an error: the message says its time and validity are unknown.

## Change

Today the output is a single JSON document; after this change it is not, so piping it into a JSON parser needs the first section only (plan, trade-off 5).
