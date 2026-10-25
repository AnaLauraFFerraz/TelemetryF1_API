import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildInsights } from "./buildInsights";
import { fromRecordingCut, RecordingCutInput } from "./recordingCutFormat";
import { LapInsights } from "./types";

const CUT_PATH = path.join(__dirname, "recordingCut.json");
const SOURCE_SHA256 = "c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033";
const MAX_CUT_BYTES = 660_000;

// Tolerâncias fixas (plan D6, research.md seção 14); nenhuma tarefa as alarga.
const SYMMETRY_TOLERANCE = 0.01 + 1e-9;
const OFFICIAL_TOLERANCE = 0.045;

function loadCut(): RecordingCutInput {
  assert.ok(fs.existsSync(CUT_PATH), "src/analysis/recordingCut.json não existe; gere com tools/exportRecordingCut.ts");
  return fromRecordingCut(fs.readFileSync(CUT_PATH, "utf8"));
}

interface CutPair {
  primaryLap: number;
  comparisonLap: number;
  officialDifferenceS: number;
  insights: LapInsights;
}

// Os seis pares ordenados das voltas 6, 7 e 8.
function cutPairs(): CutPair[] {
  const cut = loadCut();
  const pairs: CutPair[] = [];
  for (const primary of cut.laps) {
    for (const comparison of cut.laps) {
      if (primary === comparison) continue;
      pairs.push({
        primaryLap: primary.lapNumber,
        comparisonLap: comparison.lapNumber,
        officialDifferenceS: (primary.lapTimeMs - comparison.lapTimeMs) / 1000,
        insights: buildInsights({
          primaryTelemetry: primary.telemetry,
          comparisonTelemetry: comparison.telemetry,
          primaryMotion: primary.motion,
          comparisonMotion: comparison.motion,
        }),
      });
    }
  }
  return pairs;
}

function reversePair(pairs: CutPair[], pair: CutPair): CutPair {
  const reverse = pairs.find((p) => p.primaryLap === pair.comparisonLap && p.comparisonLap === pair.primaryLap);
  assert.ok(reverse, `par (${pair.comparisonLap},${pair.primaryLap}) não encontrado`);
  return reverse;
}

test("o recorte é o da gravação publicada: hash, voltas 6 a 8, tempos oficiais e validade", () => {
  const cut = loadCut();
  assert.equal(cut.sourceSha256, SOURCE_SHA256);
  assert.deepEqual(
    cut.laps.map((lap) => [lap.lapNumber, lap.lapTimeMs, lap.isValid]),
    [
      [6, 74306, false],
      [7, 74144, true],
      [8, 73372, true],
    ]
  );
  assert.deepEqual(
    cut.laps.map((lap) => [lap.telemetry.length, lap.motion.length]),
    [
      [797, 797],
      [801, 801],
      [793, 793],
    ]
  );
});

test("o recorte não passa do teto de 660.000 bytes", () => {
  loadCut();
  assert.ok(fs.statSync(CUT_PATH).size <= MAX_CUT_BYTES, `recordingCut.json tem mais de ${MAX_CUT_BYTES} bytes`);
});

test("totalDeltaS fica a 0,045 s da diferença oficial nos seis pares (SC-005)", () => {
  for (const pair of cutPairs()) {
    const error = Math.abs(pair.insights.totalDeltaS - pair.officialDifferenceS);
    assert.ok(
      error <= OFFICIAL_TOLERANCE,
      `(${pair.primaryLap},${pair.comparisonLap}): totalDeltaS ${pair.insights.totalDeltaS} contra ${pair.officialDifferenceS} oficial`
    );
  }
});

test("totalDeltaS de (A,B) mais o de (B,A) soma zero (SC-004)", () => {
  const pairs = cutPairs();
  for (const pair of pairs) {
    const sum = pair.insights.totalDeltaS + reversePair(pairs, pair).insights.totalDeltaS;
    assert.ok(Math.abs(sum) <= SYMMETRY_TOLERANCE, `(${pair.primaryLap},${pair.comparisonLap}): soma ${sum}`);
  }
});

