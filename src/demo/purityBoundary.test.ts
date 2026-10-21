import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Os módulos puros do modo demo não podem carregar persistence/db: ele abre a
// conexão no import, e um teste puro sem testDb abriria o banco do DB_PATH ou
// o data/telemetry.db. Se a fronteira quebrar, o DB_PATH temporário abaixo
// garante que nem este teste toca no banco real.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-purity-"));
process.env.DB_PATH = path.join(tempDir, "nunca-deveria-abrir.db");
const dbModule = require.resolve("../persistence/db");

after(() => {
  if (require.cache[dbModule]) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (require(dbModule) as { closeDb(): void }).closeDb();
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const PURE_MODULES = [
  "./captureTimes",
  "./coachSeed",
  "./insightsMatch",
  "./playerOnly",
  "./liveConnections",
  "./recording",
  "../config/demoEnv",
  "../config/mode",
  "../config/projectRoot",
];

test("os módulos puros do modo demo não carregam persistence/db", () => {
  for (const name of PURE_MODULES) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(name);
    assert.ok(!(dbModule in require.cache), `${name} carregou persistence/db`);
  }
});
