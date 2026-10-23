# Data Model: Fix the coach's input

## Persistent: `lap_analyses` (changed)

| Column | Type | Change | Notes |
|---|---|---|---|
| `id` | INTEGER PK | — | Kept by the upsert. |
| `session_id` | INTEGER NOT NULL, FK `sessions(id)` ON DELETE CASCADE | — | |
| `lap_a` | INTEGER NOT NULL | — | Primary lap. |
| `lap_b` | INTEGER NOT NULL | — | Comparison lap. |
| `insights_json` | TEXT NOT NULL | — | Replaced on regeneration. |
| `analysis_text` | TEXT NOT NULL | — | Replaced on regeneration. |
| `model` | TEXT NOT NULL | — (now read) | Compared with `COACH_MODEL`. |
| `prompt_version` | TEXT, nullable | **new** | `PROMPT_VERSION` at generation; `NULL` on every row written before this feature. |
| `created_at` | TEXT NOT NULL | — (now updated on replace) | Time of the current text. |

- **Key**: `UNIQUE (session_id, lap_a, lap_b)`, unchanged.
- **Migration**: `ALTER TABLE lap_analyses ADD COLUMN prompt_version TEXT`, ignoring only "duplicate column name"; runs at every start; idempotent; keeps existing rows (research section 6).
- **Write**: `INSERT … ON CONFLICT(session_id, lap_a, lap_b) DO UPDATE SET insights_json, analysis_text, model, prompt_version, created_at`.

### State of a cached row

```text
missing ──generate (key)──▶ current
current ──prompt or model changes in the code──▶ stale
stale (incl. prompt_version NULL) ──request with key──▶ current (row replaced)
stale ──request without key──▶ stale (503, text not served)
current ──request──▶ current (served, cached: true)
```

`isCachedAnalysisCurrent(row, { promptVersion, model })` ⇔ `row.promptVersion === promptVersion && row.model === model` (a `null` version is never equal).

## Persistent: `laps` (read only, new read)

`getLapForSession(sessionId, lapNumber) → LapRow | undefined`, a prepared statement over the existing table (`lap_time_ms`, `is_valid`). No schema change.

## In memory

### `ComparedLap`

| Field | Type | Source |
|---|---|---|
| `lapNumber` | number | the request |
| `lapTimeMs` | number \| null | `laps.lap_time_ms`; `null` when the lap has no row |
| `isValid` | boolean \| null | `laps.is_valid`; `null` when the lap has no row |

Built for the primary and the comparison lap. Official difference = `primary.lapTimeMs − comparison.lapTimeMs` when both are known, written in seconds with three decimals and a direction in words.

### Opportunity reading (derived, never stored)

| Field | Rule |
|---|---|
| rank | 1..3, position after filter `deltaLossS > 0` and stable descending sort by `deltaLossS` |
| label | `` `${rank}. ${Math.round(apexDistance)}m · +${deltaLossS.toFixed(2)}s` `` |
| braking point | `brakingPointDiffM` < 0 "antes", > 0 "depois", 0 "igual", `null` omitted |
| peak brake | `peakBrakeDiff` > 0 "mais forte", < 0 "mais leve", 0 "igual", `null` omitted; value shown on the 0–1 scale |
| trail braking | the four combinations of `trailBrakingPrimary` / `trailBrakingComparison` |
| throttle pick-up | `throttleOnDiffM` < 0 "antes", > 0 "depois", 0 "no mesmo ponto", `null` omitted |
| coasting | both values as given, in seconds |

Magnitudes are the absolute values of the insights' numbers; no other number is introduced.

### Prompt version

`PROMPT_VERSION: string` — 16 lowercase hex characters; computed at module load from the normalized system prompt and the normalized reference messages (research section 5). Exported for `analyze`, the resolver and spec 003.

### Single-flight map

`Map<string, Promise<AnalysisResult>>` keyed by `` `${sessionId}:${lapA}:${lapB}` ``; an entry exists only while its generation is running and is deleted when it settles.
