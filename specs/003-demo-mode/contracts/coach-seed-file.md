# Contract: coach seed file

Internal to this repository (not consumed by the frontend). Produced by `tools/exportCoachSeed.ts`, run once by the maintainer; read by demo mode at every start.

## Location

`demo/coach-seed.json` at the repository root, versioned. Overridable with `DEMO_SEED_PATH` (used by the tests to point at a synthetic seed).

## Shape

```json
{
  "formatVersion": 1,
  "recordingSha256": "c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033",
  "sessionUid": "1026725433292396341",
  "entries": [
    {
      "lapA": 8,
      "lapB": 7,
      "model": "claude-opus-4-8",
      "analysisText": "…",
      "insights": { "…": "the LapInsights object, as buildInsights returns it" }
    }
  ]
}
```

| Field | Rule |
|---|---|
| `formatVersion` | Integer; only `1` is accepted. |
| `recordingSha256` | Lowercase hex SHA-256 of the recording file the entries were produced from. |
| `sessionUid` | Decimal string of the recording's `sessionUID`. |
| `entries` | One per ordered pair `(lapA, lapB)`, `lapA ≠ lapB`, no duplicate pair. For the published recording: the six ordered pairs of laps 6, 7 and 8. |
| `entries[].model` | The model that produced `analysisText`, as `generateCoaching` returns it. |
| `entries[].analysisText` | The coach's text, served as `analysis`. |
| `entries[].insights` | The exact insights sent to the coach, served as `insights`. |

## What the file never holds

The file is public once committed. Besides the recording's identity (`recordingSha256`, `sessionUid`), it holds only, per pair, the insights, the coach's text and the model name. It never holds anything about the account, the request or the usage: no key or key identifier, no request or message id, no timestamp of the call, no token counts, no cost. The token `usage` of each call is printed to the maintainer's console by the export and recorded, as counts only, in research.md (tasks.md T062).

## Validation at start (demo mode)

Demo mode refuses to start, with a clear message naming the problem, when:

1. the file is missing, is not valid JSON, or breaks a rule above;
2. `recordingSha256` differs from the SHA-256 of the recording in use (already verified against `PUBLISHED_RECORDING_SHA256` in production);
3. `sessionUid` differs from the `sessionUID` of the session just built;
4. an entry names a lap that is not among the built session's completed laps;
5. an entry's `insights` do not match what `buildInsights` computes now for that pair, under `insightsMatch`: the same structure (keys, array lengths and order, strings, booleans, `null`s) and every number within `|a − b| ≤ 0.01 + 1e-9`. The rule follows from how the coach receives the insights (`JSON.stringify`, with the arithmetic values rounded by `round2` and the rest copied from samples) and absorbs cross-platform and engine-version differences without hiding a real change (research.md, point 7). The message names the pair and the first differing path.

Each valid entry becomes one `lap_analyses` row (`insertAnalysis`, existing), before the connection is switched to read-only.

## The export procedure (idempotent with respect to paid calls)

For each requested pair, `tools/exportCoachSeed.ts` reuses the existing entry from the current `demo/coach-seed.json` when its `recordingSha256` and `sessionUid` match, its `insights` pass the same `insightsMatch` used at start, and its `model` equals the model the coach uses now; it calls the coach only for missing or stale pairs. Running it twice in a row makes zero calls the second time. Step-by-step in [../quickstart.md](../quickstart.md), section D.
