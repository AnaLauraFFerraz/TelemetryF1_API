import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Só imprime o caminho resolvido: nada abre o banco. cwd fora do repositório
// para o dotenv/config não carregar o .env local.
function printDbPath(extraEnv: Record<string, string>): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-dbpath-"));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.DB_PATH;
    delete env.DEMO_MODE;
    delete env.DOTENV_CONFIG_PATH;
    Object.assign(env, extraEnv);
    env.TS_NODE_PROJECT = path.join(REPO_ROOT, "tsconfig.json");

    const modulePath = JSON.stringify(path.join(REPO_ROOT, "src", "config", "dbPath"));
    const result = spawnSync(
      process.execPath,
      ["-r", require.resolve("ts-node/register"), "-e", `process.stdout.write(require(${modulePath}).dbPath)`],
      { cwd: tempDir, env, encoding: "utf8", timeout: 30000 },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    return result.stdout;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("sem DB_PATH, o caminho do banco é data/telemetry.db na raiz do repositório", () => {
  assert.equal(printDbPath({}), path.join(REPO_ROOT, "data", "telemetry.db"));
});

test("no modo demo, o banco é sempre em memória", () => {
  assert.equal(printDbPath({ DEMO_MODE: "true" }), ":memory:");
});
