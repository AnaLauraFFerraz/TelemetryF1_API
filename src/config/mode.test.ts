import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRunMode } from "./mode";

test("DEMO_MODE ausente ou vazia é o modo local", () => {
  assert.equal(parseRunMode(undefined), "local");
  assert.equal(parseRunMode(""), "local");
});

test("DEMO_MODE=true é o modo demo", () => {
  assert.equal(parseRunMode("true"), "demo");
});

test("qualquer outro valor de DEMO_MODE falha, em vez de cair no modo local", () => {
  assert.throws(() => parseRunMode("yes"), {
    message: 'Variável de ambiente DEMO_MODE="yes" inválida: use "true" para o modo demo, ou deixe vazia para o modo local.',
  });
});
