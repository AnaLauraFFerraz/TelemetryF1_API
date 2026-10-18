import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface IsolatedTestDb {
  dbPath: string;
  dir: string;
}

/**
 * Isola um teste num SQLite descartável, nunca no data/telemetry.db real.
 *
 * Define DB_PATH ANTES de carregar ./db - mas isso só funciona se ./db for
 * carregado via require() depois dessa chamada, não via import estático no
 * topo do arquivo de teste: import é hoisted (roda antes de qualquer outra
 * linha do módulo), então um import de algo que abre o banco já teria
 * executado antes desta função sequer ser chamada.
 *
 * Confere, antes de devolver o controle, que a conexão aberta por ./db
 * aponta de fato pro arquivo temporário (via Database.name do
 * better-sqlite3) - se não apontar, aborta imediatamente, antes de
 * qualquer escrita no banco de verdade.
 */
export function setupIsolatedTestDb(): IsolatedTestDb {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-test-"));
  const dbPath = path.join(dir, "test.db");
  process.env.DB_PATH = dbPath;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { db } = require("./db") as { db: { name: string } };
  if (db.name !== dbPath) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `[testDb] a conexão aberta aponta para "${db.name}", não para o banco de teste "${dbPath}" - ` +
        `abortando antes de qualquer escrita (DB_PATH foi definida tarde demais?).`
    );
  }

  return { dbPath, dir };
}

/**
 * Fecha a conexão e remove o diretório temporário. Chamar sempre num
 * after() - roda mesmo se o teste falhar.
 */
export function teardownIsolatedTestDb(handle: IsolatedTestDb): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { closeDb } = require("./db") as { closeDb(): void };
    closeDb();
  } catch {
    // já fechado, ou nunca chegou a abrir - ok ignorar no teardown.
  }
  fs.rmSync(handle.dir, { recursive: true, force: true });
  delete process.env.DB_PATH;
}
