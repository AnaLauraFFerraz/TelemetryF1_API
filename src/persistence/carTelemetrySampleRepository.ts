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
  tyrePressureRl: number;
  tyrePressureRr: number;
  tyrePressureFl: number;
  tyrePressureFr: number;
  tyreSurfaceTempRl: number;
  tyreSurfaceTempRr: number;
  tyreSurfaceTempFl: number;
  tyreSurfaceTempFr: number;
  tyreInnerTempRl: number;
  tyreInnerTempRr: number;
  tyreInnerTempFl: number;
  tyreInnerTempFr: number;
}>(`
  INSERT INTO car_telemetry_samples
    (session_id, lap_number, lap_distance, session_time, speed, throttle, brake, steer, gear, engine_rpm, drs,
     tyre_pressure_rl, tyre_pressure_rr, tyre_pressure_fl, tyre_pressure_fr,
     tyre_surface_temp_rl, tyre_surface_temp_rr, tyre_surface_temp_fl, tyre_surface_temp_fr,
     tyre_inner_temp_rl, tyre_inner_temp_rr, tyre_inner_temp_fl, tyre_inner_temp_fr)
  VALUES
    (@sessionId, @lapNumber, @lapDistance, @sessionTime, @speed, @throttle, @brake, @steer, @gear, @engineRpm, @drs,
     @tyrePressureRl, @tyrePressureRr, @tyrePressureFl, @tyrePressureFr,
     @tyreSurfaceTempRl, @tyreSurfaceTempRr, @tyreSurfaceTempFl, @tyreSurfaceTempFr,
     @tyreInnerTempRl, @tyreInnerTempRr, @tyreInnerTempFl, @tyreInnerTempFr)
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
    tyrePressureRl: data.tyresPressure.rearLeft,
    tyrePressureRr: data.tyresPressure.rearRight,
    tyrePressureFl: data.tyresPressure.frontLeft,
    tyrePressureFr: data.tyresPressure.frontRight,
    tyreSurfaceTempRl: data.tyresSurfaceTemperature.rearLeft,
    tyreSurfaceTempRr: data.tyresSurfaceTemperature.rearRight,
    tyreSurfaceTempFl: data.tyresSurfaceTemperature.frontLeft,
    tyreSurfaceTempFr: data.tyresSurfaceTemperature.frontRight,
    tyreInnerTempRl: data.tyresInnerTemperature.rearLeft,
    tyreInnerTempRr: data.tyresInnerTemperature.rearRight,
    tyreInnerTempFl: data.tyresInnerTemperature.frontLeft,
    tyreInnerTempFr: data.tyresInnerTemperature.frontRight,
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
  tyrePressure: { rearLeft: number; rearRight: number; frontLeft: number; frontRight: number };
  tyreSurfaceTemp: { rearLeft: number; rearRight: number; frontLeft: number; frontRight: number };
  tyreInnerTemp: { rearLeft: number; rearRight: number; frontLeft: number; frontRight: number };
}

const listSamplesStmt = db.prepare<{ sessionId: number; lapNumber: number }>(`
  SELECT lap_distance, session_time, speed, throttle, brake, steer, gear, engine_rpm, drs,
         tyre_pressure_rl, tyre_pressure_rr, tyre_pressure_fl, tyre_pressure_fr,
         tyre_surface_temp_rl, tyre_surface_temp_rr, tyre_surface_temp_fl, tyre_surface_temp_fr,
         tyre_inner_temp_rl, tyre_inner_temp_rr, tyre_inner_temp_fl, tyre_inner_temp_fr
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
    tyre_pressure_rl: number;
    tyre_pressure_rr: number;
    tyre_pressure_fl: number;
    tyre_pressure_fr: number;
    tyre_surface_temp_rl: number;
    tyre_surface_temp_rr: number;
    tyre_surface_temp_fl: number;
    tyre_surface_temp_fr: number;
    tyre_inner_temp_rl: number;
    tyre_inner_temp_rr: number;
    tyre_inner_temp_fl: number;
    tyre_inner_temp_fr: number;
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
    tyrePressure: {
      rearLeft: row.tyre_pressure_rl,
      rearRight: row.tyre_pressure_rr,
      frontLeft: row.tyre_pressure_fl,
      frontRight: row.tyre_pressure_fr,
    },
    tyreSurfaceTemp: {
      rearLeft: row.tyre_surface_temp_rl,
      rearRight: row.tyre_surface_temp_rr,
      frontLeft: row.tyre_surface_temp_fl,
      frontRight: row.tyre_surface_temp_fr,
    },
    tyreInnerTemp: {
      rearLeft: row.tyre_inner_temp_rl,
      rearRight: row.tyre_inner_temp_rr,
      frontLeft: row.tyre_inner_temp_fl,
      frontRight: row.tyre_inner_temp_fr,
    },
  }));
}
