import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLineDeviation, summarizeLineDeviation } from "./lineDeviation";
import { makeMotionSample } from "./testFixtures";

function straightLine(zOffset: number) {
  const samples = [];
  for (let x = 0; x <= 100; x += 10) {
    samples.push(makeMotionSample({ lapDistance: x, worldPosition: { x, y: 0, z: zOffset } }));
  }
  return samples;
}

test("arrays vazios retornam desvio vazio", () => {
  assert.deepEqual(computeLineDeviation([], []), []);
  assert.deepEqual(computeLineDeviation(straightLine(0), []), []);
});

test("mesma linha tem desvio zero em todo ponto", () => {
  const line = straightLine(0);
  const result = computeLineDeviation(line, line);
  for (const { deviationM } of result) {
    assert.ok(Math.abs(deviationM) < 1e-6);
  }
});

test("linha paralela deslocada lateralmente tem desvio constante igual ao deslocamento", () => {
  const primary = straightLine(2); // 2m deslocado em z
  const comparison = straightLine(0);

  const result = computeLineDeviation(primary, comparison);

  for (const { deviationM } of result) {
    assert.ok(Math.abs(deviationM - 2) < 0.01, `esperava ~2, foi ${deviationM}`);
  }
});

test("summarizeLineDeviation filtra pelo intervalo de distância e resume max/média", () => {
  const points = [
    { distance: 0, deviationM: 1 },
    { distance: 50, deviationM: 3 },
    { distance: 100, deviationM: -2 },
    { distance: 150, deviationM: 5 }, // fora do intervalo
  ];

  const summary = summarizeLineDeviation(points, 0, 100);

  assert.ok(summary !== null);
  assert.equal(summary!.maxLateralDeviationM, 3);
  assert.equal(summary!.avgLateralDeviationM, 0.67); // (1 + 3 - 2) / 3 = 0.666... arredondado
});

test("summarizeLineDeviation sem pontos no intervalo devolve null", () => {
  const points = [{ distance: 200, deviationM: 1 }];
  assert.equal(summarizeLineDeviation(points, 0, 100), null);
});
