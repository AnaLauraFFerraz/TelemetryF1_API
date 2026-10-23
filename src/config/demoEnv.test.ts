import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseDemoConfig } from "./demoEnv";

const ROOT = path.join(path.sep, "projeto");

function validEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { DEMO_MODE: "true", PORT: "10000", DEMO_ALLOWED_ORIGIN: "https://exemplo.github.io", ...overrides };
}

test("configuração válida usa os padrões do contrato", () => {
  assert.deepEqual(parseDemoConfig(validEnv(), ROOT), {
    port: 10000,
    allowedOrigin: "https://exemplo.github.io",
    maxConnections: 5,
    maxConnectionMs: 5 * 60 * 1000,
    wsCompression: true,
    recordingPath: path.join(ROOT, "recordings", "demo-interlagos-tt-20hz-laps6-8.jsonl"),
    seedPath: path.join(ROOT, "demo", "coach-seed.json"),
  });
});

test("as configurações opcionais são respeitadas", () => {
  const config = parseDemoConfig(
    validEnv({
      DEMO_MAX_CONNECTIONS: "2",
      DEMO_MAX_CONNECTION_MINUTES: "1",
      DEMO_WS_COMPRESSION: "false",
      DEMO_RECORDING_PATH: "/tmp/gravacao.jsonl",
      DEMO_SEED_PATH: "/tmp/cache.json",
    }),
    ROOT,
  );
  assert.equal(config.maxConnections, 2);
  assert.equal(config.maxConnectionMs, 60 * 1000);
  assert.equal(config.wsCompression, false);
  assert.equal(config.recordingPath, "/tmp/gravacao.jsonl");
  assert.equal(config.seedPath, "/tmp/cache.json");
});

test("recusa ANTHROPIC_API_KEY no modo demo", () => {
  assert.throws(() => parseDemoConfig(validEnv({ ANTHROPIC_API_KEY: "qualquer" }), ROOT), {
    message: "O modo demo não aceita ANTHROPIC_API_KEY: remova a variável (o modo demo nunca faz chamada paga).",
  });
});

test("recusa DB_PATH no modo demo", () => {
  assert.throws(() => parseDemoConfig(validEnv({ DB_PATH: "/tmp/x.db" }), ROOT), {
    message: "O modo demo não aceita DB_PATH: o banco do modo demo é sempre em memória.",
  });
});

test("a recusa da chave vem antes de qualquer outra checagem", () => {
  assert.throws(() => parseDemoConfig({ DEMO_MODE: "true", ANTHROPIC_API_KEY: "qualquer" }, ROOT), {
    message: "O modo demo não aceita ANTHROPIC_API_KEY: remova a variável (o modo demo nunca faz chamada paga).",
  });
});

test("PORT é obrigatória e precisa ser uma porta válida", () => {
  assert.throws(() => parseDemoConfig(validEnv({ PORT: undefined }), ROOT), {
    message: "Variável de ambiente PORT não definida (obrigatória no modo demo).",
  });
  assert.throws(() => parseDemoConfig(validEnv({ PORT: "abc" }), ROOT), {
    message: 'Variável de ambiente PORT="abc" não é uma porta válida (1-65535).',
  });
});

test("DEMO_ALLOWED_ORIGIN é obrigatória e precisa ser só uma origem", () => {
  assert.throws(() => parseDemoConfig(validEnv({ DEMO_ALLOWED_ORIGIN: undefined }), ROOT), {
    message: "Variável de ambiente DEMO_ALLOWED_ORIGIN não definida (obrigatória no modo demo).",
  });
  for (const value of ["https://x.github.io/app", "https://x.github.io/"]) {
    assert.throws(() => parseDemoConfig(validEnv({ DEMO_ALLOWED_ORIGIN: value }), ROOT), {
      message: `Variável de ambiente DEMO_ALLOWED_ORIGIN="${value}" não é uma origem válida (esquema://host[:porta], sem caminho nem barra no fim).`,
    });
  }
});

test("os limites precisam ser inteiros ≥ 1", () => {
  assert.throws(() => parseDemoConfig(validEnv({ DEMO_MAX_CONNECTIONS: "0" }), ROOT), {
    message: 'Variável de ambiente DEMO_MAX_CONNECTIONS="0" deve ser um inteiro ≥ 1.',
  });
  assert.throws(() => parseDemoConfig(validEnv({ DEMO_MAX_CONNECTION_MINUTES: "0" }), ROOT), {
    message: 'Variável de ambiente DEMO_MAX_CONNECTION_MINUTES="0" deve ser um inteiro ≥ 1.',
  });
});

test("DEMO_WS_COMPRESSION: vazia liga, false desliga, outro valor falha", () => {
  assert.equal(parseDemoConfig(validEnv({ DEMO_WS_COMPRESSION: "" }), ROOT).wsCompression, true);
  assert.equal(parseDemoConfig(validEnv({ DEMO_WS_COMPRESSION: "true" }), ROOT).wsCompression, true);
  assert.equal(parseDemoConfig(validEnv({ DEMO_WS_COMPRESSION: "false" }), ROOT).wsCompression, false);
  assert.throws(() => parseDemoConfig(validEnv({ DEMO_WS_COMPRESSION: "no" }), ROOT), {
    message: 'Variável de ambiente DEMO_WS_COMPRESSION="no" inválida: use "true" ou "false".',
  });
});
