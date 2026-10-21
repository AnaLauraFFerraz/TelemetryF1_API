# Data model: Demo mode

## Database schema

**No schema change.** Same tables, columns, indexes and migrations (`src/persistence/schema.ts`, `src/persistence/db.ts`). In demo mode the database is in memory (`:memory:`), built from the recording at every start, and switched to read-only (`PRAGMA query_only = ON`) once seeded (research.md, point 3).

What demo mode writes, all before "ready":

| Table | Rows | Written by |
|---|---|---|
| `sessions` | 1 (`id` 1, the recording's `session_uid`, `track_id` 16) | existing ingestion, then `applyCaptureTimes` for `started_at` / `last_seen_at` |
| `laps` | 3 (laps 6, 7, 8) | existing ingestion (`upsertCompletedLap`), then `applyCaptureTimes` for `recorded_at` |
| `car_telemetry_samples` | 2,411 (797 / 801 / 793 for laps 6–8, 20 for the start of lap 9) | existing ingestion |
| `motion_samples` | 2,411 (same split) | existing ingestion |
| `lap_analyses` | one per seed entry (6 for the published recording) | `insertAnalysis` (existing), from the seed file |

Counts measured in research.md, point 3.

## New repository function

- `applyCaptureTimes(sessionId, times: CaptureTimes): void` in `sessionRepository` (session row) and `lapRepository` (lap rows), each with a prepared statement created at module load, as the project's repositories do. Used only by the demo build and by the export tool. No existing statement changes.

## New in-process values (not stored as such)

### `CaptureTimes`

| Field | Type | Source | Rule |
|---|---|---|---|
| `startedAt` | ISO string | `receivedAt` of the first packet carrying the session's UID | required |
| `lastSeenAt` | ISO string | `receivedAt` of the last packet carrying the session's UID | required, ≥ `startedAt` |
| `lapRecordedAt` | map lap number → ISO string | `receivedAt` of the lap data packet that completed that lap | one per completed lap |

Built by the pure function `buildCaptureTimes`; a missing `receivedAt` makes it throw, and the demo refuses to start (FR-010). For the published recording: `2026-10-16T16:30:23.797Z`, `2026-10-16T16:34:06.755Z`, laps 6/7/8 at `16:31:38.248Z`, `16:32:52.362Z`, `16:34:05.758Z`.

### `DemoConfig`

The validated demo settings: port, allowed origin, connection limit, connection duration, recording path, seed path. Rules in [contracts/configuration.md](contracts/configuration.md).

### `CoachSeedFile`

The versioned file of prepared analyses. Shape and validation in [contracts/coach-seed-file.md](contracts/coach-seed-file.md).

### Live connection (demo mode)

| State | Entered when | Leaves to |
|---|---|---|
| refused (403) | handshake with a foreign `Origin` | — (no WebSocket created) |
| full (closed 4001) | handshake accepted while `DEMO_MAX_CONNECTIONS` are open | — (never counted) |
| open | handshake accepted below the limit; counted; 5-minute timer started; per-message deflate if the client offered it | closed |
| closed | client close, heartbeat failure, `4002` at the time limit, `1001` at shutdown | — (uncounted, timer cleared) |

### Demo counters

Kept in memory for the 15-minute summary (FR-028): active connections, WebSocket and REST bytes written to the sockets (`socket.bytesWritten`), coach 503 responses, and the process CPU time. Reset only by a restart; never persisted.

### Insight comparison

`insightsMatch(stored, computed)` returns a match or the first differing path. Same structure required; numbers equal within `0.01 + 1e-9` (research.md, point 7).

## Relationships

- The **demo recording** (identified by its SHA-256) produces the **demo session** (identified by its `sessionUID`) and its **capture times**.
- The **seed file** names the recording's SHA-256 and the session's UID; each entry names two of the session's completed laps.
