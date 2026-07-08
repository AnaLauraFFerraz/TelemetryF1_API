import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTyreTemp, TYRE_SURFACE_TEMP_MIN_C, TYRE_SURFACE_TEMP_MAX_C } from "./tyreWindows";

test("temperatura abaixo do mínimo é 'cold'", () => {
  assert.equal(classifyTyreTemp(TYRE_SURFACE_TEMP_MIN_C - 1), "cold");
});

test("temperatura acima do máximo é 'hot'", () => {
  assert.equal(classifyTyreTemp(TYRE_SURFACE_TEMP_MAX_C + 1), "hot");
});

test("temperatura dentro da janela é 'ideal'", () => {
  const midpoint = (TYRE_SURFACE_TEMP_MIN_C + TYRE_SURFACE_TEMP_MAX_C) / 2;
  assert.equal(classifyTyreTemp(midpoint), "ideal");
});

test("limites da janela (inclusive) são 'ideal'", () => {
  assert.equal(classifyTyreTemp(TYRE_SURFACE_TEMP_MIN_C), "ideal");
  assert.equal(classifyTyreTemp(TYRE_SURFACE_TEMP_MAX_C), "ideal");
});
