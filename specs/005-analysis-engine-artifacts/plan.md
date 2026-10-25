# Implementation Plan: Fix the analysis engine's artifacts

**Branch**: `005-analysis-engine-artifacts` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-analysis-engine-artifacts/spec.md`; investigation and design research in [research.md](research.md).

## Summary

The investigation (research.md, sections 0–9) confirmed every observation as an engine artifact, partly mixed with real driving: the delta series takes each lap's first and last stored samples as its start and end; corners are detected on the primary lap only, with a prominence test that passes 1–10 km/h throttle lifts; ±80 m windows let neighbouring corners share a point; the backward walk for the braking start stops at the apex when the brake was released before it; the forward walk for the throttle pick-up has no bound. The out-lap and a flashback were excluded.

The design makes a corner **a place on the track**: corners come from the track's geometry (curvature of the two laps' mean path), so (A,B) and (B,A) have the same set; each corner owns a contiguous stretch, bounded at the fastest point between it and its neighbours; each lap's behaviour (slowest point, braking start, full-throttle pick-up) is measured inside that stretch, with "did not brake" and "no full throttle" as facts distinct from "unknown". The delta series counts each lap from its start extrapolated to 0 m and evaluates both laps on the same distances, so `totalDeltaS` agrees with the official difference within 0.021 s and every difference is exactly antisymmetric. A cached analysis is valid only while its insights match freshly computed ones (`insightsMatch`, brought from spec 003). A versioned cut of the recording carries the properties into the CI.

## Technical Context

**Language/Version**: TypeScript (strict, CommonJS) on Node.js 22 (`.nvmrc`, ≥ 22.17)

**Primary Dependencies**: none new; `better-sqlite3` only in the fixture tool and the existing repositories

**Storage**: SQLite, unchanged schema (no migration: the insights comparison happens at read time against the row's stored `insights_json`)

**Testing**: `node:test` + `node:assert/strict` via `ts-node/register`; synthetic fixtures in `src/analysis/testFixtures.ts`; a versioned recording cut (JSON) for the property tests

**Target Platform**: the existing server and CLI tools

**Project Type**: web service (REST/WebSocket) with pure analysis library

**Performance Goals**: an analysis request already reads both laps' samples on a miss; now it reads them on every request to compare insights (about 1,600 telemetry and 1,600 motion rows, plus the pure computation; measured in the implementation, no target beyond today's interactive use)

**Constraints**: `src/analysis/` pure and deterministic; no paid call; no access to `data/telemetry.db`; recording cut under its ceiling

**Scale/Scope**: one engine, its contract, the coach's reading and prompt, the cache staleness rule, documentation

## Constitution Check

| Principle | Status |
|---|---|
| I. Validated binary parsing | Not touched. |
| II. Ingestion never crashes; config fails fast | Not touched; the analysis is not on the ingestion path. |
| III. Deterministic analysis; the AI only explains | Kept: geometry, stretches and behaviour are pure functions of the samples; the coach still receives only `LapInsights` plus the code's reading. The cached-analysis rule keeps paid calls to one per pair and input (a call happens only when the insights actually changed). |
| IV. Record what is known; never invent | Strengthened: the invented 100–190 m differences become `null` with a boolean saying what happened; the authoritative lap times stay the reference for `totalDeltaS`. |
| V. Simple, embedded infrastructure | No new dependency, no schema change. |
| VI. This repository owns the API contract | Contract changes listed in [contracts/insights.md](contracts/insights.md) and in "Impact" below, for the frontend spec. |
| Workflow (SDD, tests, CI gate, commits, limitations) | Spec, plan and tasks committed before code; `npm test` and `npm run typecheck` before each commit; Known limitations updated in README and `CLAUDE.md` together. The recording cut is an exception to "recordings stay out of git", recorded in `CLAUDE.md` (Rules) and the README (FR-015c); the rule is not in the constitution, so no amendment. |

Gate: **passes**, with the fixture exception recorded where the rule is written. Re-checked after the design: no change.

## Project Structure

### Documentation (this feature)

```text
specs/005-analysis-engine-artifacts/
├── spec.md
├── plan.md                 # this file
├── research.md             # Phase 0 (sections 0–9) and design research (10–15)
├── data-model.md           # corner, stretch, behaviour, insights
├── contracts/
│   ├── insights.md         # LapInsights, field by field, before and after
│   └── coach-reading.md    # the coach's prompt and reading changes
├── quickstart.md           # how to verify the six pairs and the cut
├── evidence/               # investigation scripts (not run by npm test)
│   ├── buildResearchDb.ts
│   ├── inspect.ts
│   ├── rawChecks.ts
│   └── cornerOptions.ts
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
src/analysis/
├── trackGeometry.ts        # NEW (pure): mean path of two laps on a 5 m grid, curvature, geometric corners
├── cornerDetection.ts      # REWRITTEN: corners from trackGeometry + stretches (partition at the fastest mean point); hasProminence removed
├── cornerBehaviour.ts      # NEW (pure): per lap, inside a stretch: slowest point, braking start or none, full-throttle pick-up or none
├── sampleSearch.ts         # findApexIndexNear, findBrakingStartIndex, findThrottleOnIndex replaced by cornerBehaviour; peakInRange kept
├── segmentDelta.ts         # computeDelta: start extrapolated to 0 m, both laps on the same distances, common range; cornerLoss interpolates
├── brakingAnalysis.ts      # stretch-based; brakedPrimary/brakedComparison
├── throttleAnalysis.ts     # stretch-based; fullThrottlePrimary/fullThrottleComparison; coasting from the slowest point
├── buildInsights.ts        # orchestration; totalDeltaS at the last common distance
├── types.ts                # new fields, documented meanings
├── recordingCutFormat.ts   # NEW (pure): writes and reads the cut (only the fields the engine reads, 9 significant digits)
├── recordingCut.json       # NEW: the versioned cut (laps 6–8), generated
└── recordingCut.test.ts    # NEW: the cut's identity and size ceiling, then the property tests each engine phase adds
src/coaching/
├── insightsMatch.ts        # NEW: from 003-demo-mode:src/demo/insightsMatch.ts, unchanged, with its tests
├── analysisStaleness.ts    # current = same prompt version, same model, insights match
├── analysisResolver.ts     # computes the pair's insights before deciding; stale → regenerate or 503
├── coachPrompt.ts          # field descriptions updated (contracts/coach-reading.md)
├── coachReading.ts         # "did not brake" / "no full throttle" phrases
└── promptVersion.ts        # REFERENCE_INPUTS gain the new fields
tools/
└── exportRecordingCut.ts   # NEW: recording → temporary DB → recordingCut.json, records the recording's SHA-256
README.md, CLAUDE.md        # engine description, Known limitations, fixture exception
```

## Design decisions (from research)

| # | Decision | Research |
|---|---|---|
| D1 | **Corners from the track's geometry** (option B): the two laps' `worldPosition` (x, z) interpolated on a common 5 m grid and averaged; heading and curvature, smoothed over 35 m (7 grid points); a corner is a run of same-sign curvature with radius ≤ 100 m and turning angle ≥ 20°; its apex is the point of highest curvature. Symmetric by construction: 8 places in all three pairs, and in the three pairs of laps 1–3 of a local recording of the same session. `hasProminence` is no longer used for detection and is removed. | §10 |
| D2 | **The corner's stretch is a partition**: consecutive corners split at the highest mean speed of the two laps between their apexes; the first starts at the start of the common range, the last ends at its end. `brakingStartDistance` and `exitDistance` carry the stretch's bounds (always numbers). | §10.1 |
| D3 | **Behaviour per lap inside the stretch**: the lap's slowest sample; its braking start = the first sample of the last braking phase (brake > 0.1) that ends before the slowest sample, or none; its pick-up = the first sample at throttle ≥ 0.9 after the slowest sample, or none. Peak brake over that braking phase (0 when none). Trail braking and coasting measured from the lap's own points. | §4, §10.2 |
| D4 | **"Did not brake" is a fact** (option F): `braking.brakedPrimary/brakedComparison` and `throttle.fullThrottlePrimary/fullThrottleComparison`, `boolean \| null` (`null` only when the lap has no samples in the stretch). `brakingPointDiffM` is `null` unless both laps braked; `throttleOnDiffM` unless both reached full throttle. | §11 |
| D5 | **Delta series, alternative 2**: each lap's elapsed time from its start extrapolated to 0 m from its first two samples; the series evaluated at the primary lap's sample distances inside the range both laps cover, with both laps interpolated; `totalDeltaS` at the last common distance; `cornerLoss` interpolates both laps at the stretch's bounds. Alternative 3 rejected. `computeDelta` implements this series (checked 2026-10-25) and stays in `segmentDelta.ts` as the reference port for the frontend spec; the engine itself uses `totalDelta` and `cornerLoss`. | §2.3, §12 |
| D6 | **Tolerances**: same corners identical; differences and losses antisymmetric within 0.01 + 1e-9; `totalDeltaS` within 0.045 s of the official difference. | §14 |
| D7 | **One staleness rule**: a cached analysis is current when its prompt version and model are the current ones and `insightsMatch(stored, computed)` holds; otherwise regenerate with the key, 503 without; a pair whose laps lost their samples answers as today's "no samples". `insightsMatch` is brought unchanged to `src/coaching/insightsMatch.ts`, the commit naming `003-demo-mode:src/demo/insightsMatch.ts` as its origin. | spec FR-018 |
| D8 | **Recording cut**: the stored samples of laps 6–8 with only the fields the engine reads, numbers written with 9 significant digits (lossless for float32), plus each lap's number, official time and validity and the recording's SHA-256; generated by `tools/exportRecordingCut.ts` from the published recording through a temporary database. Measured 600,523 bytes; **ceiling 660,000 bytes** (10% margin), enforced by a test. | §13 |
| D9 | **Severity and `apexSpeed`** (approved): `apexSpeed` stays the primary lap's minimum speed in the stretch (behaviour, documented); `severity` is classified on the mean of the two laps' minimum speeds, so it is the same in both directions. | data-model.md |

## Options (decided by the maintainer on 2026-10-25)

Each with the recommendation first. **Decisions: O1 B, O2 partition, O3 F, O4 no corners, O5 keep the names; D9 approved.** With them:

- The geometry thresholds (radius 100 m, turning angle 20°, smoothing 35 m, grid 5 m) become named constants in `src/analysis/trackGeometry.ts`, each with the reason for its value (research §10).
- Known limitations in README and `CLAUDE.md`, in the same commit as the behaviour: the thresholds were validated on Interlagos only, and on a track whose fast corners have a radius above 100 m those corners may not appear; a lap without motion samples gets no corners.
- Future work, recorded: revalidate the thresholds when a recording of another track exists.
- Debt for the frontend spec, recorded: renaming `brakingStartDistance`, which now means the start of the corner's stretch (and `exitDistance`, its end).

**O1 — How corners are found** (FR-013). Recommended **B, geometry** (D1).

| Option | For | Against |
|---|---|---|
| **B** geometry of the mean path | a corner is literally a place; same 8 places in every pair seen; T1 and T2 two corners whoever braked; a corner where a lap only lifted still exists | thresholds (100 m, 20°, 35 m smoothing) validated on Interlagos only; needs motion samples |
| A detect on both laps, merge apexes | uses speed only | counts T1 twice (334 and 391 m); count depends on the merge distance (10 / 9 / 8) |
| C minima of the mean speed | uses speed only, symmetric | a corner where only one lap slowed may vanish (6–7 loses T2 and ~2,496 m) |

**O2 — The stretch** (FR-009). Recommended **partition** (D2).

| Option | For | Against |
|---|---|---|
| **Partition** at the fastest mean point | contiguous, no overlap, numeric; losses add up to the total; behaviour always inside | a corner's loss includes the straight after it; the frontend's highlight becomes wider |
| Trimmed to "both laps flat" | the highlight covers only the corner | breaks the measurements: flat corners collapse, braking cut out, most throttle differences `null` (§10.1) |

**O3 — "Did not brake"** (spec, decision 2). Recommended **F, booleans** (D4).

| Option | Contract | Prompt / reading | Frontend | Demo seed |
|---|---|---|---|---|
| **F** booleans per lap | 4 additive fields | 2 new phrase families, field descriptions | types only (no UI reads braking today) | regenerated anyway |
| N only `null` | none | none | none | regenerated anyway |
| S status per difference | 2 fields replaced (breaking) | one phrase per status | types change, renamed fields | regenerated anyway |

**O4 — A lap without motion samples.** Recommended **no corners** (`corners: []`, `totalDeltaS` and tyre windows still computed), documented as a limitation: motion and telemetry are stored together with identical counts in every recording read (§10.3), and a second definition doubles the tests. Alternative: fall back to option C.

**O5 — Field names of the bounds.** Recommended **keep `brakingStartDistance` / `exitDistance`**, with their new meaning (the stretch's bounds) documented in the contract, and record the rename as debt for the frontend spec: renaming now breaks the frontend's highlight the moment this merges, while the frontend spec has to happen anyway (FR-020). Alternative: rename to `stretchStartDistance` / `stretchEndDistance` now, a breaking contract change shipped with the frontend spec.

## Impact

### Contract (REST `POST /sessions/:id/analysis`, `insights`) — for the frontend's `src/types/rest.ts`

Details in [contracts/insights.md](contracts/insights.md). Shape: four **added** fields (O3-F); no field removed or renamed (O5). Meaning: `totalDeltaS` now agrees with the official difference; `corner.apexDistance` is the geometric apex (same in both directions); `corner.brakingStartDistance`/`exitDistance` are the stretch's bounds; `corner.severity` from both laps; `deltaLossS` over the stretch (sums to the total); the difference fields are `null` when either lap did not brake / did not reach full throttle. The response's other keys (`analysis`, `cached`) and status codes do not change; a pair that was served from the cache can now answer 503 without the key (its insights changed), a status the frontend already handles.

### Prompt and coach reading (spec 004's code)

Details in [contracts/coach-reading.md](contracts/coach-reading.md): the `totalDeltaS` line (no longer "not the official difference", still "use the official difference of the message"); `corners` described as the track's corners, the same in both directions; `brakingStartDistance`/`exitDistance` as the corner's stretch; `deltaLossS` including the exit onto the next straight; the four booleans; coasting from the lap's slowest point. The reading adds phrases for "did not brake (only lifted)" and "did not reach full throttle before the next corner"; the opportunity labels keep their rule (the numbers change because `apexDistance` and `deltaLossS` change).

### `PROMPT_VERSION`

**Changes**, through three declared causes: the system prompt text, the reading's new phrases, and `REFERENCE_INPUTS` gaining the four fields (the reference inputs are typed `LapInsights`). A test keeps showing that a change of engine values alone (same prompt, same builder, same reference inputs) leaves it unchanged (SC-007). Every row of `lap_analyses` and every entry of the demo seed becomes stale through the version, independently of D7.

### Frontend (a separate spec, not changed here)

- **Delta chart**: its copy is identical to today's backend (research §7) and already shows the error (0.28 vs 0.162 s in (6,7); 0.13 s off in (8,7), which the demo shows). It must port D5 — or, the alternative for that spec, receive the series from the API and drop the copy (a contract change, decided there together with the opportunity rule's way out). **Blocks publishing the demo** (FR-020).
- **Types**: four optional boolean fields; documented meanings of `apexDistance`, the bounds, `totalDeltaS`.
- **Visible changes without code changes**: the chips' distances and losses (`apexDistance`, `deltaLossS`), the corner markers (`SessionAnalysisPage.tsx:164`), and the highlight (`:170`), which becomes the whole stretch.
- Debt recorded for that spec: the bounds' names (O5).

### The demo's seed file (spec 003)

All six entries become stale (prompt version and insights). After this spec merges, spec 003, when updated with `main`, imports `src/coaching/insightsMatch.ts` instead of its copy, regenerates the seed from the corrected insights (its existing export, `--dry-run` first), and the maintainer reads the new texts. The seed's format does not change. The publishing dependency on the frontend spec (FR-020) is written into spec 003 in this feature's last step (SC-007a; see "Steps on another branch").

## Commit sequence (proposed; tasks.md will refine)

tasks.md refines it in one point, approved by the maintainer: the recording cut (item 7 below) comes right after `insightsMatch`, before the engine changes, so every property checked on the cut is seen failing against the previous phase's engine before the change that makes it true.

1. `docs:` spec update, research, plan, data model, contracts, quickstart, evidence scripts.
2. `docs:` tasks.
3. `feat:` `insightsMatch` on `main` (origin named in the message), with its tests.
4. `test:`/`feat:` delta series (D5) with symmetry and official-difference tests on synthetic laps.
5. `feat:` track geometry and corners (D1, D2), synthetic tests (two close corners, one lap lifting, flat corner).
6. `feat:` behaviour per stretch, braking and throttle analyses, booleans (D3, D4); `buildInsights`.
7. `feat:` recording cut tool and fixture, property tests and size ceiling (D8).
8. `feat:` coach prompt and reading, reference inputs (prompt version changes).
9. `feat:` staleness rule with insights (D7) in the resolver.
10. `docs:` README and `CLAUDE.md` (engine, Known limitations, fixture exception), research "after" for the six pairs.
11. Steps on another branch (below).

## Steps on another branch (approved for this feature)

Near the end: switch to `003-demo-mode` with a clean working tree, make one `docs:` commit in spec 003 recording the publishing dependency of the "Delta acumulado" chart (FR-020), and stop before pushing. That branch already has a local commit not yet pushed (`0e63e48`), which goes with that push. This becomes a task in tasks.md.

## Manual tasks of the maintainer

None on `data/telemetry.db`: there is no schema change. Reading the six pairs' new insights (quickstart) before spec 003 regenerates the seed.

## Out of scope, recorded

- The frontend (chart, types, highlight, field names).
- The demo mode and its seed (spec 003).
- Flashback and out-lap (their spec); not present in the published recording.
- Validating the geometry thresholds on another track (no recording available): a Known limitation.

## Complexity Tracking

| Item | Why | Simpler alternative rejected because |
|---|---|---|
| A 600 KB JSON fixture in git | the six-pair properties (symmetry, total vs official, same corners) need real whole laps in the CI | synthetic laps do not reproduce the cases found (§3–§6); downloading the recording in the CI adds network and 25 MB per run (spec 003, research §11) |
| Geometry from motion | only a lap-independent definition makes the corner set the same both ways | speed-based options fail on the data (§10) |
