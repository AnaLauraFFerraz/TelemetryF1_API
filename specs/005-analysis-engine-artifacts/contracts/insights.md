# Contract: `LapInsights` in `POST /sessions/:id/analysis`

The response stays `{ analysis, insights, cached }` with the same status codes and error bodies. Only `insights` changes. The frontend mirrors it in `Telemetry-F1/src/types/rest.ts`; this file is the list for the frontend spec (constitution, principle VI).

## Shape

| Path | Before | After |
|---|---|---|
| `totalDeltaS` | `number` | `number` (same) |
| `corners[]` | `CornerInsight[]` | same |
| `corners[].corner.{index, apexDistance, apexSpeed, brakingStartDistance, exitDistance, severity}` | as today | same names and types |
| `corners[].deltaLossS` | `number` | same |
| `corners[].braking.{brakingPointDiffM, peakBrakeDiff}` | `number \| null` | same |
| `corners[].braking.{trailBrakingPrimary, trailBrakingComparison}` | `boolean` | same |
| `corners[].braking.brakedPrimary` | — | **added** `boolean \| null` |
| `corners[].braking.brakedComparison` | — | **added** `boolean \| null` |
| `corners[].throttle.throttleOnDiffM` | `number \| null` | same |
| `corners[].throttle.fullThrottlePrimary` | — | **added** `boolean \| null` |
| `corners[].throttle.fullThrottleComparison` | — | **added** `boolean \| null` |
| `corners[].throttle.{coasting*, throttleOscillation*}` | `number` | same |
| `corners[].lineDeviation` | `LineDeviationInsight \| null` | same |
| `tyreWindowExcursions` | as today | same |

No field is removed or renamed (plan, O5, decided 2026-10-25). **Debt for the frontend spec:** `corner.brakingStartDistance` now means the start of the corner's stretch, not a braking point, and `corner.exitDistance` its end; renaming them is that spec's decision.

## Meaning

| Field | Before | After |
|---|---|---|
| `totalDeltaS` | last value of a series normalized by each lap's first sample, comparison clamped at its last sample; not symmetric, up to 0.13 s from the official difference | delta at the last distance both laps cover, starts extrapolated to 0 m; symmetric; within 0.021 s of the official difference on the recording (tolerance 0.045 s) |
| `corners` | speed minima of the **primary** lap; (A,B) and (B,A) may differ | places from the track's geometry; the same in both directions |
| `corner.apexDistance` | primary lap's slowest point (smoothed) | highest curvature of the two laps' mean path |
| `corner.apexSpeed` | primary lap's speed at its apex | primary lap's minimum speed in the stretch |
| `corner.brakingStartDistance` / `exitDistance` | primary lap's braking start / full-throttle pick-up (could equal the apex, could overlap the next corner) | start / end of the corner's stretch: contiguous, never overlapping |
| `corner.severity` | from the primary lap's apex speed | from the mean of both laps' minimum speeds |
| `deltaLossS` | over the primary lap's own braking start → pick-up | over the stretch; the stretches' losses add up to `totalDeltaS`; antisymmetric |
| `brakingPointDiffM` | could compare a braking point with an apex (100–190 m) | `null` unless both laps braked in the stretch |
| `peakBrakeDiff` | could be measured over a zero-length range | over each lap's own braking phase; 0 for a lap that did not brake |
| `throttleOnDiffM` | could reuse the next corner's pick-up | `null` unless both laps reached full throttle in the stretch |
| `coasting*`, `throttleOscillation*` | from the "apex" found within ±80 m | from the lap's slowest point in the stretch |

## What the visitor sees change

- Coach chips `<rank>. <apexDistance>m · +<deltaLossS>s`: other distances and losses (same rule).
- Corner markers on the charts (`apexDistance`) and the highlighted corner (`brakingStartDistance`–`exitDistance`, now the whole stretch).
- The coach texts (regenerated).
- The "Delta acumulado" chart only after the frontend spec ports the series.
