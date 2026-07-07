// DDL puro, sem lógica. Executado uma vez na inicialização por db.ts.
//
// session_uid é TEXT, não INTEGER: sessionUID é um uint64 do protocolo, e o
// INTEGER do SQLite é signed 64-bit - não cobre todo o range de um uint64
// "aleatório" (o bit mais significativo setado já estoura o range signed).
// Guardamos a string decimal (header.sessionUID.toString()) para não perder
// precisão, com um id surrogate como PK real para joins baratos.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_uid         TEXT NOT NULL UNIQUE,
  game_year           INTEGER NOT NULL,
  game_major_version  INTEGER NOT NULL,
  game_minor_version  INTEGER NOT NULL,
  started_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS laps (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  lap_number    INTEGER NOT NULL,
  lap_time_ms   INTEGER NOT NULL,
  sector1_ms    INTEGER,
  sector2_ms    INTEGER,
  sector3_ms    INTEGER,
  is_valid      INTEGER NOT NULL CHECK (is_valid IN (0,1)),
  car_position  INTEGER,
  recorded_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (session_id, lap_number)
);
CREATE INDEX IF NOT EXISTS idx_laps_session ON laps(session_id, lap_number);

CREATE TABLE IF NOT EXISTS car_telemetry_samples (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  lap_number   INTEGER NOT NULL,
  lap_distance REAL NOT NULL,
  session_time REAL NOT NULL,
  speed        REAL NOT NULL,
  throttle     REAL NOT NULL,
  brake        REAL NOT NULL,
  steer        REAL NOT NULL,
  gear         INTEGER NOT NULL,
  engine_rpm   INTEGER NOT NULL,
  drs          INTEGER NOT NULL CHECK (drs IN (0,1)),
  tyre_pressure_rl      REAL NOT NULL,
  tyre_pressure_rr      REAL NOT NULL,
  tyre_pressure_fl      REAL NOT NULL,
  tyre_pressure_fr      REAL NOT NULL,
  tyre_surface_temp_rl  INTEGER NOT NULL,
  tyre_surface_temp_rr  INTEGER NOT NULL,
  tyre_surface_temp_fl  INTEGER NOT NULL,
  tyre_surface_temp_fr  INTEGER NOT NULL,
  tyre_inner_temp_rl    INTEGER NOT NULL,
  tyre_inner_temp_rr    INTEGER NOT NULL,
  tyre_inner_temp_fl    INTEGER NOT NULL,
  tyre_inner_temp_fr    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_car_samples_lap
  ON car_telemetry_samples(session_id, lap_number, lap_distance);

CREATE TABLE IF NOT EXISTS motion_samples (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  lap_number    INTEGER NOT NULL,
  lap_distance  REAL NOT NULL,
  session_time  REAL NOT NULL,
  world_pos_x   REAL NOT NULL,
  world_pos_y   REAL NOT NULL,
  world_pos_z   REAL NOT NULL,
  g_force_lat   REAL NOT NULL,
  g_force_lon   REAL NOT NULL,
  g_force_vert  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_motion_samples_lap
  ON motion_samples(session_id, lap_number, lap_distance);
`;
