import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_OPPORTUNITIES, opportunityLabel, topOpportunities } from "./opportunities";
import { CornerInsight, LapInsights } from "../analysis/types";

function corner(apexDistance: number, deltaLossS: number): CornerInsight {
  return {
    corner: { index: 0, apexDistance, apexSpeed: 100, brakingStartDistance: apexDistance - 50, exitDistance: apexDistance + 50, severity: "medium" },
    deltaLossS,
    braking: { brakingPointDiffM: null, peakBrakeDiff: null, trailBrakingPrimary: false, trailBrakingComparison: false },
    throttle: { throttleOnDiffM: null, coastingTimePrimaryS: 0, coastingTimeComparisonS: 0, throttleOscillationPrimary: 0, throttleOscillationComparison: 0 },
    lineDeviation: null,
  };
}

function insightsOf(...corners: CornerInsight[]): LapInsights {
  return { totalDeltaS: 0, corners, tyreWindowExcursions: [] };
}

// Expressão copiada do frontend (CoachPanel.tsx:65), com o rank como i + 1.
function frontendLabel(i: number, c: CornerInsight): string {
  return `${i + 1}. ${Math.round(c.corner.apexDistance)}m · +${c.deltaLossS.toFixed(2)}s`;
}

test("o limite de oportunidades é 3", () => {
  assert.equal(MAX_OPPORTUNITIES, 3);
});

test("mantém só deltaLossS positivo: 0, -0 e negativos ficam de fora", () => {
  const result = topOpportunities(insightsOf(corner(100, 0), corner(200, -0), corner(300, -0.1), corner(400, 0.05)));
  assert.deepEqual(result.map((c) => c.corner.apexDistance), [400]);
});

test("ordena por deltaLossS decrescente", () => {
  const result = topOpportunities(insightsOf(corner(100, 0.1), corner(200, 0.3), corner(300, 0.2)));
  assert.deepEqual(result.map((c) => c.deltaLossS), [0.3, 0.2, 0.1]);
});

test("valores iguais mantêm a ordem de insights.corners", () => {
  const result = topOpportunities(insightsOf(corner(100, 0.2), corner(200, 0.5), corner(300, 0.2), corner(400, 0.2)));
  assert.deepEqual(result.map((c) => c.corner.apexDistance), [200, 100, 300]);
});

test("devolve no máximo três", () => {
  const result = topOpportunities(insightsOf(corner(1, 0.1), corner(2, 0.2), corner(3, 0.3), corner(4, 0.4), corner(5, 0.5)));
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((c) => c.corner.apexDistance), [5, 4, 3]);
});

test("devolve menos de três quando menos curvas perdem tempo", () => {
  const result = topOpportunities(insightsOf(corner(1, 0.1), corner(2, -0.2), corner(3, 0.3)));
  assert.deepEqual(result.map((c) => c.corner.apexDistance), [3, 1]);
});

test("devolve vazio quando nenhuma curva perde tempo", () => {
  assert.deepEqual(topOpportunities(insightsOf(corner(1, 0), corner(2, -0.2))), []);
  assert.deepEqual(topOpportunities(insightsOf()), []);
});

test("não altera a ordem de insights.corners", () => {
  const insights = insightsOf(corner(1, 0.1), corner(2, 0.3));
  topOpportunities(insights);
  assert.deepEqual(insights.corners.map((c) => c.corner.apexDistance), [1, 2]);
});

test("o rótulo bate byte a byte com o chip do frontend", () => {
  const c = corner(333.693359375, 0.29);
  assert.equal(opportunityLabel(1, c), "1. 334m · +0.29s");
  assert.equal(opportunityLabel(1, c), frontendLabel(0, c));
  assert.ok(opportunityLabel(1, c).includes("·"));
});

test("o rótulo arredonda o ápice com Math.round (2.5 vira 3, -0.4 vira 0)", () => {
  assert.equal(opportunityLabel(3, corner(2.5, 0.1)), "3. 3m · +0.10s");
  assert.equal(opportunityLabel(1, corner(-0.4, 0.1)), "1. 0m · +0.10s");
});

test("o rótulo usa toFixed(2) sobre o valor binário (1.005 vira +1.00s)", () => {
  assert.equal(opportunityLabel(1, corner(100, 1.005)), "1. 100m · +1.00s");
});

const DEMO_PAIRS: Array<{ pair: string; corners: Array<[number, number]>; labels: string[] }> = [
  {
    pair: "6,7",
    corners: [[333.693359375, 0.29], [398.529296875, -0.08], [492.28515625, 0.03], [1403.765625, -0.26], [1492.0859375, 0], [2053.13671875, 0.38], [2149.44140625, 0.2], [2375.140625, 0.03], [2462.732421875, -0.15], [2540.970703125, 0.13], [2794.90625, 0.28], [3278.9921875, -0.25]],
    labels: ["1. 2053m · +0.38s", "2. 334m · +0.29s", "3. 2795m · +0.28s"],
  },
  {
    pair: "6,8",
    corners: [[333.693359375, 0.05], [398.529296875, -0.24], [492.28515625, 0.03], [1403.765625, -0.2], [1492.0859375, -0.01], [2053.13671875, 0.58], [2149.44140625, 0.24], [2375.140625, 0.08], [2462.732421875, -0.02], [2540.970703125, 0.22], [2794.90625, -0.14], [3278.9921875, -0.12]],
    labels: ["1. 2053m · +0.58s", "2. 2149m · +0.24s", "3. 2541m · +0.22s"],
  },
  {
    pair: "7,6",
    corners: [[391.22265625, 0.19], [1415.37109375, 0.17], [2121.28125, 0], [2367.798828125, 0.01], [2496.470703125, 0.18], [2789.705078125, -0.16], [3275.505859375, 0.38]],
    labels: ["1. 3276m · +0.38s", "2. 391m · +0.19s", "3. 2496m · +0.18s"],
  },
  {
    pair: "7,8",
    corners: [[391.22265625, -0.2], [1415.37109375, -0.15], [2121.28125, 0.02], [2367.798828125, 0], [2496.470703125, 0.11], [2789.705078125, -0.26], [3275.505859375, 0.2]],
    labels: ["1. 3276m · +0.20s", "2. 2496m · +0.11s", "3. 2121m · +0.02s"],
  },
  {
    pair: "8,6",
    corners: [[401.072265625, 0.3], [1439.76171875, 0.29], [2144.044921875, -0.08], [2374.53125, 0.05], [2490.0625, 0.13], [2781.07421875, 0.08], [3283.45703125, 0.36]],
    labels: ["1. 3283m · +0.36s", "2. 401m · +0.30s", "3. 1440m · +0.29s"],
  },
  {
    pair: "8,7",
    corners: [[401.072265625, 0.16], [1439.76171875, 0.04], [2144.044921875, -0.02], [2374.53125, 0.01], [2490.0625, -0.06], [2781.07421875, 0.08], [3283.45703125, -0.69]],
    labels: ["1. 401m · +0.16s", "2. 2781m · +0.08s", "3. 1440m · +0.04s"],
  },
];

for (const { pair, corners, labels } of DEMO_PAIRS) {
  test(`as três oportunidades do par demo (${pair}) têm os rótulos esperados`, () => {
    const top = topOpportunities(insightsOf(...corners.map(([apex, loss]) => corner(apex, loss))));
    assert.deepEqual(top.map((c, i) => opportunityLabel(i + 1, c)), labels);
    assert.deepEqual(top.map((c, i) => frontendLabel(i, c)), labels);
  });
}
