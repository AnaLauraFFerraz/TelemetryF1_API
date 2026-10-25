import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildInsights } from "./buildInsights";
import { lapBehaviourInStretch } from "./cornerBehaviour";
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
  assert.equal(pairs.length, 6, "os seis pares ordenados das voltas 6, 7 e 8");
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

// Pré-condição de toda propriedade por curva: o conjunto não é vazio. Sem
// ela, um motor que devolve zero curvas passa em qualquer "para toda curva".
const CORNERS_PER_PAIR = 8;

function requireCorners(pair: Pick<CutPair, "primaryLap" | "comparisonLap" | "insights">): void {
  assert.equal(
    pair.insights.corners.length,
    CORNERS_PER_PAIR,
    `(${pair.primaryLap},${pair.comparisonLap}): esperava ${CORNERS_PER_PAIR} curvas, veio ${pair.insights.corners.length}`
  );
}

test("a pré-condição das 8 curvas recusa um motor que devolve zero curvas", () => {
  const [pair] = cutPairs();
  requireCorners(pair);
  assert.throws(() => requireCorners({ ...pair, insights: { ...pair.insights, corners: [] } }), assert.AssertionError);
});

// Cada par não ordenado uma vez, com o seu inverso.
function pairsWithReverse(pairs: CutPair[]): [CutPair, CutPair][] {
  return pairs.filter((pair) => pair.primaryLap < pair.comparisonLap).map((pair) => [pair, reversePair(pairs, pair)]);
}

test("(A,B) e (B,A) têm as mesmas curvas: mesma contagem e mesmos ápices (SC-006)", () => {
  const pairs = cutPairs();
  for (const [forward, backward] of pairsWithReverse(pairs)) {
    requireCorners(forward);
    requireCorners(backward);
    const label = `(${forward.primaryLap},${forward.comparisonLap})`;
    const forwardApexes = forward.insights.corners.map((c) => c.corner.apexDistance);
    const backwardApexes = backward.insights.corners.map((c) => c.corner.apexDistance);
    assert.equal(forwardApexes.length, backwardApexes.length, `${label}: ${forwardApexes.length} curvas contra ${backwardApexes.length}`);
    assert.deepEqual(forwardApexes, backwardApexes, label);
  }
});

