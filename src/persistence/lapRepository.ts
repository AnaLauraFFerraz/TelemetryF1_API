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

export interface TrackBenchmark {
  bestLapTimeMs: number | null;
  bestLapSessionId: number | null;
  bestLapNumber: number | null;
  // soma dos melhores setores válidos já registrados na pista, mesmo que
  // venham de voltas/sessões diferentes - representa o "potencial" do
  // piloto ali, não uma volta que ele de fato completou.
  theoreticalBestMs: number | null;
}

// Considera TODAS as sessões já gravadas nessa pista, não só a atual -
// histórico de benchmark persiste entre sessões (é o ponto da Fase 2).
const bestLapForTrackStmt = db.prepare<{ trackId: number }>(`
  SELECT l.session_id AS session_id, l.lap_number AS lap_number, l.lap_time_ms AS lap_time_ms
  FROM laps l
  JOIN sessions s ON s.id = l.session_id
  WHERE s.track_id = @trackId AND l.is_valid = 1
  ORDER BY l.lap_time_ms ASC
  LIMIT 1
`);

const bestSectorsForTrackStmt = db.prepare<{ trackId: number }>(`
  SELECT MIN(l.sector1_ms) AS best_sector1_ms, MIN(l.sector2_ms) AS best_sector2_ms, MIN(l.sector3_ms) AS best_sector3_ms
  FROM laps l
  JOIN sessions s ON s.id = l.session_id
  WHERE s.track_id = @trackId AND l.is_valid = 1
`);

export function getTrackBenchmark(trackId: number): TrackBenchmark {
  const bestLap = bestLapForTrackStmt.get({ trackId }) as
    | { session_id: number; lap_number: number; lap_time_ms: number }
    | undefined;

  const sectors = bestSectorsForTrackStmt.get({ trackId }) as
    | { best_sector1_ms: number | null; best_sector2_ms: number | null; best_sector3_ms: number | null }
    | undefined;

  const theoreticalBestMs =
    sectors && sectors.best_sector1_ms !== null && sectors.best_sector2_ms !== null && sectors.best_sector3_ms !== null
      ? sectors.best_sector1_ms + sectors.best_sector2_ms + sectors.best_sector3_ms
      : null;

  return {
    bestLapTimeMs: bestLap?.lap_time_ms ?? null,
    bestLapSessionId: bestLap?.session_id ?? null,
    bestLapNumber: bestLap?.lap_number ?? null,
    theoreticalBestMs,
  };
}
