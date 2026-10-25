import { test } from "node:test";
import assert from "node:assert/strict";
import type { LapInsights } from "../analysis/types";
import { insightsMatch } from "./insightsMatch";

function insights(): LapInsights {
  return {
    totalDeltaS: 0.35,
    corners: [
      {
        corner: { index: 0, apexDistance: 412.73046875, apexSpeed: 98.5, brakingStartDistance: 350.1, exitDistance: 470.2, severity: "slow" },
        deltaLossS: 0.12,
        braking: { brakingPointDiffM: -3.25, peakBrakeDiff: 0.05, trailBrakingPrimary: true, trailBrakingComparison: false, brakedPrimary: true, brakedComparison: true },
        throttle: { throttleOnDiffM: 4.5, fullThrottlePrimary: true, fullThrottleComparison: true,coastingTimePrimaryS: 0.2, coastingTimeComparisonS: 0.1, throttleOscillationPrimary: 1, throttleOscillationComparison: 0 },
        lineDeviation: { maxLateralDeviationM: 1.23, avgLateralDeviationM: 0.45 },
      },
      {
        corner: { index: 1, apexDistance: 1234.56, apexSpeed: 210, brakingStartDistance: 1180, exitDistance: 1300, severity: "fast" },
        deltaLossS: 0.08,
        braking: { brakingPointDiffM: null, peakBrakeDiff: null, trailBrakingPrimary: false, trailBrakingComparison: false, brakedPrimary: true, brakedComparison: true },
        throttle: { throttleOnDiffM: null, fullThrottlePrimary: true, fullThrottleComparison: true,coastingTimePrimaryS: 0, coastingTimeComparisonS: 0, throttleOscillationPrimary: 0, throttleOscillationComparison: 0 },
        lineDeviation: null,
      },
    ],
    tyreWindowExcursions: [{ wheel: "frontLeft", distanceStart: 100, distanceEnd: 300, avgTempC: 112.4, status: "hot" }],
  };
}

function mismatchPath(stored: unknown, computed: unknown): string | undefined {
  const result = insightsMatch(stored, computed);
  return result.match ? undefined : result.path;
}

test("objetos iguais batem", () => {
  assert.deepEqual(insightsMatch(insights(), insights()), { match: true });
});

test("uma virada do round2 (0,35 contra 0,36) está dentro da tolerância", () => {
  const computed = insights();
  computed.totalDeltaS = 0.36;
  assert.equal(mismatchPath(insights(), computed), undefined);
});

test("0,35 contra 0,37 está fora da tolerância", () => {
  const computed = insights();
  computed.totalDeltaS = 0.37;
  assert.equal(mismatchPath(insights(), computed), "totalDeltaS");
});

test("1234,56 contra 1234,57 está dentro da tolerância", () => {
  const computed = insights();
  computed.corners[1].corner.apexDistance = 1234.57;
  assert.equal(mismatchPath(insights(), computed), undefined);
});

test("uma distância copiada diferente em um ulp bate", () => {
  const computed = insights();
  const x = computed.corners[0].corner.apexDistance;
  computed.corners[0].corner.apexDistance = x + Number.EPSILON * x;
  assert.equal(mismatchPath(insights(), computed), undefined);
});

test("uma curva a mais não bate", () => {
  const computed = insights();
  computed.corners.push(computed.corners[1]);
  assert.equal(mismatchPath(insights(), computed), "corners");
});

test("um booleano trocado não bate", () => {
  const computed = insights();
  computed.corners[0].braking.trailBrakingPrimary = false;
  assert.equal(mismatchPath(insights(), computed), "corners[0].braking.trailBrakingPrimary");
});

test("severity trocada não bate", () => {
  const computed = insights();
  computed.corners[1].corner.severity = "medium";
  assert.equal(mismatchPath(insights(), computed), "corners[1].corner.severity");
});

test("null contra um número não bate", () => {
  const computed = insights();
  computed.corners[1].braking.brakingPointDiffM = 0;
  assert.equal(mismatchPath(insights(), computed), "corners[1].braking.brakingPointDiffM");
});

test("uma chave faltando ou sobrando não bate", () => {
  const missing = insights() as unknown as Record<string, unknown>;
  delete missing.tyreWindowExcursions;
  assert.equal(mismatchPath(insights(), missing), "tyreWindowExcursions");

  const extra = { ...insights(), usage: 1 };
  assert.equal(mismatchPath(insights(), extra), "usage");
});

test("a falha aponta o primeiro caminho diferente, com os dois valores", () => {
  const computed = insights();
  computed.corners[1].deltaLossS = 0.5;
  computed.tyreWindowExcursions[0].avgTempC = 140;
  assert.deepEqual(insightsMatch(insights(), computed), {
    match: false,
    path: "corners[1].deltaLossS",
    stored: 0.08,
    computed: 0.5,
  });
});
