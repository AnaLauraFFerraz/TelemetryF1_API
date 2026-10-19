import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// cwd fora do repositório: dotenv/config lê o .env do diretório corrente, e um
// .env local faria o teste passar pelo motivo errado.
function runServer(ports: Record<string, string>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-failfast-"));
  try {
    const dbFile = path.join(tempDir, "test.db");
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.WS_PORT;
    delete env.UDP_PORT;
    delete env.HTTP_PORT;
    Object.assign(env, ports);
    env.DB_PATH = dbFile;
    env.TS_NODE_PROJECT = path.join(REPO_ROOT, "tsconfig.json");

    const result = spawnSync(
      process.execPath,
      ["-r", require.resolve("ts-node/register"), path.join(REPO_ROOT, "src", "server.ts")],
      { cwd: tempDir, env, encoding: "utf8", timeout: 30000 },
    );
    return { result, dbCreated: fs.existsSync(dbFile) };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("o servidor para na inicialização quando nenhuma porta está definida", () => {
  const { result, dbCreated } = runServer({});

  assert.notEqual(result.status, null, "o servidor subiu em vez de falhar (timeout)");
  assert.notEqual(result.status, 0);
  assert.ok(
    result.stderr.includes("Variável de ambiente WS_PORT não definida. Confira seu arquivo .env (veja .env.example)."),
    `stderr: ${result.stderr}`,
  );
  assert.equal(dbCreated, false, "o banco foi criado antes da validação das portas");
});

test("o servidor para na inicialização quando WS_PORT é inválida", () => {
  const { result, dbCreated } = runServer({ WS_PORT: "abc", UDP_PORT: "1", HTTP_PORT: "2" });

  assert.notEqual(result.status, null, "o servidor subiu em vez de falhar (timeout)");
  assert.notEqual(result.status, 0);
  assert.ok(
    result.stderr.includes('Variável de ambiente WS_PORT="abc" não é uma porta válida (1-65535).'),
    `stderr: ${result.stderr}`,
  );
  assert.equal(dbCreated, false, "o banco foi criado antes da validação das portas");
});
