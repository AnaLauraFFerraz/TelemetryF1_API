import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeThrottle } from "./throttleAnalysis";
import { makeSample } from "./testFixtures";
import { Corner, TelemetrySample } from "./types";

const APEX_DISTANCE = 150;

// O trecho cobre a volta toda por padrão (o fim é exclusivo).
function corner(overrides: Partial<Corner> = {}): Corner {
  return {
    index: 0,
    apexDistance: APEX_DISTANCE,
    apexSpeed: 80,
    brakingStartDistance: 0,
    exitDistance: 301,
    severity: "slow",
    ...overrides,
  };
}

function speedForApex(d: number, apexD: number): number {
  return d <= apexD ? 300 - (d / apexD) * 220 : Math.min(300, 80 + (d - apexD) * 4);
}

function buildSamples(apexD: number, throttleAt: (d: number) => number): TelemetrySample[] {
  const samples: TelemetrySample[] = [];
  for (let d = 0; d <= 300; d += 10) {
    samples.push(
      makeSample({
        lapDistance: d,
        sessionTime: d / 50,
        speed: speedForApex(d, apexD),
        throttle: throttleAt(d),
        brake: 0,
      })
    );
  }
  return samples;
}

function rampThrottle(apexD: number, onD: number) {
  return (d: number) => {
    if (d < apexD) return 0;
    if (d >= onD) return 1;
    return (d - apexD) / (onD - apexD);
  };
}

test("throttleOnDiffM negativo quando a volta principal voltou ao acelerador antes", () => {
  const primary = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 180));
  const comparison = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 220));

  const result = analyzeThrottle(corner(), primary, comparison);

  assert.equal(result.throttleOnDiffM, -40);
  assert.equal(result.fullThrottlePrimary, true);
  assert.equal(result.fullThrottleComparison, true);
});

test("throttleOnDiffM positivo quando a volta principal voltou ao acelerador depois", () => {
  const primary = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 220));
  const comparison = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 180));

  const result = analyzeThrottle(corner(), primary, comparison);

  assert.equal(result.throttleOnDiffM, 40);
});

test("coastingTime soma o tempo sem freio nem acelerador do ponto mais lento até a retomada", () => {
  const primary = buildSamples(APEX_DISTANCE, (d) => {
    if (d < APEX_DISTANCE + 50) return 0; // coasting puro por 50m
    return rampThrottle(APEX_DISTANCE + 50, APEX_DISTANCE + 80)(d);
  });
  const comparison = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, APEX_DISTANCE + 10));

  const result = analyzeThrottle(corner(), primary, comparison);

  // amostras de 150 a 200 m (acelerador 0), 0,2 s cada uma
  assert.equal(result.coastingTimePrimaryS, 1.2);
  // a de comparação tem 0 de acelerador só na amostra do ponto mais lento
  assert.equal(result.coastingTimeComparisonS, 0.2);
});

test("throttleOscillation conta reversões de direção do acelerador", () => {
  const pattern = new Map<number, number>([
    [150, 0],
    [160, 0.4],
    [170, 0.1],
    [180, 0.5],
    [190, 0.15],
    [200, 0.6],
    [210, 0.2],
    [220, 0.7],
    [230, 0.95],
  ]);
  const primary = buildSamples(APEX_DISTANCE, (d) => pattern.get(d) ?? (d < APEX_DISTANCE ? 0 : 1));
  const comparison = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, APEX_DISTANCE + 1));

  const result = analyzeThrottle(corner(), primary, comparison);

  assert.equal(result.throttleOscillationPrimary, 6);
  assert.equal(result.throttleOscillationComparison, 0);
});

test("sem acelerador pleno antes do fim do trecho: booleano false, diferença null e coasting até o fim do trecho", () => {
  const primary = buildSamples(APEX_DISTANCE, () => 0); // nunca volta ao acelerador
  const comparison = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 180));

  const result = analyzeThrottle(corner({ exitDistance: 250 }), primary, comparison);

  assert.equal(result.fullThrottlePrimary, false);
  assert.equal(result.fullThrottleComparison, true);
  assert.equal(result.throttleOnDiffM, null);
  // do ponto mais lento (150 m) à última amostra do trecho (240 m): 9 intervalos de 0,2 s
  assert.equal(result.coastingTimePrimaryS, 1.8);
});

test("a retomada de outra curva, depois do fim do trecho, não vira a desta", () => {
  // acelerador pleno só a partir de 260 m, fora do trecho que termina em 250 m
  const late = buildSamples(APEX_DISTANCE, (d) => (d >= 260 ? 1 : d >= APEX_DISTANCE ? 0.5 : 0));
  const comparison = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 180));

  const result = analyzeThrottle(corner({ exitDistance: 250 }), late, comparison);

  assert.equal(result.fullThrottlePrimary, false);
  assert.equal(result.throttleOnDiffM, null);
});

test("trocar as voltas inverte throttleOnDiffM e troca os booleanos", () => {
  const a = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 180));
  const b = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 220));
  assert.equal(analyzeThrottle(corner(), a, b).throttleOnDiffM, -40);
  assert.equal(analyzeThrottle(corner(), b, a).throttleOnDiffM, 40);

  const never = buildSamples(APEX_DISTANCE, () => 0);
  const forward = analyzeThrottle(corner({ exitDistance: 250 }), a, never);
  const backward = analyzeThrottle(corner({ exitDistance: 250 }), never, a);
  assert.equal(forward.fullThrottlePrimary, true);
  assert.equal(forward.fullThrottleComparison, false);
  assert.equal(backward.fullThrottlePrimary, false);
  assert.equal(backward.fullThrottleComparison, true);
});

test("sem amostras no trecho, devolve campos nulos/zerados em vez de inventar dado", () => {
  const primary = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 180));
  const comparison = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 180));
  const farCorner = corner({ apexDistance: 5000, brakingStartDistance: 4900, exitDistance: 5100 });

  const result = analyzeThrottle(farCorner, primary, comparison);

  assert.equal(result.throttleOnDiffM, null);
  assert.equal(result.fullThrottlePrimary, null);
  assert.equal(result.fullThrottleComparison, null);
  assert.equal(result.coastingTimePrimaryS, 0);
  assert.equal(result.throttleOscillationPrimary, 0);
});
