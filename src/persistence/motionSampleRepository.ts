import { db } from "./db";
import { CarMotionData } from "../telemetry/motion/types";

const insertSampleStmt = db.prepare<{
  sessionId: number;
  lapNumber: number;
  lapDistance: number;
  sessionTime: number;
  worldPosX: number;
  worldPosY: number;
  worldPosZ: number;
  gForceLat: number;
  gForceLon: number;
  gForceVert: number;
}>(`
  INSERT INTO motion_samples
    (session_id, lap_number, lap_distance, session_time, world_pos_x, world_pos_y, world_pos_z, g_force_lat, g_force_lon, g_force_vert)
  VALUES
    (@sessionId, @lapNumber, @lapDistance, @sessionTime, @worldPosX, @worldPosY, @worldPosZ, @gForceLat, @gForceLon, @gForceVert)
`);

export function insertMotionSample(
  sessionId: number,
  lapNumber: number,
  lapDistance: number,
  sessionTime: number,
  data: CarMotionData
): void {
  insertSampleStmt.run({
    sessionId,
    lapNumber,
    lapDistance,
    sessionTime,
    worldPosX: data.worldPosition.x,
    worldPosY: data.worldPosition.y,
    worldPosZ: data.worldPosition.z,
    gForceLat: data.gForceLateral,
    gForceLon: data.gForceLongitudinal,
    gForceVert: data.gForceVertical,
  });
}

export interface MotionSampleRow {
  lapDistance: number;
  sessionTime: number;
  worldPosition: { x: number; y: number; z: number };
  gForce: { lat: number; lon: number; vert: number };
}

const listSamplesStmt = db.prepare<{ sessionId: number; lapNumber: number }>(`
  SELECT lap_distance, session_time, world_pos_x, world_pos_y, world_pos_z, g_force_lat, g_force_lon, g_force_vert
  FROM motion_samples
  WHERE session_id = @sessionId AND lap_number = @lapNumber
  ORDER BY lap_distance
`);

export function listMotionSamplesForLap(sessionId: number, lapNumber: number): MotionSampleRow[] {
  const rows = listSamplesStmt.all({ sessionId, lapNumber }) as Array<{
    lap_distance: number;
    session_time: number;
    world_pos_x: number;
    world_pos_y: number;
    world_pos_z: number;
    g_force_lat: number;
    g_force_lon: number;
    g_force_vert: number;
  }>;

  return rows.map((row) => ({
    lapDistance: row.lap_distance,
    sessionTime: row.session_time,
    worldPosition: { x: row.world_pos_x, y: row.world_pos_y, z: row.world_pos_z },
    gForce: { lat: row.g_force_lat, lon: row.g_force_lon, vert: row.g_force_vert },
  }));
}
