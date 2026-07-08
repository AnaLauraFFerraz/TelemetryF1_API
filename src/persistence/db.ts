import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env";
import { SCHEMA_SQL } from "./schema";

fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });

export const db = new Database(env.dbPath);

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

export function closeDb(): void {
  db.close();
}
