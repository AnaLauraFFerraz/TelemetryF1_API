import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// A ferramenta de exportação de verdade, num processo filho com ambiente
// limpo e cwd fora do repositório (nenhum .env entra). Só as recusas que não
// precisam do banco real: a do data/telemetry.db é coberta com uma raiz falsa
// em exportEnvironment.test.ts. Sem chave nenhuma, nada pode ser chamado.
function runExport(vars: Record<string, string>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-export-"));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const name of ["ANTHROPIC_API_KEY", "DB_PATH", "DOTENV_CONFIG_PATH", "DEMO_MODE", "WS_PORT", "UDP_PORT", "HTTP_PORT"]) {
      delete env[name];
    }
    for (const [name, value] of Object.entries(vars)) env[name] = value.replace("<temp>", tempDir);
    env.TS_NODE_PROJECT = path.join(REPO_ROOT, "tsconfig.json");

    const result = spawnSync(
      process.execPath,
      ["-r", require.resolve("ts-node/register"), path.join(REPO_ROOT, "tools", "exportCoachSeed.ts")],
      { cwd: tempDir, env, encoding: "utf8", timeout: 60000 },
    );
    return { result, files: fs.readdirSync(tempDir) };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("sem DB_PATH, a exportação sai com código 1 e a mensagem, sem criar nada", () => {
  const { result, files } = runExport({});
  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.ok(
    result.stderr.includes("[exportCoachSeed] defina DB_PATH=:memory: ou um caminho temporário; o data/telemetry.db nunca é usado."),
    `stderr: ${result.stderr}`,
  );
  assert.deepEqual(files, []);
});

test("com DB_PATH temporário e sem chave, a exportação sai com código 1 e a mensagem, sem abrir o banco", () => {
  const { result, files } = runExport({ DB_PATH: "<temp>/exportacao.db" });
  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.ok(
    result.stderr.includes("[exportCoachSeed] defina ANTHROPIC_API_KEY no seu shell: a exportação é a única etapa paga e só roda com a sua chave."),
    `stderr: ${result.stderr}`,
  );
  assert.deepEqual(files, [], "o banco temporário foi aberto antes da recusa");
});
