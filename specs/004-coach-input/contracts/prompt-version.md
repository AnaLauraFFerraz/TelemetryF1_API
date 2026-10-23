# Contract: the prompt version (consumed by spec 003)

## Export

```ts
// src/coaching/promptVersion.ts
export const PROMPT_VERSION: string;                 // 16 lowercase hex characters
export function computePromptVersion(
  systemPrompt: string,
  buildMessage: typeof buildCoachUserMessage
): string;                                           // pure; exported for the tests
```

```ts
// src/coaching/coachModel.ts
export const COACH_MODEL: string;                    // "claude-opus-4-8", unchanged
```

Neither module imports `src/config/env` or `src/persistence/db`: importing them needs no port, no key and no database.

## Semantics

- Derived from the system prompt and from the messages the builder produces for fixed reference inputs; never set by hand.
- Line breaks are normalized (`\r\n` and `\r` → `\n`) before hashing, so a CRLF checkout (the maintainer's Windows clone with `core.autocrlf`, where the export runs) and an LF checkout (the hosting platform, where demo mode checks) give the same value.
- Changes when the prompt text changes or the message built for the same input changes; does not change on comments or formatting of the source.
- Does not include the model; a cached text is current only when both `PROMPT_VERSION` and `COACH_MODEL` match.

## Use in spec 003 (not implemented here)

The demo seed records `promptVersion` per entry (`formatVersion` 2), and demo mode refuses at start a seed whose `promptVersion` differs from `PROMPT_VERSION` — the same staleness rule as `lap_analyses`.
