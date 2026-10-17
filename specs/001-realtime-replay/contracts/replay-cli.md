# Contract: `npm run replay` CLI

This is the one external interface this feature changes. It is a developer-facing CLI, not the REST/WS contract the frontend consumes — confirmed in [research.md](../research.md) point 1 that no REST/WS row shape changes. Documented here as the "command schema" the plan commits to, so `/speckit-tasks` and the implementation build the same thing `quickstart.md` validates.

## Invocation

```bash
npm run replay -- <recording.jsonl> [--speed=1x|2x|max] [--loop]
```

| Argument | Required | Default | Notes |
|---|---|---|---|
| `<recording.jsonl>` | yes | — | Path to a file written by `tools/recorder.ts`. Unchanged format. |
| `--speed` | no | `1x` | One of `1x`, `2x`, `max`. `max` is today's existing unpaced behaviour (FR-002). |
| `--loop` | no | off | Restarts from the first packet when the recording ends (FR-003). |

## Validation (before any packet is sent — FR-007)

| Condition | Behaviour |
|---|---|
| File path missing from argv | Exit non-zero, usage message. |
| File does not exist / unreadable | Exit non-zero, message naming the path. |
| `--speed` value not one of `1x`/`2x`/`max` | Exit non-zero, message listing the three accepted values. |
| File has zero parseable lines | Exit non-zero, message saying the recording is empty. |

A line that fails to parse (truncated/corrupt JSON) is logged and skipped (FR-008); the replay still proceeds as long as at least one line parsed.

## Reports (FR-006)

**On start**, one line each stating: the file path, the resolved speed, whether looping is on, the packet count, and the recording's own duration (`max(timestampMs) - min(timestampMs)` across the parsed packets).

**On end** (normal completion of a non-looped run, or on `SIGINT`/`SIGTERM` during a looped run): one line stating packets sent and passes completed.

## Interruption (FR-009)

`SIGINT`/`SIGTERM` abort cleanly, including mid-wait between two packets and mid-pass of a loop. The end report (above) still prints before the process exits.

## Non-contract: stdout wording

Exact message text is not frozen by this contract (unlike the REST error strings in `sessionsRouter`/`analysisRouter`, which the frontend matches literally) — this CLI has no frontend consumer. Log language follows the project convention (Portuguese), per `CLAUDE.md`.
