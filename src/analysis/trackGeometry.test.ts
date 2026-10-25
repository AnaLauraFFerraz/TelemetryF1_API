import { test } from "node:test";
import assert from "node:assert/strict";
import { commonGrid, curvature, geometricCorners, GRID_STEP_M, meanPath } from "./trackGeometry";
import { makeLapOnPath, makeMotionSample, makePath, PathSegment } from "./testFixtures";
import { MotionSample } from "./types";

function range(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += step) values.push(value);
  return values;
}

function distancesOf(motion: MotionSample[]): number[] {
  return motion.map((sample) => sample.lapDistance);
}

function cornersOf(a: MotionSample[], b: MotionSample[]) {
  const grid = commonGrid(distancesOf(a), distancesOf(b));
  return geometricCorners(grid, curvature(meanPath(a, b, grid), GRID_STEP_M));
}

// Dois arcos de 40 m de raio, de 30 m cada, com 35 m de reta entre eles (os
// ápices ficam a 65 m um do outro), uma curva aberta de 300 m de raio e um
// desvio de 10° com 80 m de raio.
const TWO_ARCS_PATH: PathSegment[] = [
  { kind: "straight", lengthM: 200 },
  { kind: "arc", lengthM: 30, radiusM: 40, side: 1 },
  { kind: "straight", lengthM: 35 },
  { kind: "arc", lengthM: 30, radiusM: 40, side: 1 },
  { kind: "straight", lengthM: 150 },
  { kind: "arc", lengthM: 150, radiusM: 300, side: 1 },
  { kind: "straight", lengthM: 100 },
  { kind: "arc", lengthM: (80 * 10 * Math.PI) / 180, radiusM: 80, side: 1 },
  { kind: "straight", lengthM: 200 },
];

function twoArcsLaps() {
  const path = makePath(TWO_ARCS_PATH);
  const lapA = makeLapOnPath(path, { speedAt: () => 200, stepM: 5, firstDistance: 0 });
  const lapB = makeLapOnPath(path, { speedAt: () => 200, stepM: 4, firstDistance: 2 });
  return { a: lapA.motion, b: lapB.motion };
}

test("a malha comum vai do primeiro múltiplo de 5 após a maior primeira distância ao último antes da menor última, igual nas duas ordens", () => {
  const a = [2.3, 50, 101];
  const b = [4.1, 60, 98];
  assert.deepEqual(commonGrid(a, b), range(5, 95, 5));
  assert.deepEqual(commonGrid(b, a), range(5, 95, 5));
  assert.deepEqual(commonGrid([0, 10], [20, 30]), []);
});

test("meanPath é a média das posições das duas voltas, cada uma interpolada na malha", () => {
  const a = range(0, 100, 10).map((d) => makeMotionSample({ lapDistance: d, worldPosition: { x: d, y: 0, z: 0 } }));
  const b = range(0, 100, 20).map((d) => makeMotionSample({ lapDistance: d, worldPosition: { x: d, y: 0, z: 2 } }));
  const grid = range(0, 100, 5);
  assert.deepEqual(
    meanPath(a, b, grid),
    grid.map((d) => ({ x: d, z: 1 }))
  );
});

test("a curvatura de um arco de 40 m de raio é 1/40, com o sinal do lado, e a de uma reta é zero", () => {
  for (const side of [1, -1] as const) {
    const path = makePath([
      { kind: "straight", lengthM: 100 },
      { kind: "arc", lengthM: (40 * 2 * Math.PI) / 3, radiusM: 40, side },
      { kind: "straight", lengthM: 100 },
    ]);
    const { motion } = makeLapOnPath(path, { speedAt: () => 200, stepM: 5 });
    const grid = commonGrid(distancesOf(motion), distancesOf(motion));
    const k = curvature(meanPath(motion, motion, grid), GRID_STEP_M);
    assert.equal(k.length, grid.length);

    // longe das pontas do arco, onde a suavização ainda enxerga só o arco
    const inside = grid.map((d, i) => ({ d, k: k[i] })).filter(({ d }) => d >= 125 && d <= 160);
    assert.ok(inside.length > 0);
    for (const point of inside) {
      assert.ok(Math.abs(point.k - side / 40) <= 0.05 / 40, `curvatura ${point.k} em ${point.d} m`);
    }
    const straight = grid.map((d, i) => ({ d, k: k[i] })).filter(({ d }) => d >= 20 && d <= 80);
    for (const point of straight) {
      assert.ok(Math.abs(point.k) < 1e-9, `curvatura ${point.k} na reta em ${point.d} m`);
    }
  }
});

test("geometricCorners pede raio de até 100 m, ângulo de pelo menos 20° e separa lados opostos", () => {
  const grid = range(0, 100, 5);
  const flat = grid.map(() => 0);
  const withRun = (from: number, to: number, value: number, base = flat) => base.map((k, i) => (i >= from && i <= to ? value : k));

  // 8 pontos a 0,012 (raio 83 m): 27°
  const peaked = withRun(5, 12, 0.012);
  peaked[8] = 0.02;
  assert.deepEqual(geometricCorners(grid, peaked), [{ apexDistance: 40, startIndex: 5, endIndex: 12 }]);

  // 4 pontos a 0,012: 13,8°, abaixo do ângulo mínimo
  assert.deepEqual(geometricCorners(grid, withRun(5, 8, 0.012)), []);
  // raio de 111 m, acima do máximo, mesmo com 25°
  assert.deepEqual(geometricCorners(grid, withRun(5, 14, 0.009)), []);
  // lados opostos emendados são duas curvas
  const sides = withRun(10, 14, -0.02, withRun(5, 9, 0.02));
  assert.deepEqual(geometricCorners(grid, sides), [
    { apexDistance: 25, startIndex: 5, endIndex: 9 },
    { apexDistance: 50, startIndex: 10, endIndex: 14 },
  ]);
});

test("dois arcos de 40 m a 65 m um do outro são duas curvas; a curva aberta de 300 m e o desvio de 10° não", () => {
  const { a, b } = twoArcsLaps();
  const corners = cornersOf(a, b);
  assert.equal(corners.length, 2, `achou ${corners.length} curvas: ${corners.map((c) => c.apexDistance).join(", ")}`);
  assert.ok(Math.abs(corners[0].apexDistance - 215) <= GRID_STEP_M, `ápice ${corners[0].apexDistance}`);
  assert.ok(Math.abs(corners[1].apexDistance - 280) <= GRID_STEP_M, `ápice ${corners[1].apexDistance}`);
});

test("as curvas são as mesmas, ápice a ápice, com as voltas trocadas", () => {
  const { a, b } = twoArcsLaps();
  const forward = cornersOf(a, b);
  assert.equal(forward.length, 2);
  assert.deepEqual(cornersOf(b, a), forward);
});
