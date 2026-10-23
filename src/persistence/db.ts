import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { dbPath } from "../config/dbPath";
import { SCHEMA_SQL } from "./schema";
import { runMigrations } from "./migrations";

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

// Só muda de data/telemetry.db quando DB_PATH está definida (ver dbPath.ts) -
// loga pra deixar visível quando isso acontece, em vez de silencioso.
console.log(`[db] usando banco em ${dbPath}`);

// WAL: leituras feitas pelas rotas HTTP não ficam bloqueadas por escritas do
// pipeline UDP (e vice-versa) - no modo journal padrão elas se bloqueariam.
db.pragma("journal_mode = WAL");

// SQLite não habilita FKs por padrão; sem isso, ON DELETE CASCADE do schema
// simplesmente não dispara.
db.pragma("foreign_keys = ON");

db.exec(SCHEMA_SQL);
runMigrations(db);

export function closeDb(): void {
  db.close();
}
