import { test } from "node:test";
import assert from "node:assert/strict";
import { isCachedAnalysisCurrent } from "./analysisStaleness";

const CURRENT = { model: "claude-opus-4-8", promptVersion: "0123456789abcdef" };

test("mesma versão do prompt e mesmo modelo: a linha está em dia", () => {
  assert.equal(isCachedAnalysisCurrent({ model: "claude-opus-4-8", promptVersion: "0123456789abcdef" }, CURRENT), true);
});

test("outra versão do prompt: a linha está velha", () => {
  assert.equal(isCachedAnalysisCurrent({ model: "claude-opus-4-8", promptVersion: "fedcba9876543210" }, CURRENT), false);
});

test("outro modelo: a linha está velha", () => {
  assert.equal(isCachedAnalysisCurrent({ model: "outro-modelo", promptVersion: "0123456789abcdef" }, CURRENT), false);
});

test("versão do prompt null (linha anterior à coluna): a linha está velha", () => {
  assert.equal(isCachedAnalysisCurrent({ model: "claude-opus-4-8", promptVersion: null }, CURRENT), false);
});
