import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeBraking } from "./brakingAnalysis";
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

// Freio de brakeStartD até releaseD (padrão: o ápice), ponto mais lento em apexD.
function buildSamples(
  brakeStartD: number,
  apexD: number,
  opts: { peakBrake?: number; steerDuringBrake?: number; releaseD?: number; noBrake?: boolean } = {}
): TelemetrySample[] {
  const peakBrake = opts.peakBrake ?? 1;
  const steer = opts.steerDuringBrake ?? 0;
  const releaseD = opts.releaseD ?? apexD;
  const samples: TelemetrySample[] = [];

  for (let d = 0; d <= 300; d += 10) {
    let speed: number;
    if (d < brakeStartD) speed = 300;
    else if (d <= apexD) speed = 300 - ((d - brakeStartD) / (apexD - brakeStartD)) * 220;
    else speed = Math.min(300, 80 + (d - apexD) * 5);

    const braking = !opts.noBrake && d >= brakeStartD && d < releaseD;
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

  assert.equal(result.brakingPointDiffM, -20);
  assert.equal(result.brakedPrimary, true);
  assert.equal(result.brakedComparison, true);
});

test("brakingPointDiffM positivo quando a volta principal freou depois", () => {
  const result = analyzeBraking(corner(), buildSamples(120, APEX_DISTANCE), buildSamples(100, APEX_DISTANCE));
  assert.equal(result.brakingPointDiffM, 20);
});

test("com o freio solto 30 m antes do ponto mais lento, o início da freada é o toque no freio, não o ápice", () => {
  const primary = buildSamples(100, 180, { releaseD: 150 });
  const comparison = buildSamples(120, 180, { releaseD: 150 });

  const result = analyzeBraking(corner({ apexDistance: 180 }), primary, comparison);

  assert.equal(result.brakingPointDiffM, -20);
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

test("uma volta que só tirou o pé não freou: diferença do ponto de freada null, pico medido e booleano false", () => {
  const primary = buildSamples(100, APEX_DISTANCE, { peakBrake: 0.8 });
  const comparison = buildSamples(100, APEX_DISTANCE, { noBrake: true });

  const result = analyzeBraking(corner(), primary, comparison);

  assert.equal(result.brakedPrimary, true);
  assert.equal(result.brakedComparison, false);
  assert.equal(result.brakingPointDiffM, null);
  assert.equal(result.peakBrakeDiff, 0.8);
  assert.equal(result.trailBrakingComparison, false);
});

test("nenhuma das duas freou: ponto de freada null, pico igual a zero, os dois booleanos false", () => {
  const primary = buildSamples(100, APEX_DISTANCE, { noBrake: true });
  const comparison = buildSamples(100, APEX_DISTANCE, { noBrake: true });

  const result = analyzeBraking(corner(), primary, comparison);

  assert.equal(result.brakedPrimary, false);
  assert.equal(result.brakedComparison, false);
  assert.equal(result.brakingPointDiffM, null);
  assert.equal(result.peakBrakeDiff, 0);
});

// Duas zonas de frenagem com ápices a 65 m um do outro (100 e 165 m), cada uma
// no seu trecho.
function twoZoneLap(brakeStarts: [number, number]): TelemetrySample[] {
  const apexes = [100, 165];
  const samples: TelemetrySample[] = [];
  for (let d = 0; d <= 300; d += 10) {
    const speed = Math.min(300, ...apexes.map((a) => 80 + 4 * Math.abs(d - a)));
    const braking = brakeStarts.some((start, i) => d >= start && d < apexes[i]);
    samples.push(makeSample({ lapDistance: d, speed, brake: braking ? 1 : 0 }));
  }
  return samples;
}

test("duas curvas vizinhas medem cada uma a sua própria freada, sem dividir pontos", () => {
  const primary = twoZoneLap([40, 135]);
  const comparison = twoZoneLap([60, 145]);
  const first = corner({ index: 0, apexDistance: 100, brakingStartDistance: 0, exitDistance: 130 });
  const second = corner({ index: 1, apexDistance: 165, brakingStartDistance: 130, exitDistance: 301 });

  assert.equal(analyzeBraking(first, primary, comparison).brakingPointDiffM, -20);
  assert.equal(analyzeBraking(second, primary, comparison).brakingPointDiffM, -10);
});

test("trocar as voltas inverte as diferenças e troca os booleanos", () => {
  const a = buildSamples(100, APEX_DISTANCE, { peakBrake: 0.8 });
  const b = buildSamples(120, APEX_DISTANCE, { peakBrake: 0.5 });
  const forward = analyzeBraking(corner(), a, b);
  const backward = analyzeBraking(corner(), b, a);
  assert.equal(forward.brakingPointDiffM, -20);
  assert.equal(backward.brakingPointDiffM, 20);
  assert.equal(forward.peakBrakeDiff, 0.3);
  assert.equal(backward.peakBrakeDiff, -0.3);

  const lifted = buildSamples(100, APEX_DISTANCE, { noBrake: true });
  const mixed = analyzeBraking(corner(), a, lifted);
  const mixedReverse = analyzeBraking(corner(), lifted, a);
  assert.equal(mixed.brakedPrimary, true);
  assert.equal(mixedReverse.brakedPrimary, false);
  assert.equal(mixed.brakedComparison, mixedReverse.brakedPrimary);
  assert.equal(mixed.peakBrakeDiff, 0.8);
  assert.equal(mixedReverse.peakBrakeDiff, -0.8);
});

test("sem amostras no trecho, devolve campos nulos em vez de inventar dado", () => {
  const primary = buildSamples(100, APEX_DISTANCE);
  const comparison = buildSamples(100, APEX_DISTANCE);
  const farCorner = corner({ apexDistance: 5000, brakingStartDistance: 4900, exitDistance: 5100 });

  const result = analyzeBraking(farCorner, primary, comparison);

  assert.equal(result.brakingPointDiffM, null);
  assert.equal(result.peakBrakeDiff, null);
  assert.equal(result.trailBrakingPrimary, false);
  assert.equal(result.trailBrakingComparison, false);
  assert.equal(result.brakedPrimary, null);
  assert.equal(result.brakedComparison, null);
});
