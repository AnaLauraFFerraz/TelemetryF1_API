import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// cwd fora do repositório: dotenv/config lê o .env do diretório corrente, e um
// .env local faria o teste passar pelo motivo errado.
test("a persistência carrega sem WS_PORT, UDP_PORT e HTTP_PORT", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-noports-"));
  try {
    const dbFile = path.join(tempDir, "test.db");
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.WS_PORT;
    delete env.UDP_PORT;
    delete env.HTTP_PORT;
    env.DB_PATH = dbFile;
    env.TS_NODE_PROJECT = path.join(REPO_ROOT, "tsconfig.json");

    const dbModule = path.join(REPO_ROOT, "src", "persistence", "db.ts");
    const result = spawnSync(
      process.execPath,
      ["-r", require.resolve("ts-node/register"), "-e", `require(${JSON.stringify(dbModule)})`],
      { cwd: tempDir, env, encoding: "utf8", timeout: 30000 },
    );

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes(`[db] usando banco em ${dbFile}`),
      `stdout: ${result.stdout}`,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
