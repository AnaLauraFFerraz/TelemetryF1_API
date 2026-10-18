import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDelayMs } from "./scheduler";

test("1x: espera o próprio offset menos o tempo já passado", () => {
  assert.equal(computeDelayMs(1000, 0, "1x"), 1000);
  assert.equal(computeDelayMs(1000, 400, "1x"), 600);
});

test("2x: offset dividido por 2 antes de subtrair o tempo já passado", () => {
  assert.equal(computeDelayMs(1000, 0, "2x"), 500);
  assert.equal(computeDelayMs(1000, 200, "2x"), 300);
});

test("max: nunca espera, independente do offset", () => {
  assert.equal(computeDelayMs(1000, 0, "max"), 0);
  assert.equal(computeDelayMs(999999, 0, "max"), 0);
});

test("offset zero: sem espera em 1x/2x", () => {
  assert.equal(computeDelayMs(0, 0, "1x"), 0);
  assert.equal(computeDelayMs(0, 0, "2x"), 0);
});

test("offset já no passado (deadline perdido): nunca retorna negativo", () => {
  assert.equal(computeDelayMs(1000, 1500, "1x"), 0);
  assert.equal(computeDelayMs(1000, 1500, "2x"), 0);
});
