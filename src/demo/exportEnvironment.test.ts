import { test } from "node:test";
import assert from "node:assert/strict";
import { assertExportEnvironment } from "./coachSeed";

// Raízes falsas: nenhum caminho real do repositório aparece nestes testes.
const WIN_ROOT = "C:\\projeto";
const POSIX_ROOT = "/projeto";
const KEY = { ANTHROPIC_API_KEY: "chave-de-teste" };

const NO_DB_PATH = "[exportCoachSeed] defina DB_PATH=:memory: ou um caminho temporário; o data/telemetry.db nunca é usado.";
const REAL_DB = "[exportCoachSeed] DB_PATH aponta para o data/telemetry.db do repositório: use :memory: ou um caminho temporário.";
const NO_KEY = "[exportCoachSeed] defina ANTHROPIC_API_KEY no seu shell: a exportação é a única etapa paga e só roda com a sua chave.";

test("sem DB_PATH, recusa", () => {
  assert.throws(() => assertExportEnvironment({ ...KEY }, POSIX_ROOT, "linux"), { message: NO_DB_PATH });
  assert.throws(() => assertExportEnvironment({ ...KEY, DB_PATH: "  " }, POSIX_ROOT, "linux"), { message: NO_DB_PATH });
});

test(":memory: e um caminho temporário são aceitos", () => {
  assert.doesNotThrow(() => assertExportEnvironment({ ...KEY, DB_PATH: ":memory:" }, POSIX_ROOT, "linux"));
  assert.doesNotThrow(() => assertExportEnvironment({ ...KEY, DB_PATH: "/tmp/exportacao.db" }, POSIX_ROOT, "linux"));
  assert.doesNotThrow(() => assertExportEnvironment({ ...KEY, DB_PATH: "D:\\temp\\exportacao.db" }, WIN_ROOT, "win32"));
});

test("no Linux, recusa as variantes que apontam para o data/telemetry.db", () => {
  for (const dbPath of ["/projeto/data/telemetry.db", "./data/telemetry.db", "data/telemetry.db", "tmp/../data/telemetry.db", "/projeto/x/../data/telemetry.db"]) {
    assert.throws(() => assertExportEnvironment({ ...KEY, DB_PATH: dbPath }, POSIX_ROOT, "linux"), { message: REAL_DB }, dbPath);
  }
});

test("no Linux, maiúsculas trocadas são outro arquivo e passam", () => {
  assert.doesNotThrow(() => assertExportEnvironment({ ...KEY, DB_PATH: "/projeto/DATA/telemetry.db" }, POSIX_ROOT, "linux"));
});

test("no Windows, recusa maiúsculas trocadas, ./, separador \\ e um caminho com .. que volta para data/", () => {
  for (const dbPath of [
    "C:\\projeto\\data\\telemetry.db",
    "c:\\PROJETO\\DATA\\Telemetry.DB",
    "./data/telemetry.db",
    ".\\data\\telemetry.db",
    "data\\telemetry.db",
    "data/telemetry.db",
    "tmp\\..\\data\\telemetry.db",
    "C:/projeto/x/../data/telemetry.db",
  ]) {
    assert.throws(() => assertExportEnvironment({ ...KEY, DB_PATH: dbPath }, WIN_ROOT, "win32"), { message: REAL_DB }, dbPath);
  }
});

test("sem ANTHROPIC_API_KEY, recusa depois de aceitar o DB_PATH", () => {
  assert.throws(() => assertExportEnvironment({ DB_PATH: ":memory:" }, POSIX_ROOT, "linux"), { message: NO_KEY });
  assert.throws(() => assertExportEnvironment({ DB_PATH: ":memory:", ANTHROPIC_API_KEY: "" }, POSIX_ROOT, "linux"), { message: NO_KEY });
});
