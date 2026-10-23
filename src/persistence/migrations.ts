import type Database from "better-sqlite3";

// SQLite não suporta "ADD COLUMN IF NOT EXISTS" - tenta e ignora só o erro
// esperado se a coluna já existir (instalações novas já nascem com ela via
// SCHEMA_SQL).
function addColumn(db: Database.Database, table: string, column: string, type: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("duplicate column name")) {
      throw err;
    }
  }
}

export function runMigrations(db: Database.Database): void {
  // Bancos locais criados antes da Fase 2 (Coach IA) não têm a coluna track_id.
  addColumn(db, "sessions", "track_id", "INTEGER");

  // Idem pra overall_frame_identifier. Os índices UNIQUE ficam de fora do
  // SCHEMA_SQL e são criados depois do ALTER - assim funcionam tanto num
  // banco migrado quanto num banco novo, sem depender de qual dos dois
  // caminhos criou a coluna.
  for (const table of ["car_telemetry_samples", "motion_samples"]) {
    addColumn(db, table, "overall_frame_identifier", "INTEGER");
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_car_telemetry_samples_session_frame
      ON car_telemetry_samples(session_id, overall_frame_identifier);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_motion_samples_session_frame
      ON motion_samples(session_id, overall_frame_identifier);
  `);

  // NULL nas linhas gravadas antes da coluna existir: o texto de uma versão
  // de prompt desconhecida conta como velho (ver analysisStaleness).
  addColumn(db, "lap_analyses", "prompt_version", "TEXT");
}
