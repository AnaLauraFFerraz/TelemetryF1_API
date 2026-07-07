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

export function closeDb(): void {
  db.close();
}