// Cada par não ordenado uma vez, com o seu inverso.
function pairsWithReverse(pairs: CutPair[]): [CutPair, CutPair][] {
  return pairs.filter((pair) => pair.primaryLap < pair.comparisonLap).map((pair) => [pair, reversePair(pairs, pair)]);
}

test("(A,B) e (B,A) têm as mesmas curvas: mesma contagem e mesmos ápices (SC-006)", () => {
  const pairs = cutPairs();
  for (const [forward, backward] of pairsWithReverse(pairs)) {
    const label = `(${forward.primaryLap},${forward.comparisonLap})`;
    const forwardApexes = forward.insights.corners.map((c) => c.corner.apexDistance);
    const backwardApexes = backward.insights.corners.map((c) => c.corner.apexDistance);
    assert.equal(forwardApexes.length, backwardApexes.length, `${label}: ${forwardApexes.length} curvas contra ${backwardApexes.length}`);
    assert.deepEqual(forwardApexes, backwardApexes, label);
  }
});

test("os trechos das curvas têm limites numéricos, contíguos e sem sobreposição (SC-004a)", () => {
  for (const pair of cutPairs()) {
    const label = `(${pair.primaryLap},${pair.comparisonLap})`;
    const corners = pair.insights.corners.map((c) => c.corner);
    corners.forEach((corner, i) => {
      assert.ok(Number.isFinite(corner.brakingStartDistance) && Number.isFinite(corner.exitDistance), `${label} curva ${i}`);
      assert.ok(corner.brakingStartDistance < corner.exitDistance, `${label} curva ${i}`);
      if (i > 0) {
        assert.equal(
          corner.brakingStartDistance,
          corners[i - 1].exitDistance,
          `${label}: o trecho da curva ${i} (${corner.brakingStartDistance}–${corner.exitDistance}) não começa onde o da anterior termina (${corners[i - 1].exitDistance})`
        );
      }
    });
  }
});

function assertOpposite(forward: number | null, backward: number | null, label: string): void {
  if (forward === null || backward === null) {
    assert.equal(forward, backward, `${label}: nulo só em um dos sentidos (${forward} e ${backward})`);
    return;
  }
  assert.ok(Math.abs(forward + backward) <= SYMMETRY_TOLERANCE, `${label}: ${forward} e ${backward}`);
}

test("curva a curva, toda diferença e deltaLossS de (A,B) mais as de (B,A) somam zero (SC-004)", () => {
  const pairs = cutPairs();
  for (const [forward, backward] of pairsWithReverse(pairs)) {
    const pairLabel = `(${forward.primaryLap},${forward.comparisonLap})`;
    assert.equal(forward.insights.corners.length, backward.insights.corners.length, `${pairLabel}: número de curvas`);
    forward.insights.corners.forEach((f, i) => {
      const b = backward.insights.corners[i];
      const label = `${pairLabel} curva ${i} (${f.corner.apexDistance} m)`;
      assertOpposite(f.deltaLossS, b.deltaLossS, `${label} deltaLossS`);
      assertOpposite(f.braking.brakingPointDiffM, b.braking.brakingPointDiffM, `${label} brakingPointDiffM`);
      assertOpposite(f.braking.peakBrakeDiff, b.braking.peakBrakeDiff, `${label} peakBrakeDiff`);
      assertOpposite(f.throttle.throttleOnDiffM, b.throttle.throttleOnDiffM, `${label} throttleOnDiffM`);
      assert.equal(f.braking.trailBrakingPrimary, b.braking.trailBrakingComparison, `${label} trailBraking`);
      assert.equal(f.braking.trailBrakingComparison, b.braking.trailBrakingPrimary, `${label} trailBraking`);
    });
  }
});
