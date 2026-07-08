import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInsights } from "./buildInsights";
import { makeSample, makeMotionSample } from "./testFixtures";
import { TelemetrySample, MotionSample } from "./types";

function buildTelemetry(sessionTimeAt: (d: number) => number): TelemetrySample[] {
  const samples: TelemetrySample[] = [];
  for (let d = 0; d <= 300; d += 10) {
    const speed = d < 100 ? 300 : d <= 150 ? 300 - (d - 100) * 4.4 : d <= 200 ? 80 + (d - 150) * 4.4 : 300;
    const brake = d >= 100 && d < 150 ? 1 : 0;
    const throttle = d < 100 ? 1 : d <= 150 ? 0 : d <= 200 ? (d - 150) / 50 : 1;
    samples.push(makeSample({ lapDistance: d, sessionTime: sessionTimeAt(d), speed, brake, throttle }));
  }
  return samples;
}

function buildMotion(zOffset: number): MotionSample[] {
  const samples: MotionSample[] = [];
  for (let d = 0; d <= 300; d += 10) {
    samples.push(makeMotionSample({ lapDistance: d, worldPosition: { x: d, y: 0, z: zOffset } }));
  }
  return samples;
}

test("orquestra as camadas puras num LapInsights coerente", () => {
  // principal perde 1s a partir do apex (d=150) - uma frenagem mal
  // aproveitada ou saída ruim, o suficiente pra virar delta acumulado.
  const primaryTelemetry = buildTelemetry((d) => d / 50 + (d >= 150 ? 1.0 : 0));
  const comparisonTelemetry = buildTelemetry((d) => d / 50);
  const primaryMotion = buildMotion(1);
  const comparisonMotion = buildMotion(0);

  const insights = buildInsights({ primaryTelemetry, comparisonTelemetry, primaryMotion, comparisonMotion });

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
  const telemetry = buildTelemetry((d) => d / 50);
  const motion = buildMotion(0);

  const insights = buildInsights({
    primaryTelemetry: telemetry,
    comparisonTelemetry: telemetry,
    primaryMotion: motion,
    comparisonMotion: motion,
  });

  assert.ok(Math.abs(insights.totalDeltaS) < 1e-6);
  for (const corner of insights.corners) {
    assert.ok(Math.abs(corner.deltaLossS) < 1e-6);
  }
});

test("sem dados de motion, lineDeviation vem null mas o resto da análise segue", () => {
  const primaryTelemetry = buildTelemetry((d) => d / 50 + (d >= 150 ? 0.5 : 0));
  const comparisonTelemetry = buildTelemetry((d) => d / 50);

  const insights = buildInsights({
    primaryTelemetry,
    comparisonTelemetry,
    primaryMotion: [],
    comparisonMotion: [],
  });

  assert.equal(insights.corners.length, 1);
  assert.equal(insights.corners[0].lineDeviation, null);
});
