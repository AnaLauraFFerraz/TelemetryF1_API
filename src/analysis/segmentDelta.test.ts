import { test } from "node:test";
import assert from "node:assert/strict";
import { commonRange, computeDelta, cornerLoss, deltaAtDistance, lapStartTime, totalDelta } from "./segmentDelta";
import { makeConstantSpeedLap, makeSample } from "./testFixtures";

const SYMMETRY_TOLERANCE = 0.01 + 1e-9;
const OFFICIAL_TOLERANCE = 0.045;

function near(actual: number | null, expected: number, tolerance = 1e-9): void {
  assert.ok(actual !== null && Math.abs(actual - expected) <= tolerance, `esperava ${expected}, veio ${actual}`);
}

// A principal começa a medir 0,028 s depois da linha e a de comparação 0,1 s
// depois; as duas acabam 7 m antes dela (research.md, seção 2.2).
function syntheticPair() {
  const lapLength = 4300;
  const primary = makeConstantSpeedLap({ speedMs: 58, startSessionTime: 1000, firstDistance: 58 * 0.028, lastDistance: lapLength - 7 });
  const comparison = makeConstantSpeedLap({ speedMs: 59, startSessionTime: 2000, firstDistance: 59 * 0.1, lastDistance: lapLength - 7 });
  return { primary, comparison, officialDifferenceS: lapLength / 58 - lapLength / 59 };
}

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

test("lapStartTime extrapola o início da volta até 0 m pelas duas primeiras amostras", () => {
  // primeira amostra a 4,0 m a 10 m/s: 0,4 s depois do início
  const lap = [makeSample({ lapDistance: 4, sessionTime: 100 }), makeSample({ lapDistance: 8, sessionTime: 100.4 })];
  near(lapStartTime(lap), 99.6);
  near(lapStartTime([makeSample({ lapDistance: 0, sessionTime: 50 }), makeSample({ lapDistance: 10, sessionTime: 51 })]), 50);
  near(lapStartTime([makeSample({ lapDistance: 4, sessionTime: 100 })]), 100);
});

test("commonRange vai da maior primeira distância à menor última, e é nula sem sobreposição", () => {
  const a = makeConstantSpeedLap({ speedMs: 50, startSessionTime: 0, firstDistance: 2, lastDistance: 100 });
  const b = makeConstantSpeedLap({ speedMs: 50, startSessionTime: 0, firstDistance: 5, lastDistance: 90 });
  assert.deepEqual(commonRange(a, b), { from: 5, to: 90 });
  assert.deepEqual(commonRange(b, a), { from: 5, to: 90 });

  const early = makeConstantSpeedLap({ speedMs: 50, startSessionTime: 0, firstDistance: 0, lastDistance: 50 });
  const late = makeConstantSpeedLap({ speedMs: 50, startSessionTime: 0, firstDistance: 60, lastDistance: 100 });
  assert.equal(commonRange(early, late), null);
  assert.equal(commonRange(late, early), null);
});

test("deltaAtDistance interpola as duas voltas e é nulo fora da faixa comum", () => {
  const primary = [
    makeSample({ lapDistance: 0, sessionTime: 100 }),
    makeSample({ lapDistance: 50, sessionTime: 105 }),
    makeSample({ lapDistance: 100, sessionTime: 110 }),
  ];
  const comparison = [
    makeSample({ lapDistance: 0, sessionTime: 200 }),
    makeSample({ lapDistance: 40, sessionTime: 203 }),
    makeSample({ lapDistance: 100, sessionTime: 207.5 }),
  ];
  // em 20 m: principal 2,0 s, comparação 1,5 s; em 70 m: 7,0 s contra 5,25 s
  near(deltaAtDistance(primary, comparison, 20), 0.5);
  near(deltaAtDistance(primary, comparison, 70), 1.75);
  near(deltaAtDistance(primary, comparison, 100), 2.5);
  assert.equal(deltaAtDistance(primary, comparison, 100.5), null);
  assert.equal(deltaAtDistance(primary, comparison, -1), null);
});

test("totalDelta é o delta no fim da faixa comum e fica a 0,045 s da diferença construída", () => {
  const { primary, comparison, officialDifferenceS } = syntheticPair();
  const total = totalDelta(primary, comparison);
  assert.ok(Math.abs(total - officialDifferenceS) <= OFFICIAL_TOLERANCE, `totalDelta ${total} contra ${officialDifferenceS}`);
  assert.equal(total, deltaAtDistance(primary, comparison, commonRange(primary, comparison)!.to));
});

test("totalDelta de (A,B) mais o de (B,A) soma zero", () => {
  const { primary, comparison, officialDifferenceS } = syntheticPair();
  const forward = totalDelta(primary, comparison);
  assert.ok(Math.abs(forward - officialDifferenceS) <= OFFICIAL_TOLERANCE, `totalDelta ${forward} contra ${officialDifferenceS}`);
  assert.ok(Math.abs(forward + totalDelta(comparison, primary)) <= SYMMETRY_TOLERANCE);
});

test("cornerLoss isola a perda de um trecho com as duas voltas interpoladas, e é antissimétrica", () => {
  const { primary, comparison } = syntheticPair();
  const expected = 1000 * (1 / 58 - 1 / 59);
  const forward = cornerLoss(primary, comparison, 1000, 2000);
  assert.ok(Math.abs(forward - expected) <= SYMMETRY_TOLERANCE, `cornerLoss ${forward} contra ${expected}`);
  assert.ok(Math.abs(forward + cornerLoss(comparison, primary, 1000, 2000)) <= SYMMETRY_TOLERANCE);
});

test("cornerLoss limita o trecho à faixa comum e devolve 0 sem faixa comum", () => {
  const { primary, comparison } = syntheticPair();
  // faixa comum: de 5,9 m (primeira amostra da comparação) a 4293 m
  const expected = (4293 - 59 * 0.1) * (1 / 58 - 1 / 59);
  const wholeLap = cornerLoss(primary, comparison, -500, 9000);
  assert.ok(Math.abs(wholeLap - expected) <= SYMMETRY_TOLERANCE, `cornerLoss ${wholeLap} contra ${expected}`);
  assert.equal(cornerLoss([], comparison, 0, 100), 0);
});

test("computeDelta devolve pontos só nas distâncias da principal dentro da faixa comum", () => {
  const primary = makeConstantSpeedLap({ speedMs: 10, startSessionTime: 0, firstDistance: 0, lastDistance: 100, stepM: 25 });
  const comparison = makeConstantSpeedLap({ speedMs: 10, startSessionTime: 500, firstDistance: 20, lastDistance: 80, stepM: 20 });
  const series = computeDelta(primary, comparison);
  assert.deepEqual(
    series.map(([distance]) => distance),
    [25, 50, 75]
  );
  for (const [, delta] of series) near(delta, 0);
});
