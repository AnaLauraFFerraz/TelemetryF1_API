# Data Model: Fix the analysis engine's artifacts

Pure values computed by `src/analysis/`; nothing is persisted except the insights JSON already stored in `lap_analyses.insights_json` (no schema change). Decisions referenced as D1–D9 are in [plan.md](plan.md).

## Common grid

The distances both laps cover, `[max(firstA, firstB), min(lastA, lastB)]`, at 5 m. Every quantity computed from both laps (mean path, mean speed) is computed on it by linear interpolation of each lap's stored samples; the same inputs in either order give the same grid and the same values, so the result is symmetric by construction.

## Corner (a place)

| Field | Meaning | Source |
|---|---|---|
| `index` | position in the lap, 0-based; internal, never shown | order of the geometric apexes |
| `apexDistance` | distance of the highest curvature of the two laps' mean path | D1 |
| `apexSpeed` | the **primary** lap's minimum speed inside the stretch (km/h) | D3, D9 |
| `brakingStartDistance` | the stretch's start (name kept, O5) | D2 |
| `exitDistance` | the stretch's end (name kept, O5) | D2 |
| `severity` | `slow` ≤ 110 < `medium` ≤ 180 < `fast`, on the mean of both laps' minimum speeds in the stretch | D9 |

Rules:

- A corner is a run of grid points with curvature of the same sign and radius ≤ 100 m whose turning angle is ≥ 20° (curvature smoothed over 7 points = 35 m).
- Stretches are contiguous and do not overlap: the boundary between corners *i* and *i*+1 is the grid point of highest mean speed strictly between their apexes; the first stretch starts at the grid's start, the last ends at its end.
- (A,B) and (B,A) have the same corners, apex for apex, and the same stretches.
- Without motion samples for either lap: no corners (O4).

## Behaviour of a lap in a corner

Measured on the lap's own stored samples with `lapDistance` inside the stretch.

| Value | Rule | When it does not exist |
|---|---|---|
| slowest point | the sample with the lowest speed (first one on ties) | the lap has no sample in the stretch → everything below is unknown (`null`) |
| braking start | walking back from the slowest point, the last braking phase (consecutive samples with brake > 0.1) that ends at or before it; its first sample | no such phase in the stretch → **did not brake** (`braked = false`) |
| braking peak | the highest brake over that phase | 0 when the lap did not brake |
| trail braking | brake > 0.1 with \|steer\| > 0.15 between the braking start and the slowest point | `false` when it did not brake |
| full-throttle pick-up | the first sample at throttle ≥ 0.9 from the slowest point on (the slowest sample itself included), inside the stretch | none before the stretch ends → **no full throttle** (`fullThrottle = false`) |
| coasting time | time with brake ≤ 0.05 and throttle ≤ 0.05 from the slowest point to the pick-up, or to the stretch's end | — |
| throttle oscillation | direction changes of the throttle (steps ≥ 0.02) over the same range | — |

## CornerInsight (per corner, primary − comparison)

| Field | Rule |
|---|---|
| `deltaLossS` | `delta(exitDistance) − delta(brakingStartDistance)` on the series below, both laps interpolated at the bounds; the stretches' losses add up to `totalDeltaS` |
| `braking.brakingPointDiffM` | difference of the braking starts; `null` unless both laps braked |
| `braking.peakBrakeDiff` | difference of the peaks (a lap that did not brake has peak 0); `null` only when a lap has no samples |
| `braking.trailBrakingPrimary` / `Comparison` | as above |
| `braking.brakedPrimary` / `brakedComparison` | **new**, `boolean \| null` |
| `throttle.throttleOnDiffM` | difference of the pick-ups; `null` unless both laps reached full throttle |
| `throttle.fullThrottlePrimary` / `fullThrottleComparison` | **new**, `boolean \| null` |
| `throttle.coastingTime*S`, `throttleOscillation*` | per lap, as above |
| `lineDeviation` | `summarizeLineDeviation` over the stretch, unchanged otherwise |

## Delta series and `totalDeltaS`

- Each lap's start time: its first sample's `sessionTime` minus the time to cover its first sample's `lapDistance` at the speed implied by its first two samples (start extrapolated to 0 m, D5).
- `delta(d) = elapsedPrimary(d) − elapsedComparison(d)`, both interpolated at `d`, for `d` in the common range.
- The series returned (for the frontend's chart, if it adopts it) has a point at each of the primary lap's sample distances inside the common range.
- `totalDeltaS = delta(end of the common range)`, rounded to 0.01.

## Tolerances (D6)

| Property | Tolerance |
|---|---|
| corners of (A,B) and (B,A) | identical |
| each difference and each `deltaLossS`, (A,B) + (B,A) | ≤ 0.01 + 1e-9 |
| `totalDeltaS` − official difference | ≤ 0.045 s |
| `totalDeltaS`, (A,B) + (B,A) | ≤ 0.01 + 1e-9 |

## Cached analysis (local cache and demo seed)

Current when prompt version = current, model = current, and `insightsMatch(storedInsights, computedInsights)` (structure equal; numbers within 0.01 + 1e-9). Otherwise stale: regenerated with the key, 503 without; if the pair's samples are gone, the request answers as today for a pair without samples.

## Recording cut (`src/analysis/recordingCut.json`)

```text
{ sourceSha256, laps: [ { lapNumber, lapTimeMs, isValid,
                          telemetry: [ { lapDistance, sessionTime, speed, throttle, brake, steer, tyreSurfaceTemp: {4 wheels} } ],
                          motion:    [ { lapDistance, worldPosition: { x, z } } ] } ] }
```

Numbers with 9 significant digits (lossless for float32). Laps 6, 7, 8 whole. Ceiling 660,000 bytes. The field list is re-checked against the final engine when the tool is written (only what `src/analysis/` reads).
