import { test } from "node:test";
import assert from "node:assert/strict";
import { decideCapacity, decideOrigin } from "./liveConnections";

const ALLOWED = "https://exemplo.github.io";

test("aceita a origem configurada, exatamente igual", () => {
  assert.equal(decideOrigin(ALLOWED, ALLOWED), "accept");
});

test("aceita um handshake sem Origin (cliente fora do navegador)", () => {
  assert.equal(decideOrigin(undefined, ALLOWED), "accept");
});

test("recusa outra origem, a origem com barra no fim e o host em outra caixa", () => {
  assert.equal(decideOrigin("https://outro.example", ALLOWED), "refuse");
  assert.equal(decideOrigin(`${ALLOWED}/`, ALLOWED), "refuse");
  assert.equal(decideOrigin("https://Exemplo.github.io", ALLOWED), "refuse");
});

test("abaixo do limite aceita; no limite, lotado", () => {
  for (const max of [1, 5]) {
    for (let open = 0; open < max; open += 1) {
      assert.equal(decideCapacity(open, max), "accept", `open=${open} max=${max}`);
    }
    assert.equal(decideCapacity(max, max), "full", `open=${max} max=${max}`);
  }
});
