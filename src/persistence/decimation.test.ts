import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldPersistSample, MIN_DISTANCE_DELTA_M, MAX_TIME_GAP_MS } from "./decimation";

test("primeira amostra (sem estado anterior) sempre persiste", () => {
  assert.equal(shouldPersistSample(undefined, 0, 0), true);
});

test("não persiste se distância e tempo variaram pouco", () => {
  const last = { lastDistance: 100, lastTimeMs: 1000 };
  assert.equal(shouldPersistSample(last, 101, 1100), false);
});

test("persiste quando a distância passa do threshold", () => {
  const last = { lastDistance: 100, lastTimeMs: 1000 };
  assert.equal(shouldPersistSample(last, 100 + MIN_DISTANCE_DELTA_M, 1100), true);
});

test("persiste quando o tempo passa do threshold mesmo com o carro parado (garagem/pit)", () => {
  const last = { lastDistance: 100, lastTimeMs: 1000 };
  assert.equal(shouldPersistSample(last, 100, 1000 + MAX_TIME_GAP_MS), true);
});

test("distância negativa (antes de cruzar a linha de largada) usa valor absoluto", () => {
  const last = { lastDistance: -10, lastTimeMs: 1000 };
  assert.equal(shouldPersistSample(last, -10 - MIN_DISTANCE_DELTA_M, 1100), true);
});
