# Data Model: Real-time replay of telemetry recordings

This feature adds one persisted field, no new tables, and two new in-memory fields on an existing structure. See [research.md](research.md) for the reasoning behind each choice.

## Persisted changes

### `car_telemetry_samples`, `motion_samples`

| Column | Type | Notes |
|---|---|---|
| `overall_frame_identifier` | `INTEGER`, nullable | New. The packet's `overallFrameIdentifier` (from `PacketHeader`). `NULL` on every row written before this feature; never backfilled (FR-010's own constraint: never invent a value for data that didn't carry it). |

New index on each table: `UNIQUE (session_id, overall_frame_identifier)`. Multiple `NULL`s coexist without conflict (verified against `better-sqlite3`'s actual behaviour, not assumed). A non-null duplicate is rejected by `INSERT OR IGNORE`, which turns the rejection into a silent no-op at the point of insertion — the row that's already there is left untouched.

No other column, no other table, and no REST/WS-facing row shape changes. `listCarTelemetrySamplesForLap` / `listMotionSamplesForLap` keep their current explicit `SELECT` column lists; `overall_frame_identifier` is write-only from the outside.

## In-memory changes

### `ActiveSession` (`src/persistence/sessionContext.ts`)

New field:

| Field | Type | Purpose |
|---|---|---|
| `maxOverallFrameId` | `number` | Highest `overallFrameIdentifier` seen for this session so far. Compared against each incoming packet's value to detect a pass restart (see below). |

Reset behaviour (fires at most once per packet, inside `getActiveSession`, before the packet is handled): if `header.overallFrameIdentifier < maxOverallFrameId - PASS_RESTART_THRESHOLD_FRAMES` (new constant, value `100`, documented in `sessionContext.ts` next to the field), the session's `lapDetector`, `lapProgress`, `carTelemetryDecimation`/`carTelemetryDecimationLap`, and `motionDecimation`/`motionDecimationLap` are all reset to their just-created-session values. `sessionId`, `trackId` and `lastTouchedAt` are **not** reset — it's the same stored session and the same track, per FR-011.

`PASS_RESTART_THRESHOLD_FRAMES` is exported (not module-private) so tests can reference it directly instead of a second hard-coded `100`. **Known limitation**: a recording whose own `overallFrameIdentifier` span is at or below this threshold never triggers the reset when looped — see research.md point 2.

## New module: `src/replay/`

Not persisted; pure/orchestration types used by both the CLI tool and its tests.

| Type / function | Shape | Notes |
|---|---|---|
| `ReplaySpeed` | `"1x" \| "2x" \| "max"` | FR-002's three values. |
| `ReplayOptions` | `{ speed: ReplaySpeed; loop: boolean }` | FR-002/FR-003 defaults: `speed: "1x"`, `loop: false`. |
| `RecordedPacket` | `{ timestampMs: number; data: Buffer }` | One decoded line of a `.jsonl` recording; `tools/replayer.ts` is the only place that still deals with base64/JSON. |
| `computeDelayMs(targetOffsetMs, elapsedMsSincePassStart, speed)` | pure function → `number` | FR-001/FR-004's core: how long to wait before the next packet. `"max"` → always `0`. |
| `runReplay(packets, options, io)` | async function → `{ packetsSent: number; passes: number }` | FR-003/FR-006/FR-009's orchestration. `io` is injectable (`send`, `now`, `wait`, `onPass`) for tests; defaults are the real UDP send, `Date.now`, and an abortable `node:timers/promises` wait. |

## Entities carried over unchanged from the spec

- **Recording** — unchanged on disk; still the existing `.jsonl` format written by `tools/recorder.ts`.
- **Replay run** / **Pass** — these are `runReplay`'s own `{ packetsSent, passes }` return value plus the start/end console reports (FR-006); not persisted anywhere.
