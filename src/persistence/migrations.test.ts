import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema";
import { runMigrations } from "./migrations";

// Cópia congelada do DDL de src/persistence/schema.ts em 9cbcd73 ("feat: add
// lap_analyses cache table and repository"): o esquema mais antigo com
// lap_analyses, ainda sem overall_frame_identifier nas tabelas de amostras.
// Exercita os ALTER e os índices antigos. Não editar: ela é o banco antigo.
const SCHEMA_9CBCD73 = `
CREATE TABLE IF NOT EXISTS sessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_uid         TEXT NOT NULL UNIQUE,
  game_year           INTEGER NOT NULL,
  game_major_version  INTEGER NOT NULL,
  game_minor_version  INTEGER NOT NULL,
  track_id            INTEGER,
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

CREATE TABLE IF NOT EXISTS lap_analyses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  lap_a          INTEGER NOT NULL,
  lap_b          INTEGER NOT NULL,
  insights_json  TEXT NOT NULL,
  analysis_text  TEXT NOT NULL,
  model          TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (session_id, lap_a, lap_b)
);
`;

// Cópia congelada do DDL de src/persistence/schema.ts na main logo antes da
// spec 004 (6fa1837), mais os dois índices UNIQUE que o db.ts criava depois:
// o estado do banco real depois das migrações anteriores, só sem prompt_version.
// Não editar.
const SCHEMA_6FA1837 = `
CREATE TABLE IF NOT EXISTS sessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_uid         TEXT NOT NULL UNIQUE,
  game_year           INTEGER NOT NULL,
  game_major_version  INTEGER NOT NULL,
  game_minor_version  INTEGER NOT NULL,
  track_id            INTEGER,
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
  overall_frame_identifier INTEGER,
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
  overall_frame_identifier INTEGER,
  world_pos_x   REAL NOT NULL,
  world_pos_y   REAL NOT NULL,
  world_pos_z   REAL NOT NULL,
  g_force_lat   REAL NOT NULL,
  g_force_lon   REAL NOT NULL,
  g_force_vert  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_motion_samples_lap
  ON motion_samples(session_id, lap_number, lap_distance);

CREATE TABLE IF NOT EXISTS lap_analyses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  lap_a          INTEGER NOT NULL,
  lap_b          INTEGER NOT NULL,
  insights_json  TEXT NOT NULL,
  analysis_text  TEXT NOT NULL,
  model          TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (session_id, lap_a, lap_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_car_telemetry_samples_session_frame
  ON car_telemetry_samples(session_id, overall_frame_identifier);
CREATE UNIQUE INDEX IF NOT EXISTS ux_motion_samples_session_frame
  ON motion_samples(session_id, overall_frame_identifier);
`;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-test-"));
const openDbs: Database.Database[] = [];

function openDb(name: string): Database.Database {
  const conn = new Database(path.join(tmpDir, name));
  openDbs.push(conn);
  return conn;
}

after(() => {
  for (const conn of openDbs) conn.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const TABLES = ["sessions", "laps", "car_telemetry_samples", "motion_samples", "lap_analyses"];

function columnNames(conn: Database.Database, table: string): string[] {
  return (conn.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name);
}

function indexNames(conn: Database.Database): string[] {
  return (conn.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map((i) => i.name);
}

function seedRows(conn: Database.Database): void {
  conn.exec(`
    INSERT INTO sessions (id, session_uid, game_year, game_major_version, game_minor_version, track_id)
    VALUES (1, '123', 24, 1, 0, 16);
    INSERT INTO laps (session_id, lap_number, lap_time_ms, is_valid) VALUES (1, 8, 73372, 1);
    INSERT INTO car_telemetry_samples
      (session_id, lap_number, lap_distance, session_time, speed, throttle, brake, steer, gear, engine_rpm, drs,
       tyre_pressure_rl, tyre_pressure_rr, tyre_pressure_fl, tyre_pressure_fr,
       tyre_surface_temp_rl, tyre_surface_temp_rr, tyre_surface_temp_fl, tyre_surface_temp_fr,
       tyre_inner_temp_rl, tyre_inner_temp_rr, tyre_inner_temp_fl, tyre_inner_temp_fr)
    VALUES (1, 8, 100.5, 12.25, 250, 1, 0, 0.1, 6, 11000, 0, 23, 23, 22, 22, 90, 90, 88, 88, 95, 95, 93, 93);
    INSERT INTO motion_samples
      (session_id, lap_number, lap_distance, session_time, world_pos_x, world_pos_y, world_pos_z, g_force_lat, g_force_lon, g_force_vert)
    VALUES (1, 8, 100.5, 12.25, 1, 2, 3, 0.5, -0.5, 1);
    INSERT INTO lap_analyses (session_id, lap_a, lap_b, insights_json, analysis_text, model)
    VALUES (1, 8, 7, '{}', 'texto antigo', 'claude-opus-4-8');
  `);
}

type Snapshot = Record<string, Record<string, unknown>[]>;

function snapshot(conn: Database.Database): Snapshot {
  return Object.fromEntries(TABLES.map((table) => [table, conn.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, unknown>[]]));
}

function assertMigrated(conn: Database.Database, before: Snapshot): void {
  const after = snapshot(conn);
  for (const table of TABLES) {
    assert.equal(after[table].length, before[table].length, `${table}: o número de linhas mudou`);
    after[table].forEach((row, i) => {
      for (const [column, value] of Object.entries(before[table][i])) {
        assert.deepEqual(row[column], value, `${table}.${column} mudou`);
      }
    });
  }
  assert.ok(columnNames(conn, "lap_analyses").includes("prompt_version"));
  assert.equal(after.lap_analyses[0].prompt_version, null);
  for (const table of ["car_telemetry_samples", "motion_samples"]) {
    assert.ok(columnNames(conn, table).includes("overall_frame_identifier"));
    assert.equal(after[table][0].overall_frame_identifier, null);
  }
  const indexes = indexNames(conn);
  assert.ok(indexes.includes("ux_car_telemetry_samples_session_frame"));
  assert.ok(indexes.includes("ux_motion_samples_session_frame"));
}

for (const [label, ddl] of [
  ["o esquema mais antigo com lap_analyses (9cbcd73), sem overall_frame_identifier", SCHEMA_9CBCD73],
  ["o esquema da main antes da spec 004 (6fa1837), só sem prompt_version", SCHEMA_6FA1837],
] as const) {
  test(`migra ${label}: linhas intactas, prompt_version NULL e idempotente`, () => {
    const conn = openDb(`${ddl === SCHEMA_9CBCD73 ? "antigo" : "main"}.db`);
    conn.exec(ddl);
    seedRows(conn);
    const before = snapshot(conn);

    runMigrations(conn);
    assertMigrated(conn, before);
    const afterFirst = snapshot(conn);

    runMigrations(conn);
    assertMigrated(conn, before);
    assert.deepEqual(snapshot(conn), afterFirst);
  });
}

test("num banco criado com o SCHEMA_SQL novo a migração não falha nem muda as colunas", () => {
  const conn = openDb("novo.db");
  conn.exec(SCHEMA_SQL);
  const before = TABLES.map((table) => columnNames(conn, table));

  runMigrations(conn);

  assert.deepEqual(TABLES.map((table) => columnNames(conn, table)), before);
  assert.ok(columnNames(conn, "lap_analyses").includes("prompt_version"));
});
