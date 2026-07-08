import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeBraking } from "./brakingAnalysis";
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

function buildSamples(brakeStartD: number, apexD: number, opts: { peakBrake?: number; steerDuringBrake?: number } = {}): TelemetrySample[] {
  const peakBrake = opts.peakBrake ?? 1;
  const steer = opts.steerDuringBrake ?? 0;
  const samples: TelemetrySample[] = [];

  for (let d = 0; d <= 300; d += 10) {
    let speed: number;
    if (d < brakeStartD) speed = 300;
    else if (d <= apexD) speed = 300 - ((d - brakeStartD) / (apexD - brakeStartD)) * 220;
    else speed = Math.min(300, 80 + (d - apexD) * 5);

    const braking = d >= brakeStartD && d < apexD;
    samples.push(
      makeSample({
        lapDistance: d,
        speed,
        brake: braking ? peakBrake : 0,
        steer: braking ? steer : 0,
      })
    );
  }

  return samples;
}

test("brakingPointDiffM negativo quando a volta principal freou antes", () => {
  const primary = buildSamples(100, APEX_DISTANCE);
  const comparison = buildSamples(120, APEX_DISTANCE);

  const result = analyzeBraking(corner(), primary, comparison);

  assert.ok(result.brakingPointDiffM !== null);
  assert.ok(result.brakingPointDiffM! < 0, `esperava negativo, foi ${result.brakingPointDiffM}`);
  assert.ok(Math.abs(result.brakingPointDiffM! - -20) <= 10, `esperava ~-20, foi ${result.brakingPointDiffM}`);
});

test("brakingPointDiffM positivo quando a volta principal freou depois", () => {
  const primary = buildSamples(120, APEX_DISTANCE);
  const comparison = buildSamples(100, APEX_DISTANCE);

  const result = analyzeBraking(corner(), primary, comparison);

  assert.ok(result.brakingPointDiffM! > 0);
});

test("peakBrakeDiff reflete a diferença de intensidade máxima de freio", () => {
  const primary = buildSamples(100, APEX_DISTANCE, { peakBrake: 1.0 });
  const comparison = buildSamples(100, APEX_DISTANCE, { peakBrake: 0.6 });

  const result = analyzeBraking(corner(), primary, comparison);

  assert.ok(result.peakBrakeDiff !== null);
  assert.ok(Math.abs(result.peakBrakeDiff! - 0.4) < 0.01, `esperava ~0.4, foi ${result.peakBrakeDiff}`);
});

test("detecta trail braking quando há freio + volante virado ao mesmo tempo", () => {
  const primary = buildSamples(100, APEX_DISTANCE, { steerDuringBrake: 0.3 });
  const comparison = buildSamples(100, APEX_DISTANCE, { steerDuringBrake: 0 });

  const result = analyzeBraking(corner(), primary, comparison);

  assert.equal(result.trailBrakingPrimary, true);
  assert.equal(result.trailBrakingComparison, false);
});

test("sem amostras perto do apex, devolve campos nulos em vez de inventar dado", () => {
  const primary = buildSamples(100, APEX_DISTANCE);
  const comparison = buildSamples(100, APEX_DISTANCE);
  const farCorner = corner({ apexDistance: 5000 });

  const result = analyzeBraking(farCorner, primary, comparison);

  assert.equal(result.brakingPointDiffM, null);
  assert.equal(result.peakBrakeDiff, null);
  assert.equal(result.trailBrakingPrimary, false);
  assert.equal(result.trailBrakingComparison, false);
});