test("os trechos das curvas têm limites numéricos, contíguos e sem sobreposição (SC-004a)", () => {
  for (const pair of cutPairs()) {
    requireCorners(pair);
    const label = `(${pair.primaryLap},${pair.comparisonLap})`;
    const corners =pair.insights.corners.map((c) => c.corner);
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

// Oráculo: o comportamento de cada volta em cada curva, lido direto das
// amostras do recorte dentro do trecho que o motor reportou.
function behavioursOf(pair: CutPair, cut: RecordingCutInput) {
  const primary = cut.laps.find((lap) => lap.lapNumber === pair.primaryLap)!.telemetry;
  const comparison = cut.laps.find((lap) => lap.lapNumber === pair.comparisonLap)!.telemetry;
  return pair.insights.corners.map((insight) => {
    const { brakingStartDistance: from, exitDistance: to } = insight.corner;
    return {
      insight,
      primary,
      comparison,
      p: lapBehaviourInStretch(primary, from, to),
      c: lapBehaviourInStretch(comparison, from, to),
    };
  });
}

function findPair(pairs: CutPair[], primaryLap: number, comparisonLap: number): CutPair {
  const pair = pairs.find((p) => p.primaryLap === primaryLap && p.comparisonLap === comparisonLap);
  assert.ok(pair, `par (${primaryLap},${comparisonLap}) não encontrado`);
  return pair;
}

function cornerNear(pair: CutPair, apexDistance: number) {
  const found = pair.insights.corners.find((c) => Math.abs(c.corner.apexDistance - apexDistance) <= 20);
  assert.ok(found, `(${pair.primaryLap},${pair.comparisonLap}): sem curva perto de ${apexDistance} m`);
  return found;
}

test("a freada de cada volta em cada curva bate com as amostras do trecho, e é null se uma delas não freou (SC-003)", () => {
  const cut = loadCut();
  for (const pair of cutPairs()) {
    requireCorners(pair);
    behavioursOf(pair, cut).forEach(({ insight, primary, comparison, p, c }, i) => {
      const label = `(${pair.primaryLap},${pair.comparisonLap}) curva ${i} (${insight.corner.apexDistance} m)`;
      assert.ok(p && c, `${label}: volta sem amostras no trecho`);
      const bothBraked = p.brakingStartIndex !== null && c.brakingStartIndex !== null;
      const expectedDiff = bothBraked
        ? Math.round((primary[p.brakingStartIndex!].lapDistance - comparison[c.brakingStartIndex!].lapDistance) * 100) / 100
        : null;
      assert.equal(insight.braking.brakingPointDiffM, expectedDiff, `${label}: brakingPointDiffM`);
      assert.equal(insight.braking.brakedPrimary, p.brakingStartIndex !== null, `${label}: brakedPrimary`);
      assert.equal(insight.braking.brakedComparison, c.brakingStartIndex !== null, `${label}: brakedComparison`);
      assert.equal(insight.braking.peakBrakeDiff, Math.round((p.brakingPeak - c.brakingPeak) * 100) / 100, `${label}: peakBrakeDiff`);
    });
  }
});

test("os casos da pesquisa (seção 4): a freada do T1 e da última curva, e a curva em que a volta só tirou o pé", () => {
  const pairs = cutPairs();
  const diff = (a: number, b: number, apex: number) => cornerNear(findPair(pairs, a, b), apex).braking.brakingPointDiffM;
  assert.ok(Math.abs(diff(6, 7, 370)! - -16.7) <= 0.1, `(6,7) T1: ${diff(6, 7, 370)}`);
  assert.ok(Math.abs(diff(6, 8, 390)! - -10.0) <= 0.1, `(6,8) T1: ${diff(6, 8, 390)}`);
  assert.ok(Math.abs(diff(8, 6, 3275)! - -8.5) <= 0.1, `(8,6) última: ${diff(8, 6, 3275)}`);
  assert.ok(Math.abs(diff(7, 8, 3290)! - -11.8) <= 0.1, `(7,8) última: ${diff(7, 8, 3290)}`);

  const lifted = cornerNear(findPair(pairs, 6, 7), 2120);
  assert.equal(lifted.braking.brakedPrimary, true);
  assert.equal(lifted.braking.brakedComparison, false);
  assert.equal(lifted.braking.brakingPointDiffM, null);
});

test("nenhuma curva divide a mesma amostra de uma volta como ponto mais lento, início da freada ou retomada (SC-002)", () => {
  const cut = loadCut();
  for (const pair of cutPairs()) {
    requireCorners(pair);
    const behaviours = behavioursOf(pair, cut);
    for (const lap of ["p", "c"] as const) {
      for (const field of ["slowestIndex", "brakingStartIndex", "fullThrottleIndex"] as const) {
        const indexes = behaviours.map((b) => b[lap]![field]).filter((index): index is number => index !== null);
        assert.equal(new Set(indexes).size, indexes.length, `(${pair.primaryLap},${pair.comparisonLap}) volta ${lap}: ${field} repetido ${indexes}`);
      }
    }
    behaviours.forEach(({ insight, primary, comparison, p, c }, i) => {
      const label = `(${pair.primaryLap},${pair.comparisonLap}) curva ${i} (${insight.corner.apexDistance} m)`;
      assert.ok(p && c, `${label}: volta sem amostras no trecho`);
      const bothReached = p.fullThrottleIndex !== null && c.fullThrottleIndex !== null;
      const expectedDiff = bothReached
        ? Math.round((primary[p.fullThrottleIndex!].lapDistance - comparison[c.fullThrottleIndex!].lapDistance) * 100) / 100
        : null;
      assert.equal(insight.throttle.throttleOnDiffM, expectedDiff, `${label}: throttleOnDiffM`);
      assert.equal(insight.throttle.fullThrottlePrimary, p.fullThrottleIndex !== null, `${label}: fullThrottlePrimary`);
      assert.equal(insight.throttle.fullThrottleComparison, c.fullThrottleIndex !== null, `${label}: fullThrottleComparison`);
    });
  }
});

test("os casos da pesquisa (seção 5): a volta 6 não volta ao acelerador pleno no hairpin, e só a curva de 2.490 m leva a retomada de 2.593 m", () => {
  const pair = findPair(cutPairs(), 6, 7);
  const hairpin = cornerNear(pair, 2360);
  assert.equal(hairpin.throttle.fullThrottlePrimary, false);
  assert.equal(hairpin.throttle.throttleOnDiffM, null);

  const next = cornerNear(pair, 2490);
  assert.equal(next.throttle.fullThrottlePrimary, true);
  assert.ok(Math.abs(next.throttle.throttleOnDiffM! - 10.8) <= 0.1, `throttleOnDiffM ${next.throttle.throttleOnDiffM}`);
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
    requireCorners(forward);
    requireCorners(backward);
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
