import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Mesmo método de serverFailFast.test.ts: cwd fora do repositório e ambiente
// limpo, para o .env local não entrar no processo filho.
function runDemoServer(vars: Record<string, string>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-demofailfast-"));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const name of ["WS_PORT", "UDP_PORT", "HTTP_PORT", "DB_PATH", "ANTHROPIC_API_KEY", "DOTENV_CONFIG_PATH", "PORT", "DEMO_ALLOWED_ORIGIN"]) {
      delete env[name];
    }
    Object.assign(env, vars);
    env.TS_NODE_PROJECT = path.join(REPO_ROOT, "tsconfig.json");

    const result = spawnSync(
      process.execPath,
      ["-r", require.resolve("ts-node/register"), path.join(REPO_ROOT, "src", "server.ts")],
      { cwd: tempDir, env, encoding: "utf8", timeout: 30000 },
    );
    const dbFiles = fs.readdirSync(tempDir).filter((name) => name.endsWith(".db"));
    return { result, dbFiles };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const VALID = { DEMO_MODE: "true", PORT: "10000", DEMO_ALLOWED_ORIGIN: "http://localhost:5173" };

function assertRefused(vars: Record<string, string>, message: string): void {
  const { result, dbFiles } = runDemoServer(vars);
  assert.notEqual(result.status, null, "o servidor subiu em vez de falhar (timeout)");
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes(message), `stderr: ${result.stderr}`);
  assert.deepEqual(dbFiles, [], "um arquivo de banco foi criado");
}

test("modo demo com ANTHROPIC_API_KEY para na inicialização", () => {
  assertRefused(
    { ...VALID, ANTHROPIC_API_KEY: "chave-de-teste" },
    "O modo demo não aceita ANTHROPIC_API_KEY: remova a variável (o modo demo nunca faz chamada paga).",
  );
});

test("modo demo com DB_PATH para na inicialização sem criar o banco", () => {
  assertRefused(
    { ...VALID, DB_PATH: "demo.db" },
    "O modo demo não aceita DB_PATH: o banco do modo demo é sempre em memória.",
  );
});

test("modo demo sem PORT para na inicialização", () => {
  const { PORT: _omitted, ...withoutPort } = VALID;
  assertRefused(withoutPort, "Variável de ambiente PORT não definida (obrigatória no modo demo).");
});

test("DEMO_MODE com valor inválido para na inicialização", () => {
  assertRefused(
    { DEMO_MODE: "yes" },
    'Variável de ambiente DEMO_MODE="yes" inválida: use "true" para o modo demo, ou deixe vazia para o modo local.',
  );
});
