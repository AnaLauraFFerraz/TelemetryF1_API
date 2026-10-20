import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// cwd num diretório temporário: a guarda procura src/ a partir do cwd, então
// cada caso monta a própria árvore em vez de depender da do repositório.
function runGuard(files: string[]) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-guard-"));
  try {
    fs.mkdirSync(path.join(tempDir, "src"));
    for (const file of files) {
      const full = path.join(tempDir, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, "");
    }

    return spawnSync(
      process.execPath,
      ["-r", require.resolve("ts-node/register"), path.join(REPO_ROOT, "tools", "assertTestFiles.ts")],
      {
        cwd: tempDir,
        env: { ...process.env, TS_NODE_PROJECT: path.join(REPO_ROOT, "tsconfig.json") },
        encoding: "utf8",
        timeout: 30000,
      },
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("a guarda reprova quando não há nenhum arquivo de teste em src/", () => {
  const result = runGuard([]);

  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes("nenhum arquivo de teste"), `stderr: ${result.stderr}`);
});

test("a guarda passa e informa a contagem quando há arquivo de teste", () => {
  const result = runGuard(["src/a/x.test.ts"]);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes("1 arquivos de teste encontrados"), `stdout: ${result.stdout}`);
});

test("a guarda ignora arquivos de teste dentro de node_modules", () => {
  const result = runGuard(["src/node_modules/x.test.ts"]);

  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes("nenhum arquivo de teste"), `stderr: ${result.stderr}`);
});
