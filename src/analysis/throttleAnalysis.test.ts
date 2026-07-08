import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeThrottle } from "./throttleAnalysis";
import { makeSample } from "./testFixtures";
import { Corner, TelemetrySample } from "./types";

const APEX_DISTANCE = 150;

function corner(overrides: Partial<Corner> = {}): Corner {
  return {
    index: 0,
    apexDistance: APEX_DISTANCE,
    apexSpeed: 80,
    brakingStartDistance: 100,
    exitDistance: 200,
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

  assert.ok(result.throttleOnDiffM !== null);
  assert.ok(result.throttleOnDiffM! < 0, `esperava negativo, foi ${result.throttleOnDiffM}`);
});

test("throttleOnDiffM positivo quando a volta principal voltou ao acelerador depois", () => {
  const primary = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 220));
  const comparison = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 180));

  const result = analyzeThrottle(corner(), primary, comparison);

  assert.ok(result.throttleOnDiffM! > 0);
});

test("coastingTime soma o tempo sem freio nem acelerador entre apex e saída", () => {
  const primary = buildSamples(APEX_DISTANCE, (d) => {
    if (d < APEX_DISTANCE) return 0;
    if (d < APEX_DISTANCE + 50) return 0; // coasting puro por 50m
    return rampThrottle(APEX_DISTANCE + 50, APEX_DISTANCE + 80)(d);
  });
  const comparison = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, APEX_DISTANCE + 10));

  const result = analyzeThrottle(corner(), primary, comparison);

  assert.ok(result.coastingTimePrimaryS > 0, `esperava coasting > 0, foi ${result.coastingTimePrimaryS}`);
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

test("sem amostras perto do apex, devolve campos nulos/zerados em vez de inventar dado", () => {
  const primary = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 180));
  const comparison = buildSamples(APEX_DISTANCE, rampThrottle(APEX_DISTANCE, 180));
  const farCorner = corner({ apexDistance: 5000 });

  const result = analyzeThrottle(farCorner, primary, comparison);

  assert.equal(result.throttleOnDiffM, null);
  assert.equal(result.coastingTimePrimaryS, 0);
  assert.equal(result.throttleOscillationPrimary, 0);
});
