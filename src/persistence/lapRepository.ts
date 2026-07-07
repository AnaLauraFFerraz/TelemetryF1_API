import { db } from "./db";
import { CompletedLap } from "./types";

const upsertLapStmt = db.prepare<{
  sessionId: number;
  lapNumber: number;
  lapTimeMs: number;
  sector1Ms: number | null;
  sector2Ms: number | null;
  sector3Ms: number | null;
  isValid: number;
  carPosition: number;
}>(`
  INSERT INTO laps (session_id, lap_number, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, is_valid, car_position)
  VALUES (@sessionId, @lapNumber, @lapTimeMs, @sector1Ms, @sector2Ms, @sector3Ms, @isValid, @carPosition)
  ON CONFLICT(session_id, lap_number) DO UPDATE SET
    lap_time_ms  = excluded.lap_time_ms,
    sector1_ms   = excluded.sector1_ms,
    sector2_ms   = excluded.sector2_ms,
    sector3_ms   = excluded.sector3_ms,
    is_valid     = excluded.is_valid,
    car_position = excluded.car_position
`);

// Upsert por (session_id, lap_number): reprocessar a mesma volta (restart do
// app, replay repetido) sobrescreve em vez de duplicar ou falhar.
export function upsertCompletedLap(sessionId: number, lap: CompletedLap): void {
  upsertLapStmt.run({
    sessionId,
    lapNumber: lap.lapNumber,
    lapTimeMs: lap.lapTimeMs,
    sector1Ms: lap.sector1Ms,
    sector2Ms: lap.sector2Ms,
    sector3Ms: lap.sector3Ms,
    isValid: lap.isValid ? 1 : 0,
    carPosition: lap.carPosition,
  });
}

export interface LapRow {
  lapNumber: number;
  lapTimeMs: number;
  sector1Ms: number | null;
  sector2Ms: number | null;
  sector3Ms: number | null;
  isValid: boolean;
  carPosition: number | null;
  recordedAt: string;
}

const listLapsStmt = db.prepare<{ sessionId: number }>(`
  SELECT lap_number, lap_time_ms, sector1_ms, sector2_ms, sector3_ms, is_valid, car_position, recorded_at
  FROM laps
  WHERE session_id = @sessionId
  ORDER BY lap_number
`);

export function listLapsForSession(sessionId: number): LapRow[] {
  const rows = listLapsStmt.all({ sessionId }) as Array<{
    lap_number: number;
    lap_time_ms: number;
    sector1_ms: number | null;
    sector2_ms: number | null;
    sector3_ms: number | null;
    is_valid: number;
    car_position: number | null;
    recorded_at: string;
  }>;

  return rows.map((row) => ({
    lapNumber: row.lap_number,
    lapTimeMs: row.lap_time_ms,
    sector1Ms: row.sector1_ms,
    sector2Ms: row.sector2_ms,
    sector3Ms: row.sector3_ms,
    isValid: row.is_valid === 1,
    carPosition: row.car_position,
    recordedAt: row.recorded_at,
  }));
}
