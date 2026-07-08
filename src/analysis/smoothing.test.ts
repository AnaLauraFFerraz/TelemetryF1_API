import { test } from "node:test";
import assert from "node:assert/strict";
import { movingAverage } from "./smoothing";

test("série constante não é alterada pela suavização", () => {
  const points: [number, number][] = [
    [0, 100],
    [10, 100],
    [20, 100],
    [30, 100],
  ];
  assert.deepEqual(movingAverage(points, 3), points);
});

test("windowSize <= 1 devolve a série original sem cópia processada", () => {
  const points: [number, number][] = [
    [0, 10],
    [10, 50],
  ];
  assert.deepEqual(movingAverage(points, 1), points);
});

test("array vazio devolve array vazio", () => {
  assert.deepEqual(movingAverage([], 5), []);
});

test("suaviza um pico isolado sem deslocar o eixo x", () => {
  const points: [number, number][] = [
    [0, 100],
    [10, 100],
    [20, 500], // pico de ruído
    [30, 100],
    [40, 100],
  ];
  const smoothed = movingAverage(points, 3);

  // eixo x preservado
  assert.deepEqual(
    smoothed.map(([x]) => x),
    [0, 10, 20, 30, 40]
  );
  // o pico foi reduzido pela média com os vizinhos
  assert.ok(smoothed[2][1] < 500);
  assert.ok(smoothed[2][1] > 100);
});

test("janela parcial nas bordas usa só os vizinhos disponíveis", () => {
  const points: [number, number][] = [
    [0, 10],
    [10, 20],
    [20, 30],
  ];
  // window=3, halfWindow=1: no índice 0 a janela é [0,1] (não existe -1)
  const smoothed = movingAverage(points, 3);
  assert.equal(smoothed[0][1], (10 + 20) / 2);
  assert.equal(smoothed[2][1], (20 + 30) / 2);
});
