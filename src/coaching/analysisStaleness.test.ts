import { test } from "node:test";
import assert from "node:assert/strict";
import { isCachedAnalysisCurrent } from "./analysisStaleness";
import type { LapInsights } from "../analysis/types";

const MODEL = "claude-opus-4-8";
const VERSION = "0123456789abcdef";

function insights(): LapInsights {
  return {
    totalDeltaS: 0.35,
    corners: [
      {
        corner: { index: 0, apexDistance: 412.5, apexSpeed: 98, brakingStartDistance: 350, exitDistance: 470, severity: "slow" },
        deltaLossS: 0.12,
        braking: { brakingPointDiffM: -3.25, peakBrakeDiff: 0.05, trailBrakingPrimary: true, trailBrakingComparison: false, brakedPrimary: true, brakedComparison: true },
        throttle: {
          throttleOnDiffM: 4.5,
          fullThrottlePrimary: true,
          fullThrottleComparison: true,
          coastingTimePrimaryS: 0.2,
          coastingTimeComparisonS: 0.1,
          throttleOscillationPrimary: 1,
          throttleOscillationComparison: 0,
        },
        lineDeviation: { maxLateralDeviationM: 1.23, avgLateralDeviationM: 0.45 },
      },
    ],
    tyreWindowExcursions: [],
  };
}

function check(stored: unknown, computed: LapInsights, overrides: { model?: string; promptVersion?: string | null } = {}): boolean {
  return isCachedAnalysisCurrent(
    { model: overrides.model ?? MODEL, promptVersion: overrides.promptVersion === undefined ? VERSION : overrides.promptVersion, insightsJson: JSON.stringify(stored) },
    { model: MODEL, promptVersion: VERSION, insights: computed }
  );
}

test("insights além da tolerância deixam a linha velha, e os mesmos insights a deixam em dia", () => {
  const moved = insights();
  moved.totalDeltaS = 0.37; // 0,35 contra 0,37
  assert.equal(check(insights(), moved), false);
  assert.equal(check(insights(), insights()), true);

  // uma virada do round2 (0,35 contra 0,36) ainda está em dia
  const flipped = insights();
  flipped.totalDeltaS = 0.36;
  flipped.corners[0].deltaLossS = 0.13;
  assert.equal(check(insights(), flipped), true);
});

test("uma curva a mais, um booleano trocado ou uma chave faltando deixam a linha velha", () => {
  const extraCorner = insights();
  extraCorner.corners.push(extraCorner.corners[0]);
  assert.equal(check(insights(), extraCorner), false);

  const flippedBoolean = insights();
  flippedBoolean.corners[0].braking.brakedPrimary = false;
  assert.equal(check(insights(), flippedBoolean), false);

  const withoutKey = JSON.parse(JSON.stringify(insights())) as Record<string, unknown>;
  delete withoutKey.tyreWindowExcursions;
  assert.equal(check(withoutKey, insights()), false);
});

test("insights de antes dos campos novos deixam a linha velha", () => {
  const old = JSON.parse(JSON.stringify(insights())) as LapInsights;
  delete (old.corners[0].braking as { brakedPrimary?: boolean | null }).brakedPrimary;
  assert.equal(check(old, insights()), false);
});

test("outra versão do prompt, outro modelo ou versão null deixam a linha velha mesmo com os mesmos insights", () => {
  assert.equal(check(insights(), insights()), true);
  assert.equal(check(insights(), insights(), { promptVersion: "fedcba9876543210" }), false);
  assert.equal(check(insights(), insights(), { model: "outro-modelo" }), false);
  assert.equal(check(insights(), insights(), { promptVersion: null }), false);
});
