import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDelta, cornerLoss } from "./segmentDelta";
import { makeSample } from "./testFixtures";

test("arrays vazios retornam delta vazio", () => {
  assert.deepEqual(computeDelta([], []), []);
  assert.deepEqual(computeDelta([makeSample({ lapDistance: 0, sessionTime: 0 })], []), []);
});

test("voltas idênticas têm delta zero em todo ponto", () => {
  const lap = [
    makeSample({ lapDistance: 0, sessionTime: 100 }),
    makeSample({ lapDistance: 50, sessionTime: 110 }),
    makeSample({ lapDistance: 100, sessionTime: 120 }),
  ];
  const result = computeDelta(lap, lap);
  for (const [, delta] of result) {
    assert.ok(Math.abs(delta) < 1e-9);
  }
});

test("volta de comparação mais rápida gera delta positivo (principal está atrás)", () => {
  const primary = [makeSample({ lapDistance: 0, sessionTime: 100 }), makeSample({ lapDistance: 100, sessionTime: 120 })]; // 20s
  const comparison = [makeSample({ lapDistance: 0, sessionTime: 200 }), makeSample({ lapDistance: 100, sessionTime: 215 })]; // 15s
  const result = computeDelta(primary, comparison);
  const lastDelta = result[result.length - 1][1];
  assert.ok(lastDelta > 0);
});

test("interpola linearmente quando a distância cai entre duas amostras da comparação", () => {
  const primary = [makeSample({ lapDistance: 25, sessionTime: 100 })];
  const comparison = [makeSample({ lapDistance: 0, sessionTime: 200 }), makeSample({ lapDistance: 50, sessionTime: 210 })];
  const result = computeDelta(primary, comparison);
  // comparação normalizada: [0, 10]; interpolado em 25m = 5; primary normalizado = 0
  assert.equal(result[0][1], -5);
});

test("cornerLoss isola o delta ganho/perdido dentro de um trecho", () => {
  // delta acumulado sobe de 0 (d=0) pra 1.0s (d=100) e fica estável até d=200
  const deltaSeries: [number, number][] = [
    [0, 0],
    [50, 0.5],
    [100, 1.0],
    [150, 1.0],
    [200, 1.0],
  ];
  assert.equal(cornerLoss(deltaSeries, 0, 100), 1.0);
  assert.equal(cornerLoss(deltaSeries, 100, 200), 0);
});

test("cornerLoss em série vazia devolve 0 sem crashar", () => {
  assert.equal(cornerLoss([], 0, 100), 0);
});
