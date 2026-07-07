import { db } from "./db";
import { CarTelemetryData } from "../telemetry/carTelemetry/types";

const insertSampleStmt = db.prepare<{
  sessionId: number;
  lapNumber: number;
  lapDistance: number;
  sessionTime: number;
  speed: number;
  throttle: number;
  brake: number;
  steer: number;
  gear: number;
  engineRpm: number;
  drs: number;
}>(`
  INSERT INTO car_telemetry_samples
    (session_id, lap_number, lap_distance, session_time, speed, throttle, brake, steer, gear, engine_rpm, drs)
  VALUES
    (@sessionId, @lapNumber, @lapDistance, @sessionTime, @speed, @throttle, @brake, @steer, @gear, @engineRpm, @drs)
`);

export function insertCarTelemetrySample(
  sessionId: number,
  lapNumber: number,
  lapDistance: number,
  sessionTime: number,
  data: CarTelemetryData
): void {
  insertSampleStmt.run({
    sessionId,
    lapNumber,
    lapDistance,
    sessionTime,
    speed: data.speed,
    throttle: data.throttle,
    brake: data.brake,
    steer: data.steer,
    gear: data.gear,
    engineRpm: data.engineRPM,
    drs: data.drs,
  });
}

export interface CarTelemetrySampleRow {
  lapDistance: number;
  sessionTime: number;
  speed: number;
  throttle: number;
  brake: number;
  steer: number;
  gear: number;
  engineRpm: number;
  drs: number;
}

const listSamplesStmt = db.prepare<{ sessionId: number; lapNumber: number }>(`
  SELECT lap_distance, session_time, speed, throttle, brake, steer, gear, engine_rpm, drs
  FROM car_telemetry_samples
  WHERE session_id = @sessionId AND lap_number = @lapNumber
  ORDER BY lap_distance
`);

export function listCarTelemetrySamplesForLap(sessionId: number, lapNumber: number): CarTelemetrySampleRow[] {
  const rows = listSamplesStmt.all({ sessionId, lapNumber }) as Array<{
    lap_distance: number;
    session_time: number;
    speed: number;
    throttle: number;
    brake: number;
    steer: number;
    gear: number;
    engine_rpm: number;
    drs: number;
  }>;

  return rows.map((row) => ({
    lapDistance: row.lap_distance,
    sessionTime: row.session_time,
    speed: row.speed,
    throttle: row.throttle,
    brake: row.brake,
    steer: row.steer,
    gear: row.gear,
    engineRpm: row.engine_rpm,
    drs: row.drs,
  }));
}
