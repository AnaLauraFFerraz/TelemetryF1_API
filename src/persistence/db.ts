import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env";
import { SCHEMA_SQL } from "./schema";

fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });

export const db = new Database(env.dbPath);

// Só muda de data/telemetry.db quando DB_PATH está definida (ver env.ts) -
// loga pra deixar visível quando isso acontece, em vez de silencioso.
console.log(`[db] usando banco em ${env.dbPath}`);

// WAL: leituras feitas pelas rotas HTTP não ficam bloqueadas por escritas do
// pipeline UDP (e vice-versa) - no modo journal padrão elas se bloqueariam.
db.pragma("journal_mode = WAL");

// SQLite não habilita FKs por padrão; sem isso, ON DELETE CASCADE do schema
// simplesmente não dispara.
db.pragma("foreign_keys = ON");

db.exec(SCHEMA_SQL);

// Migração defensiva: bancos locais criados antes da Fase 2 (Coach IA) não
// têm a coluna track_id. SQLite não suporta "ADD COLUMN IF NOT EXISTS" -
// tenta e ignora o erro esperado se a coluna já existir (instalações novas
// já nascem com ela via SCHEMA_SQL acima, e caem no catch aqui).
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN track_id INTEGER`);
} catch (err) {
  if (!(err instanceof Error) || !err.message.includes("duplicate column name")) {
    throw err;
  }
}

// Mesmo padrão acima, pra overall_frame_identifier: bancos criados antes
// dessa coluna existir recebem o ALTER; instalações novas já nascem com ela
// via SCHEMA_SQL e caem no catch. Os índices UNIQUE ficam de fora do
// SCHEMA_SQL e são criados aqui, depois do ALTER - assim funcionam tanto
// num banco migrado quanto num banco novo, sem depender de qual dos dois
// caminhos criou a coluna.
for (const table of ["car_telemetry_samples", "motion_samples"]) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN overall_frame_identifier INTEGER`);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("duplicate column name")) {
      throw err;
    }
  }
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS ux_car_telemetry_samples_session_frame
    ON car_telemetry_samples(session_id, overall_frame_identifier);
  CREATE UNIQUE INDEX IF NOT EXISTS ux_motion_samples_session_frame
    ON motion_samples(session_id, overall_frame_identifier);
`);

export function closeDb(): void {
  db.close();
}
