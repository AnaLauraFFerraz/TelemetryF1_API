import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "./testDb";

// setupIsolatedTestDb só pode ser chamado uma vez por processo: ./db é um
// singleton carregado uma única vez (require cacheia o módulo), então uma
// segunda chamada neste mesmo arquivo veria a conexão da primeira chamada,
// não abriria uma nova - por isso um único handle, compartilhado pelos
// três testes abaixo, igual ao padrão que T009/T010/T019 vão seguir.
const handle = setupIsolatedTestDb();

test("isola num arquivo sob o diretório temporário do sistema, não no banco fixo", () => {
  assert.ok(handle.dbPath.startsWith(os.tmpdir()));
  assert.ok(fs.existsSync(handle.dbPath));
});

test("a conexão aberta por ./db aponta exatamente para esse arquivo", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { db } = require("./db") as { db: { name: string } };
  assert.equal(db.name, handle.dbPath);
});

test("teardown fecha a conexão e remove o diretório temporário", () => {
  teardownIsolatedTestDb(handle);
  assert.equal(fs.existsSync(handle.dir), false);
});
