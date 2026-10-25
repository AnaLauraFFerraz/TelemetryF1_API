import { test } from "node:test";
import assert from "node:assert/strict";
import { cornerStretches, detectCorners } from "./cornerDetection";
import { makeLapOnPath, makePath, PathSegment } from "./testFixtures";
import { Corner } from "./types";

function range(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += step) values.push(value);
  return values;
}

function speedProfile(points: [number, number][]): (distance: number) => number {
  return (distance) => {
    for (let i = 0; i < points.length - 1; i++) {
      const [d0, v0] = points[i];
      const [d1, v1] = points[i + 1];
      if (distance <= d1) return v0 + ((v1 - v0) * (distance - d0)) / (d1 - d0);
    }
    return points[points.length - 1][1];
  };
}

// Dois arcos de 40 m de raio, de 30 m cada, com ápices a 65 m (em 215 e
// 280 m); a velocidade cai até o mínimo em cada ápice e volta a 300 km/h em
// 250 m, o ponto mais rápido entre os dois.
const TWO_CORNERS_PATH: PathSegment[] = [
  { kind: "straight", lengthM: 200 },
  { kind: "arc", lengthM: 30, radiusM: 40, side: 1 },
  { kind: "straight", lengthM: 35 },
  { kind: "arc", lengthM: 30, radiusM: 40, side: 1 },
  { kind: "straight", lengthM: 200 },
];

function twoCornerLap(minSpeed: number, sampling: { stepM?: number; firstDistance?: number } = {}) {
  const path = makePath(TWO_CORNERS_PATH);
  const speedAt = speedProfile([
    [0, 300],
    [150, 300],
    [215, minSpeed],
    [250, 300],
    [280, minSpeed],
    [345, 300],
    [495, 300],
  ]);
  return makeLapOnPath(path, { speedAt, ...sampling });
}

function cornersOf(primary: ReturnType<typeof twoCornerLap>, comparison: ReturnType<typeof twoCornerLap>): Corner[] {
  return detectCorners(primary.telemetry, comparison.telemetry, primary.motion, comparison.motion);
}

function withoutApexSpeed(corners: Corner[]) {
  return corners.map(({ apexSpeed, ...rest }) => rest);
}

test("detecta as duas curvas pelo traçado, nos ápices geométricos", () => {
  const corners = cornersOf(twoCornerLap(100), twoCornerLap(130));
  assert.equal(corners.length, 2, `achou ${corners.length} curvas`);
  assert.ok(Math.abs(corners[0].apexDistance - 215) <= 5, `apexDistance ${corners[0].apexDistance}`);
  assert.ok(Math.abs(corners[1].apexDistance - 280) <= 5, `apexDistance ${corners[1].apexDistance}`);
  assert.deepEqual(
    corners.map((corner) => corner.index),
    [0, 1]
  );
});

test("os trechos são contíguos e sem sobreposição, do início ao fim da malha, e a fronteira é o ponto mais rápido entre os ápices", () => {
  const corners = cornersOf(twoCornerLap(100), twoCornerLap(130));
  assert.equal(corners.length, 2);
  assert.equal(corners[0].brakingStartDistance, 0);
  assert.equal(corners[0].exitDistance, 250);
  assert.equal(corners[1].brakingStartDistance, 250);
  assert.equal(corners[1].exitDistance, 495);
  for (const corner of corners) {
    assert.ok(Number.isFinite(corner.brakingStartDistance) && Number.isFinite(corner.exitDistance));
    assert.ok(corner.brakingStartDistance < corner.exitDistance);
  }
});

test("apexSpeed é a velocidade mínima da volta principal no trecho", () => {
  const corners = cornersOf(twoCornerLap(100), twoCornerLap(130));
  assert.equal(corners.length, 2);
  assert.deepEqual(
    corners.map((corner) => corner.apexSpeed),
    [100, 100]
  );
  assert.deepEqual(
    cornersOf(twoCornerLap(130), twoCornerLap(100)).map((corner) => corner.apexSpeed),
    [130, 130]
  );
});

test("a severidade usa a média das velocidades mínimas das duas voltas: slow ≤ 110 < medium ≤ 180 < fast, igual nos dois sentidos", () => {
  const severities = (minA: number, minB: number) => [
    cornersOf(twoCornerLap(minA), twoCornerLap(minB))[0]?.severity,
    cornersOf(twoCornerLap(minB), twoCornerLap(minA))[0]?.severity,
  ];
  assert.deepEqual(severities(100, 121), ["medium", "medium"]);
  assert.deepEqual(severities(100, 120), ["slow", "slow"]);
  assert.deepEqual(severities(170, 190), ["medium", "medium"]);
  assert.deepEqual(severities(170, 191), ["fast", "fast"]);
});

test("com as voltas trocadas as curvas e os trechos são os mesmos, só o apexSpeed muda", () => {
  const a = twoCornerLap(100);
  const b = twoCornerLap(130, { stepM: 4, firstDistance: 2 });
  const forward = cornersOf(a, b);
  const backward = cornersOf(b, a);
  assert.equal(forward.length, 2);
  assert.equal(forward[0].apexSpeed, 100);
  assert.ok(backward[0].apexSpeed > 130 && backward[0].apexSpeed < 135, `apexSpeed ${backward[0].apexSpeed}`);
  assert.deepEqual(withoutApexSpeed(backward), withoutApexSpeed(forward));
});

test("uma queda de velocidade numa reta não é curva, e uma curva sem queda de velocidade é", () => {
  const arc = makePath([
    { kind: "straight", lengthM: 200 },
    { kind: "arc", lengthM: 60, radiusM: 40, side: 1 },
    { kind: "straight", lengthM: 200 },
  ]);
  const flatOut = makeLapOnPath(arc, { speedAt: () => 300 });
  assert.equal(detectCorners(flatOut.telemetry, flatOut.telemetry, flatOut.motion, flatOut.motion).length, 1);

  const straight = makePath([{ kind: "straight", lengthM: 460 }]);
  const dip = makeLapOnPath(straight, {
    speedAt: speedProfile([
      [0, 300],
      [200, 300],
      [230, 100],
      [260, 300],
      [460, 300],
    ]),
  });
  assert.deepEqual(detectCorners(dip.telemetry, dip.telemetry, dip.motion, dip.motion), []);
});

test("sem movimento em uma das voltas, ou sem amostras, não há curvas", () => {
  const a = twoCornerLap(100);
  const b = twoCornerLap(130);
  assert.equal(cornersOf(a, b).length, 2);
  assert.deepEqual(detectCorners(a.telemetry, b.telemetry, [], b.motion), []);
  assert.deepEqual(detectCorners(a.telemetry, b.telemetry, a.motion, []), []);
  assert.deepEqual(detectCorners([], [], [], []), []);
});

test("cornerStretches parte a malha no ponto de maior velocidade média estritamente entre dois ápices", () => {
  const grid = range(0, 100, 5);
  const speed = grid.map(() => 100);
  speed[3] = 250; // no ápice: não conta como fronteira
  speed[6] = 200;
  speed[9] = 250;
  speed[12] = 190;
  speed[15] = 250;
  assert.deepEqual(cornerStretches(grid, speed, [3, 9, 15]), [
    { from: 0, to: 30 },
    { from: 30, to: 60 },
    { from: 60, to: 100 },
  ]);
  assert.deepEqual(cornerStretches(grid, speed, [9]), [{ from: 0, to: 100 }]);
  assert.deepEqual(cornerStretches(grid, speed, []), []);
});
