import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInsights } from "./buildInsights";
import { makeLapOnPath, makePath } from "./testFixtures";

// Reta de 100 m, um arco de 100 m de raio 60 m (a curva, ápice em 150 m) e
// reta de 100 m.
const PATH = makePath([
  { kind: "straight", lengthM: 100 },
  { kind: "arc", lengthM: 100, radiusM: 60, side: 1 },
  { kind: "straight", lengthM: 100 },
]);

function buildLap(sessionTimeAt: (d: number) => number, lateralOffsetM: number) {
  return makeLapOnPath(PATH, {
    sessionTimeAt,
    lateralOffsetM,
    speedAt: (d) => (d < 100 ? 300 : d <= 150 ? 300 - (d - 100) * 4.4 : d <= 200 ? 80 + (d - 150) * 4.4 : 300),
    brakeAt: (d) => (d >= 100 && d < 150 ? 1 : 0),
    throttleAt: (d) => (d < 100 ? 1 : d <= 150 ? 0 : d <= 200 ? (d - 150) / 50 : 1),
  });
}

test("orquestra as camadas puras num LapInsights coerente", () => {
  // principal perde 1s a partir do apex (d=150) - uma frenagem mal
  // aproveitada ou saída ruim, o suficiente pra virar delta acumulado.
  const primary = buildLap((d) => d / 50 + (d >= 150 ? 1.0 : 0), 1);
  const comparison = buildLap((d) => d / 50, 0);

  const insights = buildInsights({
    primaryTelemetry: primary.telemetry,
    comparisonTelemetry: comparison.telemetry,
    primaryMotion: primary.motion,
    comparisonMotion: comparison.motion,
  });

  assert.ok(Math.abs(insights.totalDeltaS - 1.0) < 0.1, `totalDeltaS foi ${insights.totalDeltaS}`);
  assert.equal(insights.corners.length, 1);

  const [cornerInsight] = insights.corners;
  assert.ok(Math.abs(cornerInsight.deltaLossS - 1.0) < 0.15, `deltaLossS foi ${cornerInsight.deltaLossS}`);
  assert.ok(cornerInsight.lineDeviation !== null);
  assert.ok(Math.abs(cornerInsight.lineDeviation!.avgLateralDeviationM - 1) < 0.1);

  // pneus todos a 95°C (default do fixture) - dentro da janela ideal
  assert.deepEqual(insights.tyreWindowExcursions, []);
});

test("voltas idênticas geram delta zero e nenhuma perda por curva", () => {
  const lap = buildLap((d) => d / 50, 0);

  const insights = buildInsights({
    primaryTelemetry: lap.telemetry,
    comparisonTelemetry: lap.telemetry,
    primaryMotion: lap.motion,
    comparisonMotion: lap.motion,
  });

  assert.equal(insights.corners.length, 1);
  assert.ok(Math.abs(insights.totalDeltaS) < 1e-6);
  for (const corner of insights.corners) {
    assert.ok(Math.abs(corner.deltaLossS) < 1e-6);
  }
});

test("sem dados de motion não há curvas, mas o delta total e os pneus seguem", () => {
  const primary = buildLap((d) => d / 50 + (d >= 150 ? 0.5 : 0), 0);
  const comparison = buildLap((d) => d / 50, 0);

  const withMotion = buildInsights({
    primaryTelemetry: primary.telemetry,
    comparisonTelemetry: comparison.telemetry,
    primaryMotion: primary.motion,
    comparisonMotion: comparison.motion,
  });
  assert.equal(withMotion.corners.length, 1);

  const insights = buildInsights({
    primaryTelemetry: primary.telemetry,
    comparisonTelemetry: comparison.telemetry,
    primaryMotion: [],
    comparisonMotion: [],
  });

  assert.deepEqual(insights.corners, []);
  assert.ok(Math.abs(insights.totalDeltaS - 0.5) < 0.1, `totalDeltaS foi ${insights.totalDeltaS}`);
  assert.deepEqual(insights.tyreWindowExcursions, []);
});
